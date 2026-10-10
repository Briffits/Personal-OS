# Medication collection

Medication is independent of Prescription Wallet. It owns names, IDs, manually recorded stock and one optional prescription reference. Apple Health owns scheduling and dose logging; neither is introduced here.

## Schema and relationship

The JSON envelope in Keychain service/account `com.personalos.medication-collection` / `medication-collection` is:

```ts
type MedicationRecord = {
  id: string;
  displayName: string;
  stock: number | null;
  prescriptionId: string | null;
};
type MedicationCollection = {
  schemaVersion: 1;
  revision: number;
  records: MedicationRecord[];
  pendingLegacy: {
    id: string;
    stock: number;
    prescriptionId: null;
  } | null;
};
```

IDs are native-generated lowercase UUIDs, never derived from names or positions. Duplicate names may coexist. Names must be non-blank. Stock/revision are non-negative integers no larger than JavaScript's maximum safe integer. Explicit null is distinct from zero or a missing/corrupt key. Pending legacy data cannot coexist with active records in this schema.

`MedicationRecord.prescriptionId` is the sole canonical relationship: one prescription may have many medications, each medication has zero or one prescription. It references the prescription record ID, not its changing document ID. Legacy prescription `medicationIds` is preserved without being read as a relationship or updated to mirror links. No bidirectional synchronization exists.

Add/Edit offers radio-style single selection, including None / Unlinked. Newly selected links are checked against existing prescription records immediately before the medication mutation. Unchanged links can be preserved during a name edit if prescription storage is unavailable. No link is guessed during migration. Selection currently reads metadata only, never opens a document or invokes authentication.

Prescription deletion first durably unlinks every matching medication, preserving IDs, names, stock, other links and already-unlinked records. The wallet calls `createPrescriptionDeletionCoordinator`, which supplies a preparation callback to the prescription service. That callback runs inside the prescription operation lock, after explicit confirmation and before removal. It calls Medication service `unlinkPrescription`, which reads the latest revision and sends one bulk command through `MedicationStore` to native storage. Prescription persistence never directly mutates medication persistence; legacy prescription `medicationIds` stays untouched.

Read, write, stale-revision or uncertain unlink failures stop prescription removal and produce an explicit notice. If unlink succeeds but prescription removal fails or loses its acknowledgement, the notice explains the partial result: medication links are cleared and stock is kept; the wallet reloads before retry. Retrying reads durable state and does not rewrite already-unlinked records. There is no compensating relink or guessed rollback. Empty collections and pending stock-only migration require no medication write. Document cleanup failure remains a separate cleanup-pending result.

These are ordered operations, not a cross-domain atomic transaction: interruption between them may leave a retained prescription with its medications unlinked. Selection checking and medication commits likewise are not a cross-domain transaction; the current foreground app has no simultaneous prescription editor/background writer. Introducing those writers would require coordinating link creation with deletion. Unresolved older saved IDs remain visible as unavailable details until explicitly unlinked.

## Legacy migration

The only sources are the actual saved entries:

| Service                           | Account           | Value                               |
| --------------------------------- | ----------------- | ----------------------------------- |
| `com.personalos.medication-name`  | `medication-name` | UTF-8 name                          |
| `com.personalos.medication-stock` | `estimated-stock` | JSON `{ "estimatedStock": number }` |

The old UI fallback “Medication A” is not source data. If that exact name was explicitly persisted, it is preserved like any other saved name.

| Source                      | Result                                                           |
| --------------------------- | ---------------------------------------------------------------- |
| Name and stock              | One record with both actual values and null prescription link    |
| Name only                   | One record with null stock/link                                  |
| Stock only, including zero  | Durable pending record with stable ID, exact stock and null link |
| Neither entry               | Empty collection                                                 |
| Invalid or unreadable entry | Error; no initialization, replacement or deletion                |

Pending migration asks only for a name. Cancellation/restart retains pending stock and identity. Completing it moves the same ID/stock into one record with a null link; a later Edit can link it explicitly. Add and ordinary mutations remain blocked until completion.

Read the collection first. Only an explicitly missing item permits initialization. Insert the entire envelope once and read it back. Its existence is the migration marker, including an empty collection after deleting the last medication. Restarts after publication read the same IDs and do not reimport old data. An unsupported version or corrupt collection fails closed rather than restoring stale singleton values. Both legacy entries remain byte-for-byte untouched recovery copies and are no longer active stores. Downgrades to singleton builds are unsupported.

