# Medication Phase 2 — native implementation, Mac validation pending

Phase 2 adds read-only Health medication access and inventory linking commands. No visible Health-linking UI, MedicationScreen integration, observers, background delivery, anchors, Health writes, external processing or new dependencies were added. Phase 3 is not started.

## API evidence and availability

This Linux VPS has no Xcode, Swift compiler or Apple SDK. **These changes have not been compiled against the installed Mac SDK; native tests have not run and built-app entitlements have not been inspected.** The implementation uses Apple's published Swift declarations, fetched during implementation, rather than inferred method names. Xcode with the iOS 26 SDK or newer is required; the application's existing deployment settings are unchanged. Runtime calls are guarded by iOS 26.0 availability and `HKHealthStore.isHealthDataAvailable()`.

Apple declaration sources:

- [HKUserAnnotatedMedicationQueryDescriptor](https://developer.apple.com/documentation/healthkit/hkuserannotatedmedicationquerydescriptor): `init(predicate:limit:)`, `result(for:) async throws -> [HKUserAnnotatedMedication]`. Nil predicate and limit include every readable medication, including archived items.
- [HKObjectType.userAnnotatedMedicationType()](https://developer.apple.com/documentation/healthkit/hkobjecttype/userannotatedmedicationtype()): returns `HKUserAnnotatedMedicationType`. This is the sole requested read type; `requestAuthorization(toShare:read:)` receives an empty write set. Medication authorization includes associated dose events; query completion/authorization completion never proves read permission.
- [HKMedicationConcept](https://developer.apple.com/documentation/healthkit/hkmedicationconcept): `identifier`, `displayText`, `generalForm`; [HKUserAnnotatedMedication](https://developer.apple.com/documentation/healthkit/hkuserannotatedmedication): `medication`, `nickname`, `isArchived`, `hasSchedule`. The form is Apple's raw general-form identifier, or null for unknown. No clinical codings are exposed.
- [HKMedicationDoseEvent](https://developer.apple.com/documentation/healthkit/hkmedicationdoseevent): inherited `uuid` and `startDate`, `medicationConceptIdentifier`, `doseQuantity: Double?`, `unit: HKUnit`, `logStatus: HKMedicationDoseEvent.LogStatus`.
- [Concept predicate](https://developer.apple.com/documentation/healthkit/hkquery/predicateformedicationdoseevent(medicationconceptidentifier:)): exact concept predicate combined with a safe date superset; `HKSampleQuery`, `HKObjectType.medicationDoseEventType()` and `HKObjectQueryNoLimit` collect all samples. Native semantic identity and exact start-date filtering then enforce `(from, through]`.
- [HKHealthConceptIdentifier](https://developer.apple.com/documentation/healthkit/hkhealthconceptidentifier): NSSecureCoding identity. There is no public constructor for making synthetic identifiers. Tests must not invent private archive keys.

## Bridge and data flow

`MedicationHealth` exports promises:

- `availability()` → `available | unsupported`.
- `requestMedicationAccess()` → prompt completed, or sanitized authorization error. Only an explicit caller invokes this; no UI invokes it in Phase 2.
- `listMedications()` → `{conceptReference, displayName, nickname, form, isArchived, hasSchedule}[]`.
- `readDoseSnapshot({baselineId, conceptReference, from, through})` → Phase 1 snapshot (`coverage`, `events` and unchanged request provenance).
- `validateConceptReference(reference)` → true or error.
- `compareConceptReferences(left, right)` → native semantic equality or error.

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

The real identifier round-trip/equality test is opt-in and otherwise explicitly skipped. It uses two synthetic medications manually entered in a dedicated Health store; secure binary and XML archives of one actual identifier must compare equal despite different bytes, and a second concept must compare unequal. No Health data or archives are committed, logged or persisted by the test. This integration test is required before declaring native identity validation complete.

## Validation performed on Linux

- Complete Jest suite: **15 suites, 387 tests passed**.
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

In Xcode, add `PERSONALOS_SYNTHETIC_HEALTH_TESTS=1` to the **Test action's environment** for the dedicated synthetic test store, then run `MedicationNativeTests/testRealIdentifierSecureRoundTripAndSemanticEquality`. Confirm it executes rather than skips. Review the native test results for all other tests as well; Linux Jest does not validate Swift.

On a dedicated iPhone/test store, exercise user-initiated authorization, cancellation, denial/partial access, newly shared medications, readable archived items, fractional taken doses, skipped/unknown data where supported, edited/deleted/backdated dose snapshots, exact interval boundaries and malformed identity. Verify no write permission is requested. Check that all APIs compile with the actual installed SDK; adjust any SDK signature discrepancy before approval of native validation. Also run the existing standalone MedicationKeychain and PrescriptionDocumentStorage tests and the normal in-place upgrade/manual-stock smoke tests.

No commit or push was performed. Native SDK/build/signing/test results remain the acceptance gate; no architectural or dependency approval is otherwise needed.
