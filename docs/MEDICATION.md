# Medication collection

Medication is independent of Prescription Wallet. It owns names, IDs, manual stock inputs and one optional prescription reference. This compatibility slice preserves the recorded v2 format while retaining current main navigation, Reminders and separate Health access. It introduces no Health queries, identity decoding, linking controls or threshold editing.

## Schema and relationship

The JSON envelope in Keychain service/account `com.personalos.medication-collection` / `medication-collection` is:

```ts
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
type MedicationCollection = {
  schemaVersion: 2;
  revision: number;
  records: MedicationRecord[];
  pendingLegacy: { id: string; stock: number; prescriptionId: null } | null;
};
```

IDs are native-generated lowercase UUIDs. Duplicate names may coexist; names must be non-blank. Revisions and pending legacy quantities remain nonnegative safe integers. Other quantities allow fractions, must be finite/nonnegative, and cannot exceed JavaScript's maximum safe integer. Explicit null is distinct from zero or a missing/corrupt key. Pending legacy data cannot coexist with active records.

Baseline and legacy stock are mutually exclusive. Additions require a baseline, its ID, a distinct unique addition ID, a positive quantity and a timestamp at or after the baseline. Unsupported quantities, overflow, ineffective additions and clock rollback before the baseline reject without publication. Required nullable fields are explicit; none are silently defaulted. Collection JSON is decoded without normalizing strings: leading U+FEFF scalars in names or opaque references are preserved. Native and TypeScript blank-string checks use the historical native whitespace set (including U+0085/U+200B, excluding U+FEFF). Command names are trimmed with that same set; stored names/references are not trimmed. Timestamps use the shared four-digit-year proleptic-Gregorian UTC format, rather than Foundation’s historical calendar cutover. Thresholds and opaque Health references are retained without being edited or interpreted.

`MedicationRecord.prescriptionId` is the sole canonical relationship: one prescription may have many medications, each medication has zero or one prescription. It references the prescription record ID, not its changing document ID. Legacy prescription `medicationIds` is preserved without being read as a relationship or updated to mirror links. No bidirectional synchronization exists.

Add/Edit offers radio-style single selection, including None / Unlinked. Newly selected links are checked against existing prescription records immediately before the medication mutation. Unchanged links can be preserved during a name edit if prescription storage is unavailable. No link is guessed during migration. Selection currently reads metadata only, never opens a document or invokes authentication.

Prescription deletion first durably unlinks every matching medication, preserving IDs, names, stock, other links and already-unlinked records. The wallet calls `createPrescriptionDeletionCoordinator`, which supplies a preparation callback to the prescription service. That callback runs inside the prescription operation lock, after explicit confirmation and before removal. It calls Medication service `unlinkPrescription`, which reads the latest revision and sends one bulk command through `MedicationStore` to native storage. Prescription persistence never directly mutates medication persistence; legacy prescription `medicationIds` stays untouched.

Read, write, stale-revision or uncertain unlink failures stop prescription removal and produce an explicit notice. If unlink succeeds but prescription removal fails or loses its acknowledgement, the notice explains the partial result: medication links are cleared and stock is kept; the wallet reloads before retry. Retrying reads durable state and does not rewrite already-unlinked records. There is no compensating relink or guessed rollback. Empty v2 collections and pending v2 stock-only records require no unlink write. Reading a v1 collection first performs its one-time schema migration. Document cleanup failure remains a separate cleanup-pending result.

These are ordered operations, not a cross-domain atomic transaction: interruption between them may leave a retained prescription with its medications unlinked. Selection checking and medication commits likewise are not a cross-domain transaction; the current foreground app has no simultaneous prescription editor/background writer. Introducing those writers would require coordinating link creation with deletion. Unresolved older saved IDs remain visible as unavailable details until explicitly unlinked.

## Version compatibility

Native reads accept v1 and v2; the TypeScript bridge contract returns only v2. A valid existing v2 read performs zero writes, preserving the stored bytes. Native v1 migration converts every `stock` to `legacyRecordedStock`, retains IDs/names/links and pending records, and publishes one complete v2 envelope with revision incremented once. It invents no timestamp, baseline, addition, Health reference or threshold. Empty v1 collections stay empty. An exhausted revision rejects migration instead of wrapping.

Publication is a single `SecItemUpdate` followed by read-back verification. Failure before publication preserves v1. A successful write with failed verification/acknowledgement may leave complete v2 and returns an uncertain result; retry reads durable state instead of replaying migration. There is no per-record publication or preliminary clearing write.

An unsupported numeric schema version yields `unsupported-version`; malformed JSON, malformed version values or invalid recognized data yield `invalid-record`. Both block reading/mutation without singleton fallback or writes. The UI distinguishes the two and disables edits. Unsupported envelopes must be handled by a compatible app version, not reset or rewritten.

Forward compatibility preserves all **recognized** v2 fields, including stock history, thresholds and opaque source strings. Unknown extra keys are not part of this contract: reads do not rewrite their bytes, but later mutations reconstruct recognized fields. Any future persisted field whose preservation matters must increment the schema version and provide a migration/compatibility contract. This is not an arbitrary future-schema passthrough.

There is **no reverse migration**. V1-only main rejects a migrated v2 envelope without writing; singleton-era builds may expose stale recovery values and are unsupported downgrades. Never change schemaVersion or flatten v2 to a gross `stock` total to enable downgrade.

## Legacy migration

The only sources are the actual saved entries:

