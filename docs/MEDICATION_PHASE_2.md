# Medication Phase 2 — per-object authorization correction

Phase 2 adds read-only Health medication access and inventory linking commands. No visible Health-linking UI, MedicationScreen integration, observers, background delivery, anchors, Health writes, external processing or new dependencies were added. Phase 3 is not started.

**Latest reported device result, `24c746b`: normal Run after interactive startup
still shows no Apple medication sheet.** Correct diagnostic control and isolated
Metro were confirmed; Library → Today navigation preceded one tap. The completion
notice appeared and navigation remained usable. A later Medication-entry Xcode
breakpoint pause has an unconfirmed source and is not classified as an app hang.
See [the result record](../app/HEALTH_MANUAL_AFTER_STARTUP_DIAGNOSTIC.md).

The authorization-only [standalone native comparison](../diagnostics/HealthAuthorizationComparison/README.md)
now implements persistent-root S and retained-modal M in one independent app
identity. It defaults to inert, has no Health queries/storage/third-party
dependencies and leaves PersonalOS's runtime/project/signing untouched. Its
separate permission state limits comparisons back to PersonalOS. **Native
compilation, signing and device execution remain pending.** Use only its Mac
procedure for this experiment; broader Health integration tests remain separate.

**Historical reported device result, `4ab5b66`: readiness-adjusted original smoke
callback/cleanup PASS in 0.565 seconds; visibility UNVERIFIED; presentation
acceptance UNMET.** A brief unidentified screen appeared, too briefly to identify;
Apple's medication-selection sheet was NOT confirmed. The trace was
`request.enter main=true`, `result.successTrue main=true`, then
`caller.deliver.afterDismissal main=true`. Callback success is not presentation
success. This diagnostic branch prepares a controlled immediate-cleanup versus
10-second post-callback host-retention comparison with equal XCTest observation
windows. It has not yet been built/run on Mac/iPhone. Follow only the
[single-test procedure and data restrictions](../app/HEALTH_HOST_RETENTION_DIAGNOSTIC.md)
for this experiment; broader validation procedures below are outside its scope.

## API evidence and availability

The previous Phase 2 candidate completed Mac and physical-iPhone validation up to authorization, where the device exposed the invalid type-wide authorization call. This correction was initially made on Linux, without Xcode or an Apple SDK. The later original-presenter smoke result and current presentation limits are recorded above. The implementation uses Apple's published Swift declarations, fetched during implementation, rather than inferred method names. Xcode with the iOS 26 SDK or newer is required; the application's existing deployment settings are unchanged. Runtime calls are guarded by iOS 26.0 availability and `HKHealthStore.isHealthDataAvailable()`.

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
- `requestMedicationAccess()` → resolves after the per-object flow completes and its transparent host is dismissed, or rejects with a sanitized error. Only an explicit user-initiated caller invokes this; no production screen invokes it in Phase 2. No access-granted flag is returned. Call `listMedications()` afterward; an empty result is valid and cannot distinguish denial from no readable medications.
- `listMedications()` → `{conceptReference, displayName, nickname, form, isArchived, hasSchedule}[]`.
- `readDoseSnapshot({baselineId, conceptReference, from, through})` → Phase 1 snapshot (`coverage`, `events` and unchanged request provenance).
- `validateConceptReference(reference)` → true or error.
- `compareConceptReferences(left, right)` → native semantic equality or error.

`MedicationHealthModule` dispatches presentation to the main thread. `MedicationHealthAuthorization` finds the sole foreground key window and its top presented controller, then presents a transparent, over-full-screen `UIHostingController` without animation or app controls. After UIKit presentation completes, a readiness signal changes the SwiftUI `@State` trigger once. Apple's medication-selection sheet is the intended visible UI; its visibility is not established by callback success. Production completion dismisses the host and releases the in-flight guard before settling the promise. The reader is query-only. The Objective-C bridge selectors and TypeScript promise contract are unchanged.

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

`PersonalOSTests/MedicationNativeTests/testAuthorizationPresenterSmoke` now runs
the controlled host-retention comparison on this diagnostic branch. It requires
a physical iPhone, Debug with `NATIVE_XCTEST`, Test-only
`PERSONALOS_AUTHORIZATION_SMOKE_TEST=1` and
`PERSONALOS_AUTHORIZATION_HOST_RETENTION=A` or `B`. Missing prerequisites skip;
an unsettled presentation context fails before requesting authorization. Both
arms observe for 10 seconds after the first Health callback, with bounded
callback/cleanup waits and failure teardown. Successful completion and
`authorization-cancelled` remain expected callback outcomes; they do not prove
visible presentation or an actual manual cancellation.

Use the [exact A/B procedure and observation record](../app/HEALTH_HOST_RETENTION_DIAGNOSTIC.md).
Run only this individual test, keep synthetic Health tests disabled and stay on
Today. The test does not query Health, inspect records/identifiers, archive data,
or write Health, inventory, prescription or Keychain data. It requires no
medication selection or synthetic records and does not validate data access,
identifier equality or the RN bridge. Native compilation and execution of this
new comparison remain unverified.

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

To smoke-test the actual RN bridge without adding a product screen, temporarily expose the adapter in the local Debug build's `app/App.tsx`:

```ts
import { NativeMedicationHealth } from './src/native/NativeMedicationHealth';

if (__DEV__) {
  (globalThis as typeof globalThis & {
    phase2Health?: typeof NativeMedicationHealth;
  }).phase2Health = NativeMedicationHealth;
}
```

Reload, keep the app foregrounded and manually run these expressions in React Native DevTools:

```js
await globalThis.phase2Health.requestMedicationAccess();
(await globalThis.phase2Health.listMedications()).length;
```

Use only a synthetic store; inspect counts rather than printing medication DTOs or archives. Confirm only Apple's sheet appears, completion returns to the existing screen, and a second request works after dismissal. Repeat with no selections, partial selection, cancellation, and newly shared medications; query after each completed flow. Do not interpret promise resolution as granted access. To check overlap, manually start two requests together and inspect only settlement/error codes: the second must reject `authorization-failed` while the first remains active. Check background/no-window requests fail without a deferred prompt and that VoiceOver focuses the system sheet then returns to the app. Disable the test environment opt-in and remove the temporary import/global exposure after validation; do not commit that harness.

On a dedicated iPhone/test store, exercise user-initiated authorization, cancellation, denial/partial access, newly shared medications, readable archived items, fractional taken doses, skipped/unknown data where supported, edited/deleted/backdated dose snapshots, exact interval boundaries and malformed identity. Verify no write permission is requested. Check that all APIs compile with the actual installed SDK; adjust any SDK signature discrepancy before approval of native validation. Also run the existing standalone MedicationKeychain and PrescriptionDocumentStorage tests and the normal in-place upgrade/manual-stock smoke tests.

No commit or push was performed. Native SDK/build/signing/test results remain the acceptance gate; no architectural or dependency approval is otherwise needed.
