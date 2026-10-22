# Controlled authorization host-retention comparison

**Paused for startup validation.** The supplied Arm A run overlapped a native
`SampleTurboModule` error overlay and React Native startup; its automated pass
is not a clean comparison baseline. The focused app-owned provider correction
is described in [startup validation](REACT_NATIVE_STARTUP_VALIDATION.md).
Native build/device validation of that correction remains pending. First confirm
normal Run reaches **Today** without the overlay, then repeat clean startup.
Only after that gate may the comparison below resume, starting with a fresh A
baseline. Preserve the installation, signing, permissions and storage safeguards.

Branch: `diag/health-authorization-host-retention`, based on
`4ab5b667678b24b7dcf5cddc4dc92c8b971a350b`. This is a diagnostic experiment,
not a production presentation fix. It has not yet been built or run on iPhone.

## Recorded baseline

At `4ab5b66`, the readiness-adjusted original smoke passed its automated
callback/cleanup check in **0.565 seconds**:

```text
request.enter main=true
result.successTrue main=true
caller.deliver.afterDismissal main=true
```

Device observation: **a brief unidentified screen appeared, too briefly to
identify. Apple's medication-selection sheet was NOT confirmed. Visibility is
UNVERIFIED; presentation acceptance remains UNMET.** This does not establish
either confirmed Apple-sheet visibility or confirmed absence throughout the
flash. Visible-sheet cancellation and return to usable app remain unverified.

## Controlled difference and bounds

Run the same `PersonalOSTests/MedicationNativeTests/testAuthorizationPresenterSmoke`
twice, changing only Test environment variable
`PERSONALOS_AUTHORIZATION_HOST_RETENTION`:

| Arm | Value | Host cleanup | XCTest observation |
| --- | --- | --- | --- |
| A | `A` | Existing immediate dismissal/release after the first Health callback | Remains alive for 10 seconds after that callback even if caller completion already arrived |
| B | `B` | Retains the same host/modifier for 10 seconds after the first Health callback, then uses the existing dismissal/release path | Remains alive for the same 10 seconds and awaits cleanup/caller completion |

Both arms use the identical `4ab5b66` readiness prerequisite: poll on the main
actor for exactly one foreground-active key window, a root and settled
presented-controller chain, and an attached final presenter. Check immediately,
yield for 50 ms between unsuccessful checks, and fail after 10 seconds without
calling the presenter. There is no suspension between the successful check and
the single request. There is no authorization retry.

The first Health modifier callback starts one nonblocking main-queue timer in
both arms, on the existing main-queue callback handoff. This is a **post-callback**
window, not a window from host readiness or final caller delivery. It also runs
for cancellation/false/error callbacks. The original caller completion remains
after host dismissal, so it normally arrives before the window ends in A and
after it ends in B. Further callbacks are logged but cannot restart the timer or
replace the first result. A later cancellation callback can therefore coexist
with an earlier successful first result; report both.

The callback bound is 120 seconds. After a first callback, XCTest allows 15
seconds for the shared 10-second observation plus dismissal/delivery. Teardown
allows another 5 seconds, cancels pending observation work, invalidates late
callbacks and dismisses/releases any remaining host even on failure/timeout.
Thus the configured bounds total at most about 150 seconds including readiness
and teardown, allowing normal scheduling overhead. A missing callback or early
presenter rejection is a failed/incomplete comparison, not a completed window.
An externally stopped/killed app cannot execute teardown; if Xcode stops early,
the app backgrounds/closes or UIKit cleanup fails, record an incomplete run and
stop the host before a new manually initiated run.

Everything before the callback is shared: transparent `Color.clear`, clear UIKit
background, `.overFullScreen`, nonanimated presentation, the same State/store,
Health modifier, medication object type, nil predicate, readiness signal and
automatic false-to-true trigger. No blue host, controls, changed anchoring,
trigger reset, new host or concurrency fix is introduced. The observer in A uses
a weak host reference so instrumentation does not itself retain that host.
The host is transparent: a retained controller is **not** evidence of a visible
or sustained screen, and no blue screen should be expected.

