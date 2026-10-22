# Manual Health authorisation after interactive startup

Branch: `diag/health-authorization-manual-after-startup`.
Base: `59f9748a3110ec94c39938b738faf99f25ef0242`.
This is a diagnostic control, not a presentation fix. Native build and physical-
iPhone presentation acceptance for this control remain pending.

## Question and fixed implementation

At the base revision, the user reported two normal Runs reaching Today without
the SampleTurboModule overlay. The early hosted-XCTest comparison passed its
callback/lifetime/cleanup checks in A (10.048 s) and B (10.071 s), but neither arm
showed Apple's sheet. Both callbacks preceded RN JavaScript startup logs.
Post-callback retention alone did not restore presentation. This supersedes the
older paused status in the base commit's startup/retention instructions.

This comparison asks whether an actual user tap after Today is visibly
interactive can present the sheet in the same installation with the startup
correction. No timer or startup callback initiates the request.

All native sources remain byte-for-byte equal to the base, including:

- `ios/MedicationHealthAuthorization.swift`;
- `ios/MedicationHealthBridge.m` and `ios/MedicationHealthModule.swift`;
- `ios/PersonalOS/AppDelegate.swift` and `ios/ReactNativeStartupModules.swift`;
- startup tests, project membership, signing settings and entitlements.

The unchanged presenter uses clear content, a nonanimated `.overFullScreen`
host, nil predicate, per-request store/State and a false-to-true trigger from
`.onReceive` after UIKit's presentation completion. Normal Run has immediate
cleanup, corresponding to A. B's retention hook and detailed native diagnostic
trace compile only with `DEBUG && NATIVE_XCTEST`; they are not enabled here.
Do not add `NATIVE_XCTEST` to the app target. No later readiness gate, blue host,
trigger change or concurrency correction is included.

The sole call path is an explicit tap → existing
`NativeMedicationHealth.requestMedicationAccess()` → unchanged native bridge /
module → unchanged presenter. The component has in-memory busy/outcome state and
a synchronous duplicate-tap guard. It makes no availability, Health-read,
identity, storage or persistence calls. No dependency is added. The control is
guarded by `__DEV__`, which requires the normal Debug development bundle; its
handler also rejects calls outside development mode or after unmounting.

## Preserve data and identity

Keep the same iPhone, installed app, bundle identifier, signing team, provisioning,
entitlements, Keychain identity and existing Health permissions. Preserve all
Mac-local signing/configuration changes and record them separately. Install the
new Debug build over the existing app; do not uninstall, reset permissions,
clear storage, change Health settings or select/add medications.

Do not open Medication or Prescriptions for this comparison. MedicationScreen
mounts with `service.read()`; the native read can insert an initial collection
or migrate v1 to v2. It writes nothing for a valid existing v2 collection, but
calling it to check that prerequisite could itself write. The Today control
avoids mounting either collection screen. Visiting the Library tab alone does
not mount those screens or call storage. Do not run the full native test suite
or the real-identifier integration test.

## Make Metro serve this diagnostic checkout

The currently running Metro belongs to another Mac checkout. Xcode selecting
this workspace does not switch that server's JavaScript source.

1. Preserve existing work and use a separate Mac checkout/worktree of this
   branch. Record `git status --short`, `git branch --show-current` and
   `git rev-parse HEAD`. Verify the full hash against the delivered commit.
   Use this checkout's locked dependencies and established native build setup;
   do not upgrade packages or CocoaPods. If JS dependencies are absent, run
   `npm ci` from this checkout's `app` directory first.
2. Stop the old Metro with **Ctrl-C in its own terminal**. Inspect the listener
   with `lsof -nP -iTCP:8081 -sTCP:LISTEN`; before starting the diagnostic server,
   there should be no listener. If one remains, identify its process and working
   directory (`lsof -a -p <PID> -d cwd`) before stopping that specific server.
   Do not kill unrelated Node processes or silently move to a different port.
3. In a dedicated terminal, change to the diagnostic checkout's **app**
   directory, then run:

   ```sh
   pwd -P
   git branch --show-current
   git rev-parse HEAD
   npm start -- --port 8081 --reset-cache --projectRoot "$PWD" --config "$PWD/metro.config.js"
   ```

   Leave this process running. The installed CLI can exit if a server already
   owns the port; a successful shell exit is not evidence that the diagnostic
   server started. Confirm the new server is listening and its process working
   directory is this checkout's `app`. These commands assume the existing app
   uses port 8081; if the Mac setup explicitly uses another port, keep that same
   app/server port and record it rather than changing native configuration.
4. In a second terminal, verify what this server actually serves:

   ```sh
   curl -fsSL 'http://127.0.0.1:8081/index.bundle?platform=ios&dev=true&minify=false' -o /tmp/personalos-manual-after-startup.bundle
   rg -n -F 'Diagnostic: request Apple Health medication access' /tmp/personalos-manual-after-startup.bundle
   ```

   Keep the bundle local and uncommitted. This proves the Mac server's content,
   not iPhone connectivity or which bundle the phone loaded. Cache reset alone
   cannot correct a server launched from the wrong directory.
