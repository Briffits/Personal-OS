# Health presentation lifecycle investigation

Baseline: `ec73bb95c5f409715dfd163e4a2c58961be328e0`.

## Finding and limits

The supplied normal-Run trace reaches the bridge, selects an attached foreground
key-window root with no transition, retains the host, and observes SwiftUI appear.
At `host.presentationCompleted`, the host is attached but `transition=true`.
Readiness is published roughly 0.24 ms later and the trigger changes roughly
0.28 ms after that UIKit callback. Apple's success callback follows roughly 28 ms
after the trigger, on a background thread. Main-thread cleanup dismisses the host
before resolving the promise. No early host release or missing trigger is shown.
The user saw no sheet and made no selection or cancellation. Success here means
API completion, not visible presentation, interaction, or granted read access.

The trace exposes a readiness assumption worth correcting. It does not capture
transition state at the exact trigger instant, nor prove that overlap caused the
missing sheet. The new guard is a focused lifecycle correction, not a confirmed
fix for Apple's no-sheet completion.

Normal Run uses MedicationScreen → TS adapter → Objective-C bridge → module's
main-queue dispatch → presenter. The successful direct XCTest calls the same
presenter source on the main actor, compiled into the hosted test target, bypassing
RN and its bridge. Test launch timing, hierarchy and singleton instance differ.
The test's accepted completion alone does not assert visibility; the earlier
user-observed sheet applies only to that earlier run. Compare both paths on the
same new build, device and configuration.

## Apple contracts and implementation