## Persistence and failure handling

`MedicationCollectionStorage.swift` owns schema validation, migration, ID generation and revision-checked commands. A shared lock serializes the complete read/check/write/verify transaction across store instances; the bridge dispatches work off the UI thread. This is a single-process contract; an extension/background process would require a separate concurrency design.

`MedicationKeychain.swift` uses Security's `SecItemAdd` only for initial insertion and `SecItemUpdate` for existing collection writes. It never deletes an item to replace it and never upserts from a stale mutation. The installed react-native-keychain implementation deletes before inserting, so it is not used for collection persistence. Existing singleton TypeScript writers are removed. No dependencies were added.

The collection uses `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` with synchronization disabled. Keep signing identity, bundle identity and Keychain access configuration unchanged for in-place upgrade testing. Locked/inaccessible Keychain errors must not be interpreted as absence. Data does not migrate to a different device through backup restore under this existing protection policy.

Each command carries the revision originally displayed to the user. Native rejects stale revisions, invalid IDs and invalid values before writing. Edits preserve ID/stock; stock changes preserve name/link; deletion removes only the selected record. Native reconstructs supported fields rather than accepting arbitrary collection replacements.

Read-back failure after publication returns `commit-uncertain`. The UI reloads after storage failures or uncertain responses, closes stale forms and asks the user to inspect the result before retrying. It never blindly replays an addition. Duplicate/cancelled callbacks and callbacks after unmount cannot start a mutation. Revision checking also protects against callbacks or writes from other screen instances.

Errors contain no user data, credentials or raw native errors. There is no network, database, HealthKit permission or prescription write in this feature.

## UI

The screen shows Add medication and compact name/stock cards. Normal tap does not mutate. Long press and named VoiceOver actions expose Add stock (recorded) or Record current stock (unrecorded), Correct stock, Edit medication and Delete medication. Action sheets include Cancel. Correct stock on an unrecorded record opens initial stock recording, without inventing a previous zero balance. Deletion requires a separate explicit confirmation. Text wraps/scales and controls retain minimum touch targets.

## Validation

See [Medication test audit](MEDICATION_TEST_AUDIT.md) for the earlier 268-to-237 count change and the final VPS validation results. Native compilation/tests, the iOS build and device checks below have not run in this Linux workspace, so full validation is not yet complete.

TypeScript/Jest tests cover multiple medications, independent arithmetic, zero/null stock, invalid/overflow inputs, stable IDs, single relationship selection, None, link validation, legacy relationship non-use, unavailable prescriptions, stale snapshots, callback guards, uncertain writes, pending migration, deletion isolation, navigation persistence and native response validation.

Standalone Swift tests exercise the actual collection implementation against an injected Keychain boundary: migration matrix, untouched source bytes, failed reads/writes, interrupted/lost publication, explicit null encoding, malformed records, revision rejection and concurrent operations. The Security smoke test uses a unique synthetic Keychain service and checks real insert/update/read/account isolation.

From `app`:

```sh
npm test -- --runInBand
./node_modules/.bin/tsc --noEmit
npm run lint
```

On a Mac, from the repository root:

```sh
xcrun --sdk macosx swiftc app/ios/MedicationCollectionStorage.swift \
  app/ios/tests/MedicationCollectionStorageTests.swift -o /tmp/medication-tests
/tmp/medication-tests
xcrun --sdk macosx swiftc app/ios/MedicationCollectionStorage.swift \
  app/ios/MedicationKeychain.swift app/ios/tests/MedicationKeychainTests.swift \
  -o /tmp/medication-keychain-tests
/tmp/medication-keychain-tests
```

The test sources are outside the application target. Swift/native tests and the rebuilt iOS app require Mac validation; the Linux workspace has no Swift compiler or Xcode. Mocked tests do not establish Security framework durability or iOS accessibility protection.

Before merge, validate an in-place iPhone upgrade without uninstalling/resetting data, with synthetic saved name/stock and stock-only cases. Check repeated launch, force-quit during writes, lock/unlock errors, offline operation, multiple records and links, deletion/cancellation, VoiceOver action parity and large Dynamic Type. Run the existing prescription native tests as a regression check. Do not log or copy real device medication data into this public repository.
