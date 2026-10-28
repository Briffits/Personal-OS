# Read-only Apple Health medication access

Prepared 2026-10-28 on `feat/health-medication-access`, based on
`origin/main` at `fae5bb02a45fd537e2a955444f317d0eafa74dbf`.
No medication-v2 merge or storage/schema migration is needed.

## User flow

Library → Apple Health medications opens an independent, read-only screen.
Opening it reads objects already available to the app; it does not request access.
Only **Connect Apple Health medications** initiates a per-object request. Startup,
foreground return and Refresh medications never request authorization. Connect
remains an explicit action; there is no request counter or automatic redirect.

**Manage medication access** expands manual instructions in every state, including
loading, unavailable and errors. The route reported as observed during the prior
investigation is **Health → profile → Apps → PersonalOS → medication selections**.
The screen substitutes its actual `CFBundleDisplayName`. The subsequent device
trial confirmed guidance naming PersonalOS Health Test and selection removal via
Health under that test identity. iOS labels may vary. If the app is not listed, the guidance suggests the explicit
Connect action first without promising a sheet or a new entry.

No Settings link or private Health URL is used. There is no claim that ordinary
iPhone app Settings opens medication selections. Return from Health triggers a
non-prompting read while this screen is mounted; re-entering the screen also reads.

The view distinguishes loading, requesting, readable rows, empty results,
unavailable, errors and an operation exceeding the UI deadline. Empty results do
not mean denial. A request callback is never shown as consent or confirmed read
access. A failed/cancelled request has a separate message and is followed by a read
when active. Management guidance remains available if no sheet appears.

## Implementation and boundaries

- `HealthMedicationsModule.swift` / `HealthMedicationsBridge.m`: a minimal bridge
  with only request and read methods plus the app display name. A retained native
  reader owns one lazily created `HKHealthStore` and a process-wide operation gate.
- Request: `requestPerObjectReadAuthorization(for:
  HKObjectType.userAnnotatedMedicationType(), predicate: nil, completion: ...)`.
  Requires an active app, one foreground-active key window and an attached visible
  controller without presentation/dismissal or a transition coordinator. The
  request uses HealthKit's inferred presenter; no extra modal is introduced.
- Read: `HKUserAnnotatedMedicationQueryDescriptor(predicate: nil, limit: nil)`.
  It includes readable active and archived objects. Only display name, optional
  nickname and archived status cross the bridge. Row keys are view-local indexes,
  not stored identifiers. No concept IDs are encoded or linked to local records.
- `NativeHealthMedications.ts` validates response fields and reduces errors to
  fixed categories. Raw HealthKit errors and content are not logged.
- `useHealthMedications.ts` owns screen-local memory. It clears obsolete rows on
  refresh or inactivity, invalidates older generations and ignores responses after
  unmount. Foreground reads coalesce behind an ongoing operation; Connect taps
  never queue a later prompt. Native gating also prevents overlap across screen
  remounts. If an earlier native operation is still running, a newly mounted
  screen can show an error until a subsequent explicit refresh succeeds.
- A 30-second UI deadline shows a waiting explanation, invalidates the old result
  and preserves the gate. It does not cancel HealthKit. A request's eventual
  completion schedules a fresh active read. A late ordinary read is discarded and
  the UI changes from waiting to a retryable error once it finishes; Refresh can
  then read again. An indefinitely unresolved native
  operation remains gated for that process; the UI does not automatically retry
  authorization or pretend cancellation occurred. Navigation and guidance remain
  usable.
- The screen uses existing theme/spacing/type tokens, scrollable untruncated text,
  header/button roles, explicit button labels, expanded/disabled states, and
  minimum 44-point controls. It does not force initial accessibility focus.

There are no dose-event queries or separate dose permissions, ordinary type-wide
Health authorization, Health writes, permission-status probes, Health content
logs, analytics, persistence, local-record imports or backend transmission.
Existing medication/prescription storage, Reminders, standalone diagnostics,
Metro, signing identity, schemes and deployment targets are unchanged. The native
target gains only the required HealthKit entitlement and read-purpose string,
in addition to the two source references. No update/write-purpose string or
background-delivery entitlement is added. Existing dependency lockfiles are
unchanged; no dependencies were installed.

## API evidence and unresolved presentation issue

Checked against installed iPhoneOS 27.1 SDK headers and Apple documentation:

- [Per-object authorization](https://developer.apple.com/documentation/healthkit/hkhealthstore/requestperobjectreadauthorization(for:predicate:completion:))
  documents callback completion separately from permission and allows querying
  objects already available to the app.
- [Medication query descriptor](https://developer.apple.com/documentation/healthkit/hkuserannotatedmedicationquerydescriptor)
  provides the medication-object query; these objects require iOS 26 or later.
- [Meet the HealthKit Medications API](https://developer.apple.com/videos/play/wwdc2025/321/)
  demonstrates reading available medication objects with a nil predicate/limit.

The historical standalone diagnostic remains unchanged. Direct per-object
requests were already tested; this is not a newly discovered fix. Explicit
presenter selection was insufficient to ensure repeatable presentation:

- Previous completed explicit-presenter trial: human observation of a sheet,
  Don't Allow, disappearance and responsive counter, continuously foregrounded.
- Same installed build repeat: human observation of no sheet, responsive counter,
  unlocked phone and continuous foreground without interruption. Separately, the
  sanitized trace recorded explicit presenter retention, success=true/no error at
  0.036 s, a 10.497 s observation window, no timeout or logged inactive/background
  event.

Preserve the fresh-installation caveat (continuity with prior permission state
unknown) and earlier interrupted-request history. Historical inferred-presenter
D2 included a background/foreground cycle and is not a matched control. Neither
callback success nor these presentation observations establish permission, read
access or causation. FB25287175 remains unresolved. No diagnostic logs were copied
or changed for this slice.

## Automated checks and build evidence

- Focused mocked UI and App integration tests cover explicit-request gating,
  management guidance/display name with no URL navigation, request-completion
  refresh including failure, foreground refresh, readable/empty/error/unavailable
  states, obsolete-row clearing, in-flight coalescing, stale/unmounted callbacks,
  timeout gating and large-text control properties.
- Full Jest suite: **16 suites / 386 tests passed**, including 13 focused Health
  screen cases and the App navigation/isolation case. TypeScript `--noEmit`,
  ESLint (zero warnings) and formatting checks passed.
- Existing host-only Swift startup tests: **4 passed**; Reminders regression
  tests: **15 passed**. These are host-only checks, separate from the later device trial.
- Reviewed the complete changed-file set, response sanitization and native API
  scope; no storage/schema, dose, write, logging or identity changes. Tracked
  whitespace checks passed. Added files were checked for trailing whitespace,
  private credentials, signing material and device identifiers.
- Unsigned Debug build passed using installed iPhoneOS 27.1 SDK and generic iOS
  destination, `CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO`. No device was
  selected. Existing matching-lockfile dependencies were copied into this isolated
  worktree; autolinking's generated path was adjusted only in ignored build data.
  Build warnings were in existing React/dependency headers, dependency code and
  script build phases; none originated in the new Swift module.
- Initial sandbox attempts encountered Watchman/Xcode service access restrictions.
  Jest subsequently used `--watchman=false`; the build ran with approved cache/
  service access. These initial attempts were not successful validation evidence.

Mocks and compilation do **not** establish real Health reads, runtime bridge
availability, authorization UI, management-route behaviour for a new identity, or
accessibility usability on an iPhone. Signing was subsequently verified as below.

## Complete diff review and signed test preparation — 2026-10-28

Reviewed all 13 changed/added files before preparing the device artifact. Two
concrete findings were corrected within the same file set:

1. A completed late read could leave a stale “still running” message. Its rows
   remain discarded, but completion now changes that message to a retryable error.
   The native gate is never released by the UI timeout.
2. Missing bridge/display-name metadata could fall back to production PersonalOS
   in test-app guidance. Native metadata now falls back to the bundle name; absent
   JS metadata uses neutral Home Screen name guidance. The test build exports its
   actual **PersonalOS Health Test** display name.

Added focused tests for both findings. Only affected checks were rerun: **37 tests
across HealthMedicationsScreen and App passed**, TypeScript and focused ESLint
passed, and the signed Release build compiled the revised Swift and bundled the
revised JavaScript. Earlier full-suite/host-test results above apply to the prior
preparation; those unchanged suites were not repeated.

The review confirmed the single explicit medication per-object request with nil
predicate, object-only query with nil predicate/limit, retained store and native
operation gate, main-queue completion handling, inactive/unmounted response
invalidation, and immediate obsolete-row clearing. There is no startup,
navigation or foreground authorization call, no success/empty-to-consent mapping,
no request counter, storage import, dose query, Health write, content logging,
backend dependency or medication-v2 dependency. Access-management guidance uses
manual navigation, not a private URL or an unverified Settings deep link. Source
roles, labels, text scaling and target sizes were reviewed; subsequent device
observations are recorded separately below. No remaining source
blocker was found within this review's scope.

Signed artifact (preparation evidence; later installed for the trial below):

- Configuration: **Release**, development-signed (`get-task-allow=true`).
- Bundle ID: `com.briffits.personalos.healthmedications.test`.
- Display name: **PersonalOS Health Test**.
- Private preparation directory: `/private/tmp/personalos-health-medications-release`.
- Artifact: `DerivedData/Build/Products/Release-iphoneos/PersonalOS.app` inside it.
- Xcode automatically provisioned the distinct test identity using the existing
  local signing team. Test Info.plist, entitlement and xcconfig overrides remain
  outside Git. Separate DerivedData was used; production settings were not edited.
- Strict/deep signature verification passed. Embedded profile identity and signing
  certificate match; certificate/profile are unexpired. Profile expires
  **2026-11-04 13:28:29 UTC**.
- Profile covers the previously recorded trial phone, compared offline with the
  retained local device record. No device query was made during preparation.
- Signed Keychain groups contain only the test app's private application identifier.
  HealthKit is enabled; the read-purpose string names PersonalOS Health Test.
  No Health write-purpose text, shared App Groups or iCloud capabilities are present
  in the signed app (nor App Groups/iCloud in the profile).
- `main.jsbundle` is bundled Hermes bytecode; Release loads it from the app bundle,
  without requiring Metro. Test fixture content is absent from the bundle.
- JavaScript SHA-256:
  `278d6358b8b0b517e16788aa056810cce47ec572ef3095843d536efb803a47ed`.
- Executable SHA-256:
  `ac138d09d2b526c7567edb04926cdd3054829e6872fa18d9400a4429abf76b81`.

The private `verification.json` contains sanitized artifact results; profile,
certificate and raw signing/build material remain outside the repository. No
medication contents, device identifiers, signing credentials or profile IDs are
included here. Installation and limited actual-read observations are recorded
separately below; they do not establish every runtime path.
FB25287175 remains unresolved; this build does not prove a presentation fix.

## Confirmed device observations — 2026-10-28

This trial used the verified Release **PersonalOS Health Test** artifact described
above. Application source was unchanged after the signed build. These are bounded
observations from one trial, not assertions that every checklist case passed.

### Installation/launch evidence (tool results)

Before installation, signature and executable/JavaScript hashes matched the
verified artifact, and the connected trial phone matched the provisioning
profile's coverage. Installation of the distinct test bundle and its launch
command succeeded. Production/v2 and the standalone diagnostic were not replaced
or uninstalled. No app console or Health content was captured. These tool results
do not themselves establish prompt behaviour, consent or readable content.

### Human-confirmed observations

- Startup and navigation to Apple Health medications produced no permission prompt.
- Manage medication access correctly named **PersonalOS Health Test**.
- After the user confirmed readiness, one explicit Connect action presented the
  authorization sheet. The user chose to share one medication and reported no
  unexpected behaviour.
- The user confirmed that the selected item appeared. This is an observed readable
  result, separate from request completion; no medication name or identifier was
  recorded. No callback success/timing was logged for this app trial.
- Following instructions to turn off that test app's selection in Health and
  return without Connect or Refresh, the user confirmed that the old row cleared
  automatically. The displayed empty message was: “No medications are available
  to read. This does not tell us whether access was granted. Check your medication
  selections in Health.” This empty response is not a permission-status claim.
- At a large accessibility text size, the heading, empty message, management
  guidance and buttons remained readable and reachable by scrolling. The exact
  text-size setting was not recorded.
- Light and dark appearance were both reported clear, with no reported readability
  or contrast issue. This was a qualitative check, not a contrast measurement.
- On opening the screen with VoiceOver, the user reported the heading announcement,
  followed by focus on and announcement of the empty message. All elements were
  reachable. This did not establish a practical focus defect or require forced
  initial heading focus.
- With VoiceOver active, explicit Refresh retained the empty state and navigation
  remained usable afterward.
- The user confirmed restoration of preferred display/accessibility settings.

### Explicit untested boundaries

**Real error handling, populated-row VoiceOver behaviour and repeat sheet
presentation remain untested.** Error/unavailable paths, timeouts, overlapping
operations and stale-callback races have mocked/build or source-review evidence,
not confirmation of those paths on this phone. The trial does not establish every
OS/version, locked-device, offline, multi-selection or archived-object case, nor a
separate foreground-only no-prompt matrix beyond the reported steps. No further
Connect attempt or device test was run to fill those gaps.

The successful single presentation and observed read do **not** resolve
**FB25287175**, prove repeatable presentation or establish a presenter-selection
fix. Historical diagnostic findings and their fresh-installation/interruption
caveats remain unchanged. No Health writes, permission resets, medication contents
or Health screenshots form part of this record.

## Device checklist — reference procedure, not a blanket pass

Use only the verified **PersonalOS Health Test** artifact after separate approval
for device actions. Do not reuse production/v2 or the standalone diagnostic's
identity, storage or permissions. Check profile validity again if the trial is
delayed. Do not reset permissions, uninstall another app, or change Metro.

1. **Startup/navigation without a prompt.** Cold-launch the test app, navigate
   Today → Library → Apple Health medications, navigate Back and return, then
   background/foreground without pressing Connect. Record destination, prompt
   absence/presence and visible state category only. A non-prompting object read
   is expected on entering this screen; no consent inference follows from it.
2. **Explicit Connect.** With the phone unlocked and app foregrounded, tap Connect
   once. Separately record whether a sheet appears, the user's action, whether it
   disappears and the resulting state. Do not require the sheet to reappear or
   automatically retry. If the operation remains pending, use guidance/Back;
   do not infer cancellation or permission from the waiting message.
3. **User-selected access.** The user chooses what to share in the sheet or opens
   Health → profile → Apps → **PersonalOS Health Test** → medication selections.
   Verify the displayed guidance names the test app and the observed route. If
   the app/selection controls are absent, record that boundary and stop the
   dependent checks; do not select production PersonalOS as a substitute.
4. **Actual readable results.** Return to the test screen and check whether the
   user-selected objects are readable. Test explicit Refresh once. Report only
   whether results correspond to the user's selections, never names, nicknames,
   identifiers, doses or screenshots. Readable results are separate evidence from
   any request-completion callback; an empty response alone proves no denial.
5. **Selection removal and return.** The user removes sharing for those selections
   in Health under the test identity. Return without another Connect request.
   Check that previously shown rows clear and the refreshed result reflects the
   changed selection. Check explicit Refresh as needed. Do not delete medications
   from Health or alter production selections.
6. **Empty/error and focused accessibility.** Check neutral empty copy where
   observed. Check a safely reproducible failed read if one occurs; otherwise
   label real error handling untested (mocked evidence only). Confirm no obsolete
   rows survive a failed refresh. With VoiceOver, verify destination recognition
   and predictable Back, heading, Manage, expanded guidance, Connect, rows/status
   and Refresh navigation without a trap. Check large-text reachability and
   light/dark readability. Initial heading focus is not mandatory if navigation is
   clear. Do not create an error by resetting data or permissions.

Capture no Health content in logs, screenshots, recordings or reports. Keep human
observations separate from any sanitized operation evidence; the app adds no
Health content or diagnostic callback logging. Record only confirmed results,
leaving unavailable/error paths and other unexercised boundaries explicit. No
dose reads, stock actions, writes or imports belong to this trial.

## Exact change list

Modified:

- `app/App.tsx`
- `app/__tests__/App.test.tsx`
- `app/ios/PersonalOS.xcodeproj/project.pbxproj`
- `app/ios/PersonalOS/Info.plist`
- `app/src/screens/LibraryScreen.tsx`

Added:

- `app/__tests__/HealthMedicationsScreen.test.tsx`
- `app/ios/HealthMedicationsBridge.m`
- `app/ios/HealthMedicationsModule.swift`
- `app/ios/PersonalOS/PersonalOS.entitlements`
- `app/src/healthMedications/useHealthMedications.ts`
- `app/src/native/NativeHealthMedications.ts`
- `app/src/screens/HealthMedicationsScreen.tsx`
- `docs/HEALTH_MEDICATION_ACCESS.md`
