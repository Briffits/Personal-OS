# Medication Phase 2 — per-object authorization correction

Phase 2 adds read-only Health medication access and inventory linking commands. No visible Health-linking UI, MedicationScreen integration, observers, background delivery, anchors, Health writes, external processing or new dependencies were added. Phase 3 is not started.

## API evidence and availability

The previous Phase 2 candidate completed Mac and physical-iPhone validation up to authorization, where the device exposed the invalid type-wide authorization call. This correction was made on Linux, without Xcode or an Apple SDK. **The corrected presenter smoke test subsequently passed on the Mac validation branch at `09cad0d`, with local Xcode configuration changes; the scope and remaining gaps are recorded below.** The implementation uses Apple's published Swift declarations, fetched during implementation, rather than inferred method names. Xcode with the iOS 26 SDK or newer is required; the application's existing deployment settings are unchanged. Runtime calls are guarded by iOS 26.0 availability and `HKHealthStore.isHealthDataAvailable()`.

Apple declaration sources:

- [HKUserAnnotatedMedicationQueryDescriptor](https://developer.apple.com/documentation/healthkit/hkuserannotatedmedicationquerydescriptor): `init(predicate:limit:)`, `result(for:) async throws -> [HKUserAnnotatedMedication]`. Nil predicate and limit include every readable medication, including archived items.
- [HKObjectType.userAnnotatedMedicationType()](https://developer.apple.com/documentation/healthkit/hkobjecttype/userannotatedmedicationtype()): returns `HKUserAnnotatedMedicationType`, which requires **per-object** authorization. Passing it to `HKHealthStore.requestAuthorization(toShare:read:)` caused the physical-device `NSInvalidArgumentException` (disallowed read type). Both the reader and integration test previously made this invalid call; both calls are removed.
- [healthDataAccessRequest(store:objectType:predicate:trigger:completion:)](https://developer.apple.com/documentation/swiftui/view/healthdataaccessrequest(store:objecttype:predicate:trigger:completion:)) is the supported SwiftUI modifier, imported through HealthKitUI. It receives only `userAnnotatedMedicationType()`, a nil predicate and a State trigger. No share/write set or unrelated type is requested. [WWDC25: Meet the HealthKit Medications API](https://developer.apple.com/videos/play/wwdc2025/321/) confirms medication selection also grants access to associated dose events. Authorization completion never proves read permission; queries determine what is readable.
- [HKMedicationConcept](https://developer.apple.com/documentation/healthkit/hkmedicationconcept): `identifier`, `displayText`, `generalForm`; [HKUserAnnotatedMedication](https://developer.apple.com/documentation/healthkit/hkuserannotatedmedication): `medication`, `nickname`, `isArchived`, `hasSchedule`. The form is Apple's raw general-form identifier, or null for unknown. No clinical codings are exposed.
- [HKMedicationDoseEvent](https://developer.apple.com/documentation/healthkit/hkmedicationdoseevent): inherited `uuid` and `startDate`, `medicationConceptIdentifier`, `doseQuantity: Double?`, `unit: HKUnit`, `logStatus: HKMedicationDoseEvent.LogStatus`.
- [Concept predicate](https://developer.apple.com/documentation/healthkit/hkquery/predicateformedicationdoseevent(medicationconceptidentifier:)): exact concept predicate combined with a safe date superset; `HKSampleQuery`, `HKObjectType.medicationDoseEventType()` and `HKObjectQueryNoLimit` collect all samples. Native semantic identity and exact start-date filtering then enforce `(from, through]`.
- [HKHealthConceptIdentifier](https://developer.apple.com/documentation/healthkit/hkhealthconceptidentifier): NSSecureCoding identity. There is no public constructor for making synthetic identifiers. Tests must not invent private archive keys.

## Bridge and data flow

`MedicationHealth` exports promises:

- `availability()` → `available | unsupported`.
- `requestMedicationAccess()` → resolves after the per-object flow completes and its transparent host is dismissed, or rejects with a sanitized error. Only an explicit user-initiated caller invokes this; no production screen invokes it in Phase 2. No access-granted flag is returned. A separate data-access check can call `listMedications()` afterward (omit it for the cancellation-only check below); an empty result is valid and cannot distinguish denial from no readable medications.
- `listMedications()` → `{conceptReference, displayName, nickname, form, isArchived, hasSchedule}[]`.
- `readDoseSnapshot({baselineId, conceptReference, from, through})` → Phase 1 snapshot (`coverage`, `events` and unchanged request provenance).
- `validateConceptReference(reference)` → true or error.
- `compareConceptReferences(left, right)` → native semantic equality or error.

`MedicationHealthModule` dispatches presentation to the main thread. `MedicationHealthAuthorization` finds the sole foreground key window and its top presented controller, then presents a transparent, over-full-screen `UIHostingController` without animation or app controls. After UIKit presentation completes, a readiness signal changes the SwiftUI `@State` trigger once. Only Apple's medication-selection sheet is visible. Completion dismisses the host and releases the in-flight guard before settling the promise. The reader is query-only. The Objective-C bridge selectors and TypeScript promise contract are unchanged.

Concurrent requests, missing/ambiguous foreground presentation contexts and active UIKit transitions fail with `authorization-failed`; they are never queued for later prompting. Unsupported OS/Health availability returns `health-unavailable`. Apple's `.success(true)` means request completion only; `.success(false)` maps to `authorization-failed`, without inventing a cancellation or denial distinction. Only `HKError.errorUserCanceled` maps to `authorization-cancelled`; other errors map to `authorization-failed`, without raw error details. No startup, query or background code initiates authorization.

Event names retain the Phase 1 contract: `id` is the sample UUID, `occurredAt` is UTC sample start, `quantity` is actual doseQuantity (never scheduled quantity), `unit` is `count | unsupported`, and `logStatus` explicitly includes unknown. Exact `HKUnit.count()` equality positively establishes count compatibility. No scaling, rounding of quantities, mass/volume conversion or inference from medication form occurs. Skipped and other known non-taken statuses need no count quantity. Unknown status or incompatible/missing taken quantities retain the event and produce `coverage: limited`. Nonfinite quantities cannot cross JSON and become null in an incomplete snapshot. Unexpected sample types fail the whole query. Native errors never include original Health error messages.

Errors distinguish `health-unavailable`, `authorization-cancelled`, `authorization-failed`, `query-failed`, `malformed-identity`, `invalid-interval`, `invalid-input`, and `incomplete-dose-data`. TypeScript validates returned DTOs, rejects malformed provenance and conservatively marks unsupported data limited. Empty completed queries remain distinct from failure and do not prove there were no doses. Millisecond transport is inherited from Phase 1; a submillisecond event that cannot be represented safely at the baseline boundary fails closed in TypeScript.

Nothing writes raw events or derived balances. No automatic linking by names, archive status or disappearance occurs.

## Concept identity

The transport is `hkconcept:1:` plus base64 of a secure keyed archive of the actual HKHealthConceptIdentifier. Decoding bounds input size, validates base64/version, requires secure coding, allows only the identifier root class, uses the identifier's own secure nested decoding, sets failure policy to return errors and rejects decoder errors or identifiers outside `HKHealthConceptDomain.medication`. It is not an authentication/signature scheme: a valid archive of another legitimate concept is another valid identity.

Comparison always decodes both identity references and invokes native `isEqual`. Archive bytes, names and nicknames are not identity. An unchanged semantic link preserves its original stored token. Once native verifies event identity, snapshots echo that same request token. Phase 1 string checks are therefore provenance checks on one retained token, not comparison of independently encoded identifiers. Secure validation/comparison needs the API's OS version but no Health permission or query.

## Atomic linking persistence

`linkHealth` takes record ID, opaque reference and a newly confirmed physical count. Within the existing serialized revision transaction it validates the reference, semantically checks all other linked inventories, and rejects duplicates with `duplicate-health-link`. An already-linked equivalent concept is a no-op preserving the existing token and revision. A different source (including first manual-to-Health link) requires a new baseline (`baseline-required` otherwise). The native timestamp, fresh baseline UUID, quantity, link and baseline source publish together, replacing old additions and legacy stock. Name, prescription relationship and threshold are preserved.

`unlinkHealth` performs no Health operation, decoding or permission check. It clears the active link, preserves the prior baseline/source and additions, and clears any legacy undeducted total on a linked record. The retained source mismatch forces physical confirmation rather than exposing the old gross count as current manual balance. A later explicit manual baseline restores manual counting. Unlink is a no-op if already unlinked. Prescription fields and thresholds remain unchanged. Existing stale-revision, failed-publication and commit-uncertain/read-back behavior applies; commands never auto-retry.

## Configuration and XCTest

`PersonalOS/PersonalOS.entitlements` contains only `com.apple.developer.healthkit = true`. Both app build configurations reference it, and the target capability is enabled. Info.plist adds only `NSHealthShareUsageDescription` for chosen medications and logged doses used to estimate physical stock. No Health update description, clinical-record permission or background-delivery entitlement was added. Existing deployment-target settings remain unchanged.

The previously dangling scheme ID now identifies a genuine hosted `PersonalOSTests` XCTest bundle, with app dependency, test host, Debug/Release configurations, source build phase and scheme test/build entries. The target compiles native helpers/storage directly, with no React or third-party test dependency. `NATIVE_XCTEST` excludes the standalone Phase 1 runner's `@main`; an XCTest executes all 19 Phase 1 storage cases. Additional tests cover mappings, all known/unknown statuses, fractional counts, missing/unsupported quantities, boundaries, malformed/wrong-class archives, duplicate semantic links, atomic relink, failed/uncertain writes and offline unlink preservation.

Native unit tests cover successful/false completion and sanitized cancellation/failure mapping. Jest verifies that the bridge waits for completion, never automatically queries or prompts, and permits an empty readable list after completion. The real identifier round-trip/equality test is opt-in and otherwise explicitly skipped. It runs on the main actor and invokes the exact `MedicationHealthAuthorization` presenter used by production, waits up to 120 seconds for manual system-sheet interaction, then checks the production reader before querying actual identifiers for archive checks. It never calls type-wide authorization. It uses two synthetic medications manually entered in a dedicated Health store; secure binary and XML archives of one actual identifier must compare equal despite different bytes, and a second concept must compare unequal. No Health data or archives are committed, logged or persisted by the test. This integration test is required before declaring native identity validation complete.

### Everyday-device authorization presenter smoke test

`PersonalOSTests/MedicationNativeTests/testAuthorizationPresenterSmoke` is a separate physical-device UI smoke test for the production `MedicationHealthAuthorization` presenter. It is skipped unless the Test action environment contains `PERSONALOS_AUTHORIZATION_SMOKE_TEST=1`. It presents Apple's medication authorization sheet, waits up to 120 seconds for dismissal and checks only the presenter's sanitized completion result. Successful completion and `authorization-cancelled` are expected outcomes; any other error fails. The test does not query Health, inspect or assert medication records or identifiers, archive data, or write Health, inventory, prescription or Keychain data. It requires no medication selection or synthetic records and does not validate data access, identifier equality or the React Native bridge.

Run this test on the everyday iPhone as follows:

1. Open `app/ios/PersonalOS.xcworkspace` in Xcode with the iOS 26+ SDK. Select the **PersonalOS** scheme and the unlocked physical iPhone running iOS 26+. Simulator runs skip.
2. Open **Product → Scheme → Edit Scheme → Test → Arguments**. Disable **Use the Run action's arguments and environment variables** if necessary. Add and enable `PERSONALOS_AUTHORIZATION_SMOKE_TEST` with value `1`. Leave `PERSONALOS_SYNTHETIC_HEALTH_TESTS` unset or disabled.
3. Start Metro if the Debug host needs it. In the Test navigator, expand **PersonalOSTests → MedicationNativeTests** and run only **testAuthorizationPresenterSmoke** using its individual run control. Keep the host app foregrounded.
4. Manually confirm Apple's medication-selection sheet appears, then cancel within 120 seconds without selecting medications. Confirm the sheet dismisses and the app returns. No synthetic records or medication selection are required. Successful completion is also accepted, but completing selection could change Health access permissions, even though this test makes no Health-record or application-storage writes.
5. Inspect the test report: a passing run records either **Authorization flow cancelled as expected** or **Authorization flow completed; access not checked**. These activities contain only fixed outcome labels. Only the presenter's explicit `authorization-cancelled` result counts as cancellation; Apple's false completion maps to `authorization-failed` and fails, as do other errors, duplicate callbacks and timeouts. Missing opt-in or iOS below 26 skips rather than passes.
6. Disable the smoke-test environment flag after the run. If the test times out with the sheet still open, dismiss it and stop the test host before retrying.

The callback is delivered after the production presenter dismisses its host. The automated assertion checks that callback's outcome; it does not independently prove that the system sheet was visible, so the visual observation above is part of this manual smoke check. This test does not validate Health data access, identifier equality or the RN bridge. Compilation and execution of this smoke test are reported below; continued app usability after cancellation remains unverified.

## Reported physical-device validation

- Build: Mac validation branch at `09cad0d`, with local Xcode configuration changes. This result does not establish that the unmodified commit builds with the same configuration.
- Environment: Xcode **27.1**; **iPhone 13 Pro**, **iOS 27.0.1**. The exact SDK version was not separately supplied.
- `testAuthorizationPresenterSmoke`: **passed in 39 seconds**.
- The user observed Apple's medication-selection sheet and cancelled without selecting any medications.
- The app closed afterwards. Whether this was test-runner teardown is **unverified**; the pass does not establish return to a usable app.
- The report contains an internal thread-priority inversion warning. Its cause is **unverified**; no causal link to the app closing is established.
- Health data access, identifier equality and the React Native bridge remain **unverified**.

These are user-reported results, not a new run in this workspace. The exact completion activity was not supplied: the test accepts either successful flow completion or explicit `authorization-cancelled`, so the observed cancellation must not be used to infer which callback result occurred.

## Proposed next check: cancellation through the product UI

Source inspection shows this path exists but has no production UI caller:

`NativeMedicationHealth.requestMedicationAccess()` → Objective-C `MedicationHealth` bridge → `MedicationHealthModule.requestMedicationAccess` → main-thread `MedicationHealthAuthorization` → Apple's sheet → host dismissal → native promise settlement → TypeScript result/error.

The adapter preserves sanitized error codes. The presenter clears its host and in-flight guard before settling the promise. This path performs no Health-record query or inventory/prescription mutation. `App.tsx` and `MedicationScreen.tsx` do not currently invoke it; the native XCTest calls the presenter directly and bypasses the RN bridge.

**Use the planned Medication Health-connection UI for this check, rather than another temporary test interface.** This would be a small first slice of the planned product UI, not an interface already available today. Proposed implementation scope is an explicit “Connect Apple Health” action in `app/src/screens/MedicationScreen.tsx`, using the existing adapter, with transient busy/outcome state and cleanup in `finally`. Handle explicit cancellation without treating it as failure or persisting a connection flag; distinguish other errors with a retryable message. Successful completion must not claim access was granted. Keep authorisation separate from later querying, linking and baseline confirmation, including on successful completion during this slice. Do not reuse the screen's inventory-mutation `run()` helper, which announces a save and can reload storage. No new dependency, native API or permission type is needed. UI implementation and focused cancellation/cleanup tests are proposed only; none were added here.

Manual acceptance check once that product action exists:

1. Use the same physical iPhone and record the actual revision and local configuration. Launch with Xcode **Run**, not **Test**, with both test opt-ins disabled and Metro available as needed. Keep the app foregrounded; do not stop the run during the check.
2. Use an already-initialized version-2 Medication collection. `MedicationScreen` reads storage on mount, and native `read()` can initialize or migrate older storage, so a fresh install or pending migration would violate this check's no-data-change condition. Do not create or migrate data as part of this check.
3. Open Medication, tap the product Health-connection action, observe Apple's sheet, then cancel without selecting anything. Do not call `listMedications()`, `readDoseSnapshot()`, identity queries, link/unlink commands or stock/prescription mutations, even if the authorisation promise resolves successfully. No automatic follow-up query or reload should run.
4. Confirm the promise settles through RN and the UI clears its busy state. Record only a fixed completion label or sanitized error code, separately from the observed cancellation; never log Health content. Explicit `authorization-cancelled` is expected when Apple reports that error; a resolved promise means flow completion only. Other errors must remain visible as failures, even if navigation works.
5. Confirm the same app session remains foregrounded and interactive: scroll, request the sheet a second time and cancel again, then use Back to Library and navigate to Today. There must be no stuck transparent host, blocked controls, automatic re-prompt, reload, crash or process exit. Check VoiceOver focus returns to usable app controls. Do not save or edit anything.
6. Confirm the authorisation handler made zero Health-query or persistence calls and the existing collection/revision is unchanged, using read-only inspection without logging personal contents. A focused UI test should also assert those zero calls for cancellation, completion and failure, and that busy state clears. If the app closes again during Run, preserve sanitized termination diagnostics and investigate; do not label it test teardown. Record any priority warning separately, without assigning a cause.

This checks RN-to-native presentation, settlement, dismissal and continued usability only. Health data access and identifier equality remain separate validation gates on the dedicated synthetic store. It requires no temporary global exposure or debug screen, and no new interface has been implemented in this documentation change.

## Validation performed on Linux

- Complete Jest suite: **15 suites, 388 tests passed**.
- TypeScript `tsc --noEmit`: passed.
- ESLint `npm run lint`: passed.
- `git diff --check`: passed.
- Native compilation, XCTest execution, permission prompts, signing and final embedded entitlements: **not run**.

## Required Mac validation

From the repository root, select Xcode with iOS 26+ SDK and record the actual SDK version:

```sh
xcodebuild -version
xcrun --sdk iphoneos --show-sdk-version
xcodebuild -list -project app/ios/PersonalOS.xcodeproj
xcodebuild -showdestinations -workspace app/ios/PersonalOS.xcworkspace -scheme PersonalOS
```

Use an installed iOS 26+ simulator's UDID (replace `SIMULATOR_UDID`), retaining existing signing/bundle identity. If Pods are absent/out of sync, run the repository's normal CocoaPods setup first. Run Metro separately if the Debug host needs it.

```sh
xcodebuild -workspace app/ios/PersonalOS.xcworkspace -scheme PersonalOS \
  -destination 'platform=iOS Simulator,id=SIMULATOR_UDID' \
  -derivedDataPath /tmp/personalos-phase2 \
  -resultBundlePath /tmp/personalos-phase2-tests.xcresult test
xcodebuild -workspace app/ios/PersonalOS.xcworkspace -scheme PersonalOS \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath /tmp/personalos-phase2-device build
codesign -d --entitlements :- /tmp/personalos-phase2-device/Build/Products/Release-iphoneos/PersonalOS.app
plutil -p /tmp/personalos-phase2-device/Build/Products/Release-iphoneos/PersonalOS.app/Info.plist
```

Inspect the signed app output, not just source entitlements: HealthKit true, no background-delivery or clinical access, correct read explanation, no Health write usage description. Build/test on the existing minimum supported OS (where available) and verify manual Medication/Prescription Wallet still work and Health availability reports unsupported.

In Xcode, open `app/ios/PersonalOS.xcworkspace`, select the PersonalOS scheme and an unlocked physical iPhone running iOS 26+. Start Metro if needed and keep the host app foregrounded. Add `PERSONALOS_SYNTHETIC_HEALTH_TESTS=1` to the **Test action's environment** only for the dedicated synthetic test store. Manually run `PersonalOSTests/MedicationNativeTests/testRealIdentifierSecureRoundTripAndSemanticEquality` from the Test navigator. This opt-in manual run is the test's authorization initiation; normal app launch and non-opted-in tests do not prompt. Within 120 seconds select both synthetic medications in Apple's sheet and complete it. Confirm the test executes rather than skips, the host disappears, the production list contains at least two readable entries, and secure binary/XML round-trip and different-concept checks pass. No type-wide request should occur or crash.

Repeat with cancellation and with fewer than two selected medications: cancellation should yield a sanitized authorization error when Apple reports one; fewer than two readable medications should fail the explicit count assertion, never be treated as successful access. These are intentional negative runs, not passing identity validations. Restore both selections and rerun for a passing result. Review all native unit tests, including `testAuthorizationCompletionMapping`. Linux Jest cannot validate SwiftUI presentation.

For the next RN cancellation check, use the proposed product-UI acceptance procedure above. The former temporary `App.tsx` global/DevTools harness is superseded; querying Health records is outside that check. Broader data-access checks below remain separate.

On a dedicated iPhone/test store, exercise user-initiated authorization, cancellation, denial/partial access, newly shared medications, readable archived items, fractional taken doses, skipped/unknown data where supported, edited/deleted/backdated dose snapshots, exact interval boundaries and malformed identity. Verify no write permission is requested. Check that all APIs compile with the actual installed SDK; adjust any SDK signature discrepancy before approval of native validation. Also run the existing standalone MedicationKeychain and PrescriptionDocumentStorage tests and the normal in-place upgrade/manual-stock smoke tests.

No commit or push was performed. Native SDK/build/signing/test results remain the acceptance gate; no architectural or dependency approval is otherwise needed.