5. Open **this checkout's** `app/ios/PersonalOS.xcworkspace` in Xcode. Use the
   PersonalOS scheme, normal **Run → Debug**, the same physical iPhone and its
   established Metro host/network configuration. Rebuild and launch a fresh
   app process. Do not rely on Fast Refresh or a previously built app from
   another workspace. Confirm a bundle request during this launch in the
   diagnostic Metro terminal and the exact diagnostic label on Today. The
   earlier curl also generated a request: distinguish it from the phone launch.
   Ensure the running app uses the diagnostic Metro HTTP(S) bundle, not an old
   embedded `main.jsbundle`. If delivery is uncertain, inspect the returned
   bundle URL in a separate setup launch, then remove breakpoints and relaunch
   before the comparison. A missing label, unreachable server, stale embedded
   bundle or startup overlay means setup is incomplete: do not tap Health.

## Normal-Run device procedure

1. Leave `PERSONALOS_AUTHORIZATION_SMOKE_TEST`,
   `PERSONALOS_AUTHORIZATION_HOST_RETENTION` and
   `PERSONALOS_SYNTHETIC_HEALTH_TESTS` unset/disabled in Run and Test. Do not run
   XCTest for the device comparison. Keep diagnostic breakpoints disabled.
2. Observe Today loading without the SampleTurboModule overlay. Tap **Library**
   and then **Today**, without opening Medication or Prescriptions. This requires
   visible RN interaction; console startup logs alone are insufficient. Let the
   visible navigation finish naturally. Do not substitute a fixed delay.
3. On Today, tap **Diagnostic: request Apple Health medication access** once.
   The control becomes busy until the existing promise settles. Stay foregrounded
   on Today and observe continuously. No request occurs on mount, navigation,
   foregrounding or completion. A subsequent request requires another tap.
4. If Apple's recognizable medication-selection sheet appears, cancel without
   changing any selection. Record actual appearance, the cancellation tap and
   disappearance separately. An unidentified flash leaves visibility unverified.
   A generic app/host screen is not Apple's sheet.
5. Record the exact outcome text. **Request completed** means only that the
   native promise resolved after the existing dismissal/release path. It does
   not establish sheet appearance, user interaction or granted/readable access.
   **Request reported cancellation** records the mapped error, not proof of a
   physical cancellation tap. Other failures are sanitized; raw errors are
   neither shown nor logged. No query follows any outcome.
6. Keep observing for at least ten seconds after settlement; this is manual
   observation, not a delay before requesting or host retention. If the request
   remains pending, allow at most 120 seconds of observation, cancel any visible
   sheet and stop the Run. The control deliberately adds no timeout, forced
   dismissal or retry to the unchanged presenter. Record a timeout, background
   interruption, stuck host or app closure as an incomplete/failed comparison.
7. After settlement/cancellation, verify the control re-enables and that
   Library → Today interaction works. Check VoiceOver focus and readable text.
   Repeat once from a fresh normal Run, again proving interaction before a tap.
   Navigating away discards the transient diagnostic notice; record it first.

Record revision/local differences, Xcode/actual SDK/iOS versions, verified Metro
source, interactive Today before the tap, visible sheet/no sheet/unidentified
flash, actual cancellation, promise outcome, responsiveness and interruptions
independently. No normal-Run native trace timestamps are added by this change;
the displayed result is the caller's outcome, not a raw Health callback marker.
Do not commit Health UI captures, medication contents or private device details.

## Interpretation and limits

- A reproducible visible sheet establishes that the unchanged path can present
  after interactive startup in this installation with the startup correction.
  It supports investigating early-launch/test context, but does not prove an RN
  startup race: this run also uses the RN bridge and app-module singleton rather
  than the separately compiled hosted-XCTest presenter.
- Successful completion without a visible sheet remains **presentation FAIL**.
  A failed request is a different result; it does not reproduce successful
  no-sheet completion. No callback alone establishes read access.
- This compares against immediate cleanup (A), not retained cleanup (B). The
  authorisation implementation is not changed to make the experiments identical.
- The authorization-only standalone SwiftUI sample comparison remains the next
  option if this smaller comparison does not resolve the uncertainty. It is not
  implemented here.

## Local validation

Completed in the Linux worktree:

- `npm test -- --runInBand --runTestsByPath __tests__/App.test.tsx __tests__/NativeMedicationHealth.test.ts`:
  **2 suites, 36 tests passed**. Covers no automatic request, Today-only and
  development-only visibility, duplicate taps, completion/cancellation/failure,
  unavailable Health, explicit retry, unmount/late completion, sanitized notices
  and zero Health-query/medication-storage/prescription calls in the diagnostic
  path. Existing adapter tests also passed.
- `./node_modules/.bin/tsc --noEmit` and `npm run lint`: passed.
- `git diff --check`: passed. Direct byte comparison against `59f9748` confirmed
  all **33 tracked `app/ios` files** and the TypeScript Health adapter unchanged.
  All 138 base files outside the intended App wiring and test edits also match
  the base. Only the component and these instructions are new files.
- The first Jest command used name filters `App NativeMedicationHealth`, which
  unexpectedly matched all 15 suites through the checkout path. It reported
  396 passes and one 5-second timeout in the unchanged Prescription Wallet test
  `shows the derived badge with 0 days remaining`. That exact test passed in an
  isolated rerun (384 ms); no Wallet code/tests were changed. This is not a claim
  of a passing full-suite rerun. Use the exact-file command above.

These checks cannot validate UIKit, the actual iPhone presentation, Metro
connectivity from the phone, signing, or physical VoiceOver/Dynamic Type
behaviour. No native build or device run was performed here. Those require the
Mac/iPhone procedure above.