- [present completion](https://developer.apple.com/documentation/uikit/uiviewcontroller/present(_:animated:completion:)) occurs after viewDidAppear; it is not an assertion that the coordinator property is already nil inside the callback.
- [transitionCoordinator](https://developer.apple.com/documentation/uikit/uiviewcontroller/transitioncoordinator) describes an active transition, potentially inherited from an ancestor.
- [animate alongside transition](https://developer.apple.com/documentation/uikit/uiviewcontrollertransitioncoordinator/animate(alongsidetransition:completion:)) supplies a completion after transition; Apple explicitly says its completion may still run when registration returns false.
- [Per-object Health authorization](https://developer.apple.com/documentation/swiftui/view/healthdataaccessrequest(store:objecttype:predicate:trigger:completion:)) uses a State change, always requests permission regardless of previous grants, and can complete on a background queue. The type-wide overload's no-prompt behavior is not an explanation for this API.

The presenter waits for the available coordinator's completion, then leaves the
UIKit callback stack through the main queue. If registration is too late, it
checks on the next main-queue turn. Both routes deliver only once. A queue turn
alone does not authorize triggering: the host must still be in the foreground
key window, have a matching presenting relationship, have no presented child,
and neither host nor presenter may be presenting, dismissing or transitioning.
Cancelled or unsettled state fails through the existing dismissal/error path.
There is no sleep, polling loop or deferred foreground retry. The retained-host
single-request guard, finishing guard, State trigger, error sanitization and
main-thread completion handling remain. No Health queries, permission resets,
stock changes, dependencies or configuration changes were added.

## Separate Metro finding (read-only inspection)

Debug AppDelegate uses RCTBundleURLProvider; Release uses embedded main.jsbundle.
In installed RN 0.87.1, RCTBundleURLProvider falls back to main.jsbundle when the
packager status check cannot find a reachable host. The Xcode bundle phase calls
react-native-xcode.sh, which normally bundles for physical Debug devices unless
SKIP_BUNDLING is set. The tracked .xcode.env only locates Node; this workspace has
no .xcode.env.local. The Mac's untracked overrides and installed artifact were
not available to inspect.

RCTPackagerConnection falls back to localhost when no server location is found.
RCTInspectorDevServerHelper builds open-debugger using the bundle URL's scheme.
Thus the reported status timeout, localhost failure and file-scheme debugger URL
are consistent with embedded-bundle fallback. They do not prove its age. Mac curl
proves local Metro service, not iPhone reachability. An old installed bundle or
skipped bundling could run stale JS and invalidate UI/bridge comparisons; a fresh
embedded bundle is valid for this offline authorization-only path. These logs
do not establish the Health presentation cause: the native request and trigger
are already evidenced. No network or fallback configuration was changed.

## Checks and exact device acceptance

Linux checks passed: focused Jest (`npm test -- --runInBand MedicationScreen
NativeMedicationHealth`), 2 suites / 75 tests; `npx tsc --noEmit`; `npm run lint`;
`git diff --check`. Jest covers duplicate requests, completion/cancellation/error,
retry, and absence of queries/writes. It cannot validate UIKit.

Added native tests cover deferred rejection of a detached host, nonanimated and
animated hosting presentation, rejection during animation, and readiness lost
after dismissal, without a Health modifier or data operations. Existing completion
mapping tests remain. Swift/Xcode/Apple SDKs are unavailable here: these tests,
native compilation and real-device behavior remain unverified.

1. On the Mac, use the committed revision, preserving signing/bundle identity and
   the existing app installation. Record full revision, local diffs, Xcode/SDK/iOS
   versions. Do not uninstall, reset permissions, or change Health/stock data.
2. Open `ios/PersonalOS.xcworkspace`, select PersonalOS and the physical iPhone
   running iOS 26+. Build Debug. Inspect the build log for successful current
   `Bundle React Native code and images` output and no skipped bundling. Record
   whether the running bundle URL is Metro HTTP(S) or embedded file (via debugger
   inspection at bundleURL return). For fallback, verify main.jsbundle in the
   newly built .app was regenerated from this checkout and that this artifact
   was installed. Do not assume Mac curl establishes device connectivity or
   change network settings for this test.
3. Run only `testAuthorizationReadinessRejectsDetachedHostAsynchronously`,
   `testAuthorizationReadinessAfterHostingPresentation`, and
   `testAuthorizationCompletionMapping` in MedicationNativeTests. Require actual
   passes; a foreground-context skip is not lifecycle validation.
4. Disable both PERSONALOS_AUTHORIZATION_SMOKE_TEST and
   PERSONALOS_SYNTHETIC_HEALTH_TESTS for Run. Product → Run; keep the unlocked app
   foregrounded, open Library → Medication using the already-initialized
   collection, and let navigation/loading settle.
5. Filter the console to `[MedicationAuthorization]`. Tap **Request Apple Health
   medication access** once. Require `host.ready` before readiness/trigger true,
   with attached/key/foreground/presenting true, presented/transition/appearing/
   dismissing false. `host.presentationCompleted` may still have transition true.
   A `host.readinessRejected` must reject, clean up and restore controls; it is
   not a successful visible-sheet acceptance result.
6. Visually verify Apple's sheet. Cancel without selecting anything. Record the
   observed interaction separately from the callback code: only Apple's explicit
   cancellation error maps to authorization-cancelled. Require one settlement
   after dismissal and host release. If no sheet appears, record **no sheet, no
   interaction**, retain the sanitized trace and mark acceptance failed even if
   the callback reports success. Do not query Health to investigate.
7. Verify controls and VoiceOver focus remain usable; navigate to Library and
   Today, return and repeat once. Check no automatic prompt, stuck transparent
   host, crash or duplicate settlement. Do not edit/link/unlink or change stock.
8. For comparison run only `testAuthorizationPresenterSmoke` with
   PERSONALOS_AUTHORIZATION_SMOKE_TEST=1 in the Test environment and the synthetic
   flag disabled. Observe the sheet and cancel; compare readiness/transition
   flags with normal Run (no bridge logs are expected in this test). Disable the
   opt-in afterward. Never run the real-identifier/query test in this investigation.

If normal Run still completes without a sheet after a valid `host.ready`, this
correction has not resolved the symptom; retain the hypothesis as unconfirmed
and investigate SwiftUI/HealthKit presentation with the new evidence.