All hooks compile only under `DEBUG && NATIVE_XCTEST`, with explicit runtime
opt-in and setup by this smoke test. Normal Run and Release retain the original
production behavior. No project/scheme, dependency, entitlement, storage, query,
Health write, bridge or product UI changes are part of this experiment.

## Exact physical-iPhone procedure

1. Check out the supplied commit on the diagnostic branch on the Mac. Open
   `app/ios/PersonalOS.xcworkspace`; select **PersonalOS** and the same unlocked
   physical iPhone running iOS 26+. Record commit, Xcode, actual SDK/iOS versions
   and local configuration differences. Keep the installation, signing/bundle
   identity and Health settings unchanged between A and B.
2. Preserve the already-initialized v2 Medication collection. Do not uninstall,
   reset permissions, initialize/migrate storage, change Health settings or
   select/add medications. Stay on **Today**: do not open Medication or
   Prescription Wallet, because mounting them can read/initialize/migrate
   storage. No stock, link/unlink or document edits; no Health, identifier or dose
   queries, including after success. Do not run the full native suite or
   `testRealIdentifierSecureRoundTripAndSemanticEquality`.
3. In **Product → Scheme → Edit Scheme → Test → Info**, select **Debug**.
   In **Test → Arguments**, disable **Use the Run action's arguments and
   environment variables** if necessary, preserving other existing settings.
   Enable `PERSONALOS_AUTHORIZATION_SMOKE_TEST=1` and
   `PERSONALOS_AUTHORIZATION_HOST_RETENTION=A` for **Test only**. Leave
   `PERSONALOS_SYNTHETIC_HEALTH_TESTS` unset/disabled in Run and Test. Keep both
   diagnostic variables absent/disabled in Run. If a local test plan owns the
   environment, apply the same settings there. Do not change compilation
   conditions: verify inherited `DEBUG` and test-target `NATIVE_XCTEST` remain;
   do not add `NATIVE_XCTEST` to the app target.
4. Start Metro for this checkout if the Debug host needs it. Use **Product →
   Build For → Testing** to build current sources. Verify the app and test bundle
   use this checkout/SDK. Run only **PersonalOSTests → MedicationNativeTests →
   testAuthorizationPresenterSmoke** using its individual Test-navigator or
   gutter run button. Do not use an old Test Without Building product. Keep the
   phone foregrounded/unlocked and observe from launch through cleanup, without
   breakpoint pauses, app navigation or artificial delays.
5. **Arm A:** confirm `comparison.armA` and `request.enter` in the filtered
   `[MedicationAuthorizationOriginalDiagnostic]` trace. The first `result.*`
   should be followed by `comparison.observation.begin`, immediate
   `caller.deliver.afterDismissal`, and roughly 10 seconds later
   `comparison.observation.end.hostReleased`. XCTest must stay running throughout
   that interval. If a recognizable Apple medication-selection sheet appears,
   cancel promptly without changing selections and record the actual tap and
   disappearance. If only a flash appears, record it as unidentified unless you
   can identify it. A subsecond green run is not a valid completed comparison.
6. Wait for the test and `comparison.cleanup.complete`. Record observations
   below, including any app closure (cause unknown unless independently shown).
   Stop the test host. Change **only**
   `PERSONALOS_AUTHORIZATION_HOST_RETENTION` to **B**. Run the same single test
   again from a fresh launch with identical conditions. Do not reset Health or
   app data between runs.
7. **Arm B:** expect `comparison.armB`, the first `result.*`, then
   `comparison.observation.begin`. About 10 seconds later expect
   `comparison.observation.end.hostRetained`, then
   `caller.deliver.afterDismissal` and `comparison.cleanup.complete`. Observe the
   whole window even after a success/cancellation callback. Cancel a confirmed
   Apple sheet promptly without changing selections. If it disappears only when
   diagnostic cleanup fires, record **cleanup dismissal**, not manual
   cancellation. Record any additional callbacks separately.
