# Native medication-sheet comparison

Branch: `diag/health-authorization-native-comparison`.
Base: `24c746bea38fb080cdaaf5da6e0cc637351b5e11`.
**Implementation prepared; native compilation, signing and device execution pending.**
No presentation acceptance or successful native build is claimed.

This independent iPhone diagnostic compares S (persistent SwiftUI root) with M
(retained modal), using one executable, scheme and app identity. It uses only
Apple frameworks and requires iOS 26+ and an Xcode installation with iOS 26+ SDK.
No packages, Pods, Metro, React Native or XCTest host are involved. No PersonalOS
runtime, project, signing configuration or installed app is changed.

## Evidence motivating the comparison

At `59f9748`, both hosted-test arms completed their callback/lifetime/cleanup
checks but showed no Apple sheet, including B's ten-second retained host. At
`24c746b`, the user confirmed the correct Today diagnostic control and Metro
serving the isolated checkout. Normal Run was interactive (Library → Today)
before one tap. No Apple medication sheet appeared; the reported notice was
“Request Completed. Sheet appearance and read access not verified.” Navigation
remained usable. Early hosted-test startup overlap is not necessary for this
reported failure; a cause is not established.

Later Medication entry paused Xcode at
`com.facebook.react.runtime.JavaScript: breakpoint 1.1 (1)`. The source location
is unconfirmed. This is a separate unresolved debugger pause, **not a classified
app hang**. That later navigation is outside the storage-free Today procedure.
See the [manual control's record](../../app/HEALTH_MANUAL_AFTER_STARTUP_DIAGNOSTIC.md).

## Identity, opt-in and data boundary

- App: **Health Presentation Diagnostic**. Bundle ID:
  `org.personalos.diagnostics.HealthAuthorizationComparison`. One target and one
  shared scheme: **HealthAuthorizationComparison**. Signing team is deliberately
  blank in source. Choose a signable diagnostic identity once during setup and
  use it unchanged for S and M; never substitute PersonalOS's bundle ID.
- **This app has its own permission state.** It does not inherit PersonalOS's
  grants or share its container/Keychain groups. Even on the same phone, results
  cannot establish what PersonalOS's identity would do. Preserve both apps and
  Health settings; do not reset permissions or uninstall either app to compare.
- The shared Run scheme ships with `PERSONALOS_NATIVE_HEALTH_PATH` **disabled**.
  Missing/invalid values are inert. Only exact `S` or `M` in a Debug process opts
  in. Release is inert even with that variable. No selection is persisted.
- An opted-in normal Run makes **one request from root appearance**. There is no
  retry button, foreground retry, completion retry or in-session arm switch.
  The sole button only increments an in-memory counter to check interaction.
- Only HealthKit capability and `NSHealthShareUsageDescription` are configured.
  The availability Boolean is checked, but there are no Health queries, permission
  status queries, Health writes, storage operations or networking. Nothing reads
  PersonalOS collections. Only transient UI state and sanitized console events
  are produced. Apple controls the authorization sheet; cancel without selecting
  or changing anything. Completion never asserts readable access.

## Patterns and explicit departures

S is adapted from `MedsSymptomsLoggingApp.swift` in Apple's
[Logging symptoms associated with a medication sample](https://developer.apple.com/documentation/healthkit/logging-symptoms-associated-with-a-medication).
The sample license is retained in [APPLE_SAMPLE_LICENSE.txt](APPLE_SAMPLE_LICENSE.txt).
The source archive reviewed was `dbe02a347c0c/LoggingSymptomsAssociatedWithAMedication.zip`.

| S property | Implementation and departure |
| --- | --- |
| Root and store | Modifier remains on content directly inside `WindowGroup`. A static app-lifetime `HKHealthStore` replaces `HealthStore.shared.healthStore`; no query-bearing wrapper is copied. |
| Trigger | App-level State starts false and toggles in `.onAppear`, preserving the sample order. An explicit opt-in, availability check and one-shot guard are added. |
| Request | Same `userAnnotatedMedicationType()` and omitted/default nil predicate. Explicit `HealthKitUI` import is added. |
| Completion | Keeps the sample's `@Sendable` callback and `Task { @MainActor ... }` handoff. Root/modifier remain mounted throughout completion and observation. |
| Content | Query-bearing tabs, medication/dose/chart models and all symptom authorization/writes are removed. Inert status text and an interaction counter replace them. |
| Outcomes | The sample's authorization Boolean/raw error output is replaced by sanitized callback reporting, timing and bounds. No “access granted” state. |

M derives from `app/ios/MedicationHealthAuthorization.swift` at
`59f9748a3110ec94c39938b738faf99f25ef0242`, whose native files are unchanged at
`24c746b`. The prerequisite comes from that revision's
`MedicationNativeTests.authorizationPresentationContextIsReady` and
`testAuthorizationPresenterSmoke` (in `app/ios/tests/MedicationHealthTests.swift`).

| M property | Implementation and departure |
| --- | --- |
| Host | Preserves clear content/background, nonanimated `.overFullScreen`, `isModalInPresentation`, retained hosting controller and top-presented-controller selection. No blue host. |
| Request state | Preserves per-request State store/false trigger, explicit nil predicate, UIKit presentation-completion readiness and `.onReceive` false → true change. No `ce7e054` readiness gate or new pre-request delay. |
| Prerequisite | Preserves ten-second bounded foreground/settled-chain checks at 50 ms async intervals; invoke once immediately when ready. |
| Callback/lifetime | Preserves `DispatchQueue.main.async` handoff and ten seconds from first callback main handoff before dismiss/release/delivery, including false/error callbacks. |
| Harness | Retained B only: remove A, XCTest expectations, environment flags and test compilation guard. `ComparisonObservation` owns one presenter instead of a product singleton; deadlines/reporting replace XCTest expectations. No bridge/reader/storage code is copied. Minimum deployment 26 replaces runtime OS guards. |
| Additional diagnostics | Raw callback arrival, SwiftUI appearance, State transition, scene activity and cleanup are logged. Sanitized enum distinguishes success true/false, cancellation error and other error. Observation is separate from caller delivery. Instrumentation can affect timing. |
| Failure cleanup | Add readiness invalidation and a late UIKit-completion guard, so timeout/backgrounding cannot issue a deferred request. Add a bounded five-second detach/dismiss check instead of trusting a dismissal callback alone. A failed bound keeps a failure result; a late UIKit completion may release the host but cannot issue a request or rewrite the outcome. |

The modal's completion property retains the tested non-Sendable function type;
no concurrency annotation correction is bundled into M. Record any SDK warning
separately. If the installed compiler rejects this pattern, stop and review the
minimum required adaptation before calling the run comparable. Both paths use
Swift 5 language mode, with the installed compiler/SDK recorded on Mac.

Apple's [per-object contract](https://developer.apple.com/documentation/swiftui/view/healthdataaccessrequest(store:objecttype:predicate:trigger:completion:))
supports nil and a changing State trigger and documents background completion.
It does not prescribe a persistent root. These are **two full presentation
patterns**; a split result does not isolate root placement, trigger delivery or
store lifetime by itself. This reduced S path is not a previously verified
positive control or an unmodified Apple sample run.

## Timing, observations and cleanup

The UI always separates **sheet visibility**, **manual cancellation**, **callback**
and **cleanup**. The first two require human observation and remain explicitly
unverified in the app. Record them in the worksheet below; do not infer them
from the callback or update them automatically. No private Health screenshots
or records should enter repository evidence.

Trace prefix: `[NativeHealthComparison]`. Fields are selected path, monotonic
uptime, main-thread Boolean, fixed event names and sanitized callback enum only.
Record `callback.raw` separately from `callback.main`; the ten-second deadline
is anchored on entry to the first accepted main callback handler. Duplicate
callbacks are logged but cannot restart the window or deliver twice.

- M prerequisite: at most **10 seconds**, with no request on failure.
- Callback wait: at most **120 seconds** from request initiation.
- Observation: **10 seconds** after first callback main handoff in both paths.
- M cleanup: at most **5 seconds**. Accept completion only after the host is
  detached and its retained reference is cleared. A timeout reports failure and
  instructs the operator to stop Run; late release is logged without changing it.
- S keeps its root. It has no app-owned modal to dismiss and makes no claim to
  dismiss Apple's UI programmatically. After timeout, cancel any visible sheet
  and stop Run. Root retention is not proof of Apple-sheet disappearance.
- Backgrounding interrupts an active comparison and cancels timers/readiness;
  M attempts cleanup, S retains its root. No automatic request occurs on return.
  Scene inactivity alone is logged, not treated as failure: system sheets can
  themselves take focus. Mark an external lock/interruption/debugger pause in
  the worksheet. Async deadlines cannot run while the process is suspended or
  debugger-paused; such a run is not a valid timing comparison.
- Cleanup can itself remove a visible sheet. Record **cleanup dismissal** if
  that happens; it is not physical cancellation. Callbacks after cleanup/timeout
  are logged and ignored, never converted into a successful run.

## Mac setup and run sequence

1. Obtain this committed branch using the existing local transfer workflow.
   It has **not been pushed or merged**. If using the supplied incremental Git
   bundle, the Mac repository must already contain base `24c746b`:

   ```sh
   git bundle verify /path/to/personalos-health-native-comparison.bundle
   git fetch /path/to/personalos-health-native-comparison.bundle diag/health-authorization-native-comparison:diag/health-authorization-native-comparison
   git worktree add ../PersonalOS-native-health diag/health-authorization-native-comparison
   cd ../PersonalOS-native-health
   git rev-parse HEAD
   git status --short
   ```

   Match HEAD to the full delivered commit. Preserve the existing PersonalOS
   checkout and its local signing/work. No reset, package install or Pod install.

2. Run the portable audit and record the actual toolchain:

   ```sh
   python3 diagnostics/HealthAuthorizationComparison/check_project.py
   xcodebuild -version
   xcrun --sdk iphoneos --show-sdk-version
   cd diagnostics/HealthAuthorizationComparison
   xcodebuild -list -project HealthAuthorizationComparison.xcodeproj
   ```

   Open **HealthAuthorizationComparison.xcodeproj**, not PersonalOS's workspace.
   Select **HealthAuthorizationComparison** and the same unlocked physical iPhone
   running iOS 26+. Record actual iOS version and local configuration differences.

3. In this diagnostic target's **Signing & Capabilities**, select your existing
   development team and automatic signing. Leave the diagnostic bundle ID if it
   is provisionable; otherwise choose one unique diagnostic ID now, once, for
   both configurations/paths. Verify it is different from PersonalOS. HealthKit
   is the only added capability. Do not modify PersonalOS signing or install a
   build with its bundle ID. Keep local signing edits/private details uncommitted.

4. Build Debug and Release without launching a Health request:

   ```sh
   xcodebuild -project HealthAuthorizationComparison.xcodeproj -scheme HealthAuthorizationComparison -configuration Debug -destination 'generic/platform=iOS' -derivedDataPath /tmp/personalos-native-health-build build
   xcodebuild -project HealthAuthorizationComparison.xcodeproj -scheme HealthAuthorizationComparison -configuration Release -destination 'generic/platform=iOS' -derivedDataPath /tmp/personalos-native-health-build build
   codesign -d --entitlements :- /tmp/personalos-native-health-build/Build/Products/Debug-iphoneos/HealthAuthorizationComparison.app
   plutil -p /tmp/personalos-native-health-build/Build/Products/Debug-iphoneos/HealthAuthorizationComparison.app/Info.plist
   ```

   Inspect actual signed bundle identity, HealthKit entitlement and read-purpose
   string; no Health write, clinical, background or shared app/Keychain groups.
   Keep full signing output private. Record warnings/errors. Portable checks do
   not establish these facts for the built app.

5. **Edit Scheme → Run → Info → Debug**. Leave the path environment variable
   disabled in **Run → Arguments**; disable diagnostic breakpoints. Product → Run
   must show **Inert — no path opt-in**, no Health request, and a working counter.
   Also check an invalid value (e.g. `invalid`) is inert. Check Release with `S`
   supplied is inert in a separate setup launch, then restore **Debug**, disable
   the variable and rebuild before the comparison. No Health data is needed for
   these negative checks. No XCTest or Metro is required.

6. Enable exactly `PERSONALOS_NATIVE_HEALTH_PATH=S` in Run's environment. Start
   a fresh normal Run and observe continuously from launch: appearance initiates
   the request. Confirm path S in the console. If Apple's recognizable medication
   sheet appears, cancel promptly **without changing any selection**. Record its
   onset, cancellation tap and disappearance independently. An unidentified flash
   is uncertain visibility; a generic host is not the Apple sheet.

7. Observe through the ten-second post-callback window and cleanup reporting,
   then test the interaction counter. Record no sheet/no interaction when none
   appeared. If no callback arrives, use the 120-second timeout instructions.
   Stop Run on cleanup failure or interruption; preserve sanitized evidence.

8. Stop Run, change only the environment value to **M**, and repeat steps 6–7.
   Preserve the same build, installed app, identity, signing, phone and Health
   state. M retains its host for ten seconds after callback; observe through
   dismissal and the five-second cleanup allowance.

9. Repeat **M then S**, each from a fresh process: minimum sequence **S → M → M → S**.
   Do not uninstall, reset permissions, select/add medications, open PersonalOS
   collections or run Apple's full sample. Disable the opt-in afterward. Any
   VoiceOver/large-text or background/lock checks are separate labeled runs, not
   inserted into the controlled four-run comparison.

## Result worksheet and acceptance

Record build/commit, local diff, actual Xcode/SDK/iOS and selected identity once
per session; retain private identity/device details locally. For each run:

| Field | Value to record |
| --- | --- |
| Path / sequence | S1, M1, M2, S2 |
| Request / trigger / raw callback / main callback | Monotonic times or absent |
| Apple sheet | Recognizable / none / uncertain; onset before/after callback |
| Manual cancellation | Actual tap yes/no; do not infer from cancellation error |
| Disappearance | Manual cancellation / diagnostic cleanup / other / unverified |
| Callback | successTrue / successFalse / cancellationError / otherError / absent; duplicates separately |
| Observation | Start/end and elapsed duration; host retention separately |
| Cleanup | Root intentionally retained / modal detached and reference released / timeout / late release |
| Interaction afterward | Counter responsive / blocked / not checked |
| Interruptions | Background/lock/debugger pause/termination; sanitized source/line if known |

Presentation acceptance requires a recognizable sheet, actual manual cancel,
disappearance and usable native content, reproduced from a fresh launch. Callback
success, retained objects and a usable counter alone do not pass it. Read access
is never tested here. Errors, setup failures, interrupted runs and timeouts are
distinct from callback success with no visible sheet.

If S presents and M does not, the modal pattern can reproduce failure without RN,
but the responsible pattern difference is unresolved. If both present, investigate
PersonalOS host/configuration differences. If neither presents, there is no
positive control: inspect the reduction and built configuration before claiming
an OS defect. If only M presents, investigate S's reduction/activation. Separate
diagnostic permission state limits every comparison back to PersonalOS, whose
normal RN path would still require its own acceptance after any eventual fix.

## Validation status

- Portable `check_project.py`: passed. Parses project graph, validates target/source
  membership, one identity, plist/scheme/disabled opt-in and source API boundaries.
  It is a static audit, not a Swift parser/typechecker or native execution test.
- Five temporary-copy negative checks passed: the audit rejected enabled default
  opt-in, identity mismatch, dangling project reference, Health query API and
  persistent storage API. No altered fixture was retained in the repository.
- Source review covers opt-in and one-shot guards, duplicate/late callback handling,
  background invalidation, bounded observation/cleanup, and separation of human
  visibility/cancellation from automated outcomes.
- Whitespace, relative documentation links and sensitive-pattern review passed.
  All 140 base files outside the two documentation updates were compared byte for
  byte with `24c746b`; the original worktree's 138 recorded files also remained
  unchanged. Existing local work was not copied into this commit.
- Swift compiler, Xcode and Apple SDK are unavailable in this Linux environment.
  **Debug/Release compilation, signing, actual scheme loading, device timing,
  permissions UI, cleanup, VoiceOver and Dynamic Type remain pending.**
- The Mac sequence above is the acceptance procedure. Do not run the product's
  broader Health integration or real-identifier tests for this comparison.

## D: direct per-object API follow-up (Debug only)

S1 → M1 → M2 → S2 observations and source review are preserved uncommitted in
[reports/native-comparison-review](reports/native-comparison-review/REVIEW.md).
Only S1 visibly presented; subsequent S and M attempts returned quickly without
presentation. This does not establish a modal-specific failure or read access.

D adds an explicit `PERSONALOS_NATIVE_HEALTH_PATH=D` Debug-only opt-in. Release
remains inert. Missing or invalid opt-in remains inert. S and M request patterns
are unchanged. D has no Health modifier and makes no request from appearance.
It uses `HKHealthStore.requestPerObjectReadAuthorization` for
`.userAnnotatedMedicationType()` with `predicate: nil`, only after tapping
**D: Request Apple medication-selection sheet once** on the interactive screen.
No query, permission-status probe, storage, networking or Health write is added.

The manual tap consumes the process's sole attempt, including unavailable Health
or failed context. D waits at most 10 seconds for settled foreground context,
then starts the existing 120-second callback bound and 10-second post-main-
callback observation. Backgrounding interrupts the attempt with no retry. Scene
inactivity alone is logged. The root/store remain retained; no app modal exists.
The API has no cancellation token: timeout does not cancel Apple's request.
A completion closure retains the observer/store until callback delivery, even
if late; late/duplicate callbacks are logged and cannot restart the observation.

D logs raw callback Bool separately from error domain/code and the existing
outcome enum, with separate raw/main timing. Domain is a maximum 96-character
sanitised token; error descriptions/userInfo and Health objects are never logged.
No-error is `errorDomain=none errorCode=none`. A non-nil error is preserved even
if the Bool is true. Neither Bool nor error category proves sheet visibility,
physical cancellation or read access. Record these human observations separately.

Device procedure (no uninstall or permission changes):

1. Build/sign Debug with the existing team and unchanged diagnostic bundle ID;
   install over the existing diagnostic installation. Do not open PersonalOS.
2. Wait for observer readiness before a fresh process launch. Explicitly pass
   `PERSONALOS_NATIVE_HEALTH_PATH=D` to devicectl, do not rely on scheme settings.
   Use `--terminate-existing --console`, without an attached debugger, and verify
   `path=D`. Shared scheme opt-in stays disabled; no persistent opt-in is set.
3. Confirm **Path D**, **No request started**, and a responsive interaction
   counter. The request must not begin until the user taps the labelled D button.
4. Tap D once while watching continuously. If Apple's recognizable sheet appears,
   cancel without changing selections. Observe callback/timeout and the complete
   10-second window; then test the counter. Record visibility, cancellation,
   disappearance and interruptions independently of the console.
5. Stop after this one attempt. On timeout, cancel any visible sheet and stop the
   diagnostic process. Disable opt-in afterward; no automatic S/M/D follow-up.

Focused checks: run `check_project.py`, compare S root and modal source against
commit 6304d7c, and build Debug. Release source guards are audited statically;
physical D timing, denied/unavailable Health, duplicate/late callback and
accessibility behaviour still require device validation. No read access test.

### Human observation correction after D1

S1 and D1 both displayed Apple’s sheet and the user tapped **Don’t Allow**,
not Cancel. Each sheet disappeared and the counter responded without reported
interruption. M1/M2/S2 showed no sheet despite immediate success callbacks.
The original logs are preserved. Cancellation-based interpretations are withdrawn.
D1 demonstrates presentation remained possible through the direct API after the
earlier refusal, but API choice and manual-trigger timing differed; causation
remains unresolved. A second manual D attempt is proposed for review only.
Record the actual user action rather than assuming a Cancel control. Historical
procedure text above describes intended cancellation, not the corrected observed
actions. Read access remains untested.

### Apple Feedback status

**Reported to Apple; cause unresolved.** User-confirmed submission **FB25287175**,
dated **22 October 2026**, “Intermittent medication per-object authorization sheet
presentation across repeated requests”. The reviewed reproduction ZIP and a
separate Feedback Assistant-required iOS Sysdiagnose were submitted. The latter
is outside our archive sanitisation review. See
[submission record](reports/native-comparison-review/APPLE_FEEDBACK_SUBMISSION.md).
Diagnostic opt-ins remain disabled; no further tests or production changes planned.