| Service                           | Account           | Value                               |
| --------------------------------- | ----------------- | ----------------------------------- |
| `com.personalos.medication-name`  | `medication-name` | UTF-8 name                          |
| `com.personalos.medication-stock` | `estimated-stock` | JSON `{ "estimatedStock": number }` |

The old UI fallback “Medication A” is not source data. If that exact name was explicitly persisted, it is preserved like any other saved name.

| Source                      | Result                                                              |
| --------------------------- | ------------------------------------------------------------------- |
| Name and stock              | One record with actual name/legacy stock and null prescription link |
| Name only                   | One record with null legacy stock/link                              |
| Stock only, including zero  | Durable pending record with stable ID, exact stock and null link    |
| Neither entry               | Empty collection                                                    |
| Invalid or unreadable entry | Error; no initialization, replacement or deletion                   |

Pending migration asks only for a name. Cancellation/restart retains pending stock and identity. Completing it moves the same ID/stock into one record with a null link; a later Edit can link it explicitly. Add and ordinary mutations remain blocked until completion.

Read the collection first. Only an explicitly missing item permits initialization. Insert the entire envelope once and read it back. Its existence is the migration marker, including an empty collection after deleting the last medication. Restarts after publication read the same IDs and do not reimport old data. An unsupported version or corrupt collection fails closed rather than restoring stale singleton values. Both legacy entries remain byte-for-byte untouched recovery copies and are no longer active stores. Downgrades to singleton builds are unsupported.

## Persistence and failure handling

`MedicationCollectionStorage.swift` owns schema validation, migration, ID generation and revision-checked commands. A shared lock serializes the complete read/check/write/verify transaction across store instances; the bridge dispatches work off the UI thread. This is a single-process contract; an extension/background process would require a separate concurrency design.

`MedicationKeychain.swift` uses Security's `SecItemAdd` only for initial insertion and `SecItemUpdate` for existing collection writes. It never deletes an item to replace it and never upserts from a stale mutation. The installed react-native-keychain implementation deletes before inserting, so it is not used for collection persistence. Existing singleton TypeScript writers are removed. No dependencies were added.

The collection uses `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` with synchronization disabled. Keep signing identity, bundle identity and Keychain access configuration unchanged for in-place upgrade testing. Locked/inaccessible Keychain errors must not be interpreted as absence. Data does not migrate to a different device through backup restore under this existing protection policy.

Each command carries the revision originally displayed to the user. Native rejects stale revisions, invalid IDs and invalid values before writing. Edits and prescription unlink preserve all stock fields and opaque references; stock changes preserve name/link/threshold; deletion removes only the selected record. Native reconstructs supported fields rather than accepting arbitrary collection replacements.

Read-back failure after publication returns `commit-uncertain`. The UI reloads after storage failures or uncertain responses, closes stale forms and asks the user to inspect the result before retrying. It never blindly replays an addition. Duplicate/cancelled callbacks and callbacks after unmount cannot start a mutation. Revision checking also protects against callbacks or writes from other screen instances.

Errors contain no user data, credentials or raw native errors. There is no network, database, HealthKit permission or prescription write in this feature.

## Manual stock and UI

`establishBaseline` implements Record/Correct stock: it creates a native timestamp and fresh baseline ID, atomically replaces the physical quantity, and clears superseded additions/legacy stock. `addStock` appends a baseline-scoped addition; for an untimestamped legacy total it updates that total without inventing a baseline. No derived balance is persisted. Decimal point/comma input is accepted with a decimal keyboard; grouping/exponents and decimals that change value during number conversion reject. Local display sums decimal representations; legacy native additions use Foundation decimal arithmetic. Extreme precision is not promised.

Stock changes require both the active Health link and retained baseline source to be null. The native boundary enforces this independently of JS with `unsupported-stock-source`. It does not compare opaque strings to infer semantic identity. Same-token links, different-token links, link-without-baseline and an unlinked record retaining an old source all remain blocked for stock commands. Name/prescription edits and prescription unlink still preserve those records.

Linked records show current stock unavailable. An unlinked record retaining a source shows confirmation required and explains that the saved source is unsupported. Neither displays its gross baseline/additions as current stock. No physical-count control is offered for these records in this slice; supporting their source transitions requires separate implementation. Threshold values remain stored but no threshold controls or new indicators are added.

Manual records show recorded units, support fractional Record/Add/Correct and retain the existing Edit/Delete actions. Normal tap does not mutate. Long press and VoiceOver share the permitted actions; the destructive menu index follows the actual action list. Deletion requires separate confirmation. Text scales and controls retain minimum touch targets.

## Validation

See [compatibility implementation and validation report](MEDICATION_V2_COMPATIBILITY.md) for the exact base, adapted reference, evidence and remaining device checks. Synthetic fixtures contain no device exports or real Health identities.

From `app`:

```sh
npm test -- --runInBand --watchman=false
./node_modules/.bin/tsc --noEmit
npm run lint
```

From the repository root on Mac:

```sh
bash app/ios/tests/run-medication-checks.sh
```

The native runner uses only injected in-memory stores and temporary synthetic files. It also compiles the pinned v1 reader from `14bae037ff3f7c6febe9016ea4e9d693f8fc825c` and proves it rejects actual migration output without writes/fallback. It does not compile or execute `MedicationKeychain.swift` or the Security smoke test.

Synthetic tests and an unsigned build do not establish device Keychain durability, signing/access-group continuity, iOS protection or accessibility behavior. Those require separately authorized validation on a dedicated synthetic-data device; no everyday-device data is needed.