8. A prerequisite failure, skip, missing callback, early context rejection,
   unexpected error, early app closure, host-lifetime assertion failure or
   fallback cleanup is not a comparable successful run. Keep its observations
   and sanitized trace. Teardown attempts cleanup automatically; if a sheet
   remains, cancel and stop the host before another manually initiated run. Do
   not weaken guards, silently retry or reinterpret the result as presentation
   success. If repeating to check order effects, repeat B then A under the same
   conditions and record each run independently.
9. Disable both diagnostic Test variables after the comparison. Keep local
   configuration changes reviewable. Store only sanitized text observations,
   fixed trace/activity labels, Boolean/numeric fields and relative timings in
   the public repository. Do not attach Health UI captures, medication contents,
   identifiers, documents, raw errors, credentials or private device identifiers.

## Observation record and interpretation

Record these independently for **each** arm:

| Field | What to record |
| --- | --- |
| Setup/prerequisite | Revision, arm, versions, same installation/settings, readiness satisfied/failed, foreground interruptions |
| Callback | Every fixed `result.*` label in order, `main`, uptime relative to request, early rejection/timeout if any |
| Observation window | Begin/end uptimes and measured duration; whether XCTest stayed alive for the full interval |
| Brief flash | None / unidentified / identified; approximate duration and before/after callback; never guess its identity |
| Sustained screen/host | What was actually visible and for how long, or not distinguishable with the clear host; keep `hostRetained` telemetry separate |
| Apple sheet | Confirmed recognizable medication-selection sheet, confidently observed absent, or unverified (including an unidentified flash); onset/duration relative to callback |
| Cancellation | Not attempted / unavailable / tapped on confirmed sheet; timing and resulting disappearance; report `result.cancelled` separately from the physical action |
| Cleanup/return | Normal or fallback cleanup, caller delivery, sheet disappeared on cancel or timer, return to Today and observed responsiveness, or app closed/cause unknown |

A green XCTest result certifies only its automated callback/lifetime checks.
An unidentified flash leaves visibility **UNVERIFIED** and presentation
acceptance **UNMET**. Confidently observed absence is a presentation **FAIL**.
Only positive device observation confirms the Apple sheet. Seeing a sustained
app/host screen alone does not confirm it. An `authorization-cancelled` error
alone does not prove a sheet or a user cancellation action.

If only B visibly shows the Apple sheet, that supports a host-lifetime dependency
in this configuration, not a production fix or proof of its cause. If B only
shows a sustained host, longer retention alone was insufficient for an Apple
sheet. If A also shows the Apple sheet, the earlier uncertain baseline does not
isolate retention as the cause. If neither arm gives identifiable visual
evidence, visibility remains unresolved. Production presentation, manual
cancellation, usability and repeated-use acceptance remain separate checks.

## Review and local validation

Source review covered identical readiness/pre-callback presentation, weak
observation capture in A, the shared 10-second timer, first-result preservation,
duplicate/late callbacks, early rejection, missing callback, detached hosts and
cleanup on test failure. `git diff --check` passed. A conditional-source
comparison against `4ab5b66` passed for production Debug, Release and Release
native-test builds (ignoring blank lines). The readiness helper/poll and every
non-smoke test match byte-for-byte. All 132 other tracked files, including
storage/query sources and configuration, match the base byte-for-byte. Only the
presenter, smoke harness and three diagnostic documents changed/added. The diff
contains no private data or credentials.

This Linux workspace has no Swift compiler, Xcode or Apple SDK. Native
compilation, XCTest execution, UIKit cleanup and actual device visibility must
be validated on the Mac/iPhone using the procedure above. Historical Jest,
TypeScript or device results do not validate this new experiment.
