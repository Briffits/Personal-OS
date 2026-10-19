# Medication — Phase 1 of Medication 1.0

Medication owns physical stock, adjustments and the canonical optional `prescriptionId`. Prescription Wallet remains a separate document domain. Apple Health owns schedules, reminders and dose logging.

Phase 1 implements local stock schema/migration and pure read-only Health-facing contracts. **There is no native HealthKit implementation, Health entitlement, Health bridge, authorization prompt or Health-linking UI in this phase.** Phase 2 requires separate approval. No dependencies were added.

## Version 2 storage

The existing Keychain service/account remains `com.personalos.medication-collection` / `medication-collection`:

```ts
type MedicationCollection = {
  schemaVersion: 2;
  revision: number; // nonnegative safe integer
  records: MedicationRecord[];
  pendingLegacy: { id: string; stock: number; prescriptionId: null } | null;
};
type MedicationRecord = {
  id: string;
  displayName: string;
  prescriptionId: string | null;
  stockUnit: "count";
  stockBaseline: {
    id: string;
    quantity: number;
    recordedAt: string; // canonical UTC YYYY-MM-DDTHH:mm:ss.sssZ
    healthKitConceptReference: string | null;
  } | null;
  stockAdditions: {
    id: string;
    baselineId: string;
    quantity: number;
    recordedAt: string;
  }[];
  legacyRecordedStock: number | null;
  lowStockThreshold: number | null;
  healthKitLink: { conceptReference: string } | null;
};
```

IDs are lowercase UUIDs generated natively. Zero and null remain distinct. Every required nullable key is serialized explicitly. Baseline and legacy stock are mutually exclusive; additions require a baseline, positive quantities, unique IDs and that baseline's ID. Addition timestamps cannot precede the baseline; equal timestamps are allowed because transactions serialize actions that occur within the same millisecond. A clock rollback before the baseline rejects an addition without writing.

No `stock` or `estimatedStock` balance is written in v2 records. The Health reference fields reserve the future consumption-source contract; Phase 1 creates null references and offers no mutation that establishes or changes a Health link. Concept encoding, native equality and enforcement of one inventory per actual Health concept belong to Phase 2 before linking can be enabled.

Baseline identity is independent of medication identity. A future Health link must match the baseline's consumption source. Removing or changing a link cannot turn a previous gross baseline into current manual stock: calculation returns confirmation-required on a source mismatch. Phase 2 must atomically establish a new physical baseline when changing consumption sources and enforce one inventory per concept.

## Migration

Native reads the collection first. A valid v1 envelope is upgraded in one serialized Keychain update with revision incremented once. IDs, names, prescription links and all exact existing stock values are preserved. Existing stock moves to `legacyRecordedStock`, with no invented count time, baseline, addition, Health link or threshold. Empty collections remain empty. Stock-only pending legacy records retain the same ID and integer quantity until the user supplies a name.

A missing collection alone permits singleton migration. The sources remain `com.personalos.medication-name` / `medication-name` and `com.personalos.medication-stock` / `estimated-stock`. Both recovery entries remain byte-for-byte untouched. Name-only becomes unrecorded stock; stock-only remains pending; neither source creates an empty v2 collection. Invalid or inaccessible sources never become empty data.

Failed writes preserve previous committed bytes. Baseline creation clears legacy stock and superseded additions only as part of the complete replacement snapshot. There is no preliminary clearing write. After successful publication with failed verification, `commit-uncertain` requires read-back; the UI must inspect the committed snapshot rather than replay an additive command. Interrupted migration reads either intact v1 or complete v2. V2 is never re-imported from singleton recovery entries. Unsupported/corrupt versions fail closed. Revision exhaustion rejects migration/mutation rather than wrapping. Downgrade after v2 publication is unsupported.

## Manual commands and quantities

- `create`, `edit`, `completeLegacy`, `remove` retain their identity/relationship semantics.
- `establishBaseline` implements Record/Correct Stock: native assigns a timestamp and fresh baseline ID, replaces the physical quantity, clears prior additions and clears legacy stock atomically.
- `addStock` appends a baseline-scoped addition. For an untimestamped legacy total only, it updates that preserved manual total without fabricating a baseline. A record without any stock cannot accept an addition.
- `setLowStockThreshold` stores the user's count or null to disable it. Zero and fractional thresholds are valid; no default is invented.
- `unlinkPrescription` changes only `prescriptionId`, preserving every stock field and reserved Health reference. It never calls Health or modifies prescription storage itself.

Quantities are finite nonnegative JavaScript numbers/Swift Doubles bounded by `Number.MAX_SAFE_INTEGER`; additions must be greater than zero. Revisions and pending singleton stock remain safe integers. Decimal point and decimal comma input are accepted, with no grouping or exponent notation. Boolean, negative, nonfinite and overflowing inputs reject. Additions that are too small to change a represented total reject. Input and output remain numbers/Doubles, but reconciliation sums their decimal representations before a single conversion back to number. This prevents ordinary decimal cancellation (0.3 − 0.1 − 0.2) from becoming a false deficit without rounding individual doses. Native legacy additions use Foundation decimal arithmetic and reject unsupported precision/range. User-entered decimals that change value when converted to number reject. Extreme precision is not promised and must not be interpreted as clinical precision.

The only unit is count. The UI says units, supports decimal stock entry, and exposes optional threshold editing through the existing action menu and VoiceOver actions. A threshold is inclusive (`quantity <= threshold`). Its indicator describes recorded stock in manual mode. There is no days-remaining calculation, medical threshold, notification or adherence interface.

## Pure reconciliation

`medicationHealth.ts` defines read-only reader, medication, event and complete-query snapshot contracts; there is no production reader. `medicationStock.ts` derives a result without mutating or persisting its inputs:

```text
baseline quantity + baseline-scoped additions - eligible taken quantities
```

A snapshot must match the baseline ID, concept reference, exact baseline start and a valid cutoff covering the included additions. Known limited coverage, obsolete results and missing Health data never become a current manual balance. All sample-query results must be collected before calling the calculation. A complete query describes query completion, not proof that Health has disclosed every event.

Eligible events have the exact concept, count units, a finite nonnegative quantity, taken status and occurrence time strictly after the baseline and at or before the cutoff. Event time means the logged dose's sample start time, not scheduled time or query arrival time. Duplicate sample IDs contribute once; conflicting duplicate payloads invalidate the snapshot. Distinct IDs are not collapsed based on matching quantities/times.

Skipped, notLogged, snoozed, notInteracted and notificationNotSent events contribute zero. Unknown statuses, incompatible units or invalid taken quantities make the result incomplete. There is no substitution of scheduled quantity and no mg/mL/strength-to-count conversion. Each fresh snapshot replaces the prior calculation, so edits, undo, deletion and backdated changes reconcile without incremental deduction drift.

A negative result requires physical confirmation and is not clamped or written back. An empty query carries `noReadableEvents: true`: it is not proof of no doses or permission. Threshold status is absent when stock cannot be calculated. A new correction establishes a new interval; older events cannot affect its balance.

## Persistence, privacy and failures

The existing shared native lock, revision checking, `SecItemAdd` initialization, `SecItemUpdate` replacement and read-back verification remain. Keychain remains `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, nonsynchronizing. There are no raw Health events or estimates persisted in the app, no external processing, and no health content in error messages or logs. Native errors remain sanitized.

Prescription deletion still confirms first and unlinks medications before deleting the prescription. A failed unlink stops deletion; a subsequent prescription failure may leave the retained prescription unlinked. Retry reads durable state, never guesses a rollback. Deleting a medication never deletes its prescription or Health records.

## Validation

Run from `app/`:

```sh
npm test -- --runInBand
./node_modules/.bin/tsc --noEmit
npm run lint
```

Run `git diff --check` from the repository root. Tests cover schema validation, fractional manual operations, source mismatch, full Health snapshot reconciliation, edits/deletions, timestamp boundaries, unavailable/limited data, thresholds and prescription field preservation.

On Mac, run the actual native store and Keychain smoke tests:

```sh
xcrun --sdk macosx swiftc app/ios/MedicationCollectionStorage.swift \
  app/ios/tests/MedicationCollectionStorageTests.swift -o /tmp/medication-tests
/tmp/medication-tests
xcrun --sdk macosx swiftc app/ios/MedicationCollectionStorage.swift \
  app/ios/MedicationKeychain.swift app/ios/tests/MedicationKeychainTests.swift \
  -o /tmp/medication-keychain-tests
/tmp/medication-keychain-tests
```

Swift tests cover actual native migration, failed/uncertain publication, unchanged recovery bytes, v2 round trips, fractional baseline/additions/thresholds and correction scope. They cannot be compiled in this Linux workspace; Mac execution and the iOS build remain required. Also rerun prescription native tests.

On iPhone, upgrade in place using synthetic v1/singleton data without reinstalling. Preserve signing identity and bundle identity. Check migration, repeated launches, force-quit around writes, lock/unlock, offline operation, decimal keyboards, threshold editing, VoiceOver and large Dynamic Type. The existing scheme's absent test-target reference is not repaired in Phase 1; use the standalone native commands above and build the application on Mac. Real Health authorization/reconciliation validation belongs to Phase 2.
