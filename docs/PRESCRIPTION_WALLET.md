# Prescription Wallet domain, storage and migration

The wallet is a standalone collection. Medication stock remains independent. Medication IDs are relationships only; neither domain owns the other. There is no backend or JavaScript document persistence.

## Implementation and validation status

The collection domain is now connected to native storage and the Prescriptions UI. The former `currentPrescriptionService.ts` is retained only for legacy workflow regression tests; no application screen or native adapter calls its single-current commit workflow.

This implementation is **pending Mac/Xcode and physical-iPhone validation**. JavaScript tests use mocked native capabilities. Native storage tests are provided separately; they must be compiled and run on a Mac. They do not validate iOS Data Protection or Face ID.

## Domain and native boundary

`prescription.ts` defines stable record IDs, separate opaque document/candidate IDs and validated metadata:

- kind: standard or temporary;
- medicationIds: unique non-blank IDs, including an empty list;
- expiresOn: required real YYYY-MM-DD date;
- issuedOn: optional, on or before expiry;
- startsOn: optional, temporary prescriptions only, on or before expiry.

Expiry is derived after the expiry day in the user's local calendar. It does not delete records or persist an inactive/expired lifecycle.

`prescriptionService.ts` orchestrates selection, confirmation, transactions and cleanup. The native adapter implements `read`, `create(candidate, metadata)`, `replace(candidate, expectedRecord)`, `updateMetadata(expectedRecord, metadata)`, `remove(expectedRecord)`, `cleanup`, `select`, `release`, `open(documentId)` and `migrateLegacy(documentId, metadata)`. The legacy `commit(candidate)` bridge method is removed.

Native and TypeScript validation reject invalid metadata. The adapter reconstructs only public record/state fields and accepts UUID handles, never paths, source filenames or document bytes. Swift errors are sanitised.

## Committed state format

The existing app-private `PrescriptionDocuments/state.json` is the sole committed source of truth. It now supports version 2:

```json
{
  "version": 2,
  "records": [
    {
      "id": "<stable record UUID>",
      "documentId": "<opaque document UUID>",
      "kind": "standard",
      "medicationIds": [],
      "expiresOn": "<user-supplied YYYY-MM-DD>"
    }
  ],
  "pendingCleanup": []
}
```

Optional issuedOn/startsOn are omitted when absent. Documents still use the existing `documents/<UUID>/document.pdf|jpg|png` containers. Candidates remain in the separate `candidates/<UUID>` namespace. These are internal native paths and never cross the bridge.

A transitional version 2 state may instead contain `records: []`, `legacyDocumentId: "<legacy document UUID>"` and a cleanup array. No incomplete prescription record is inserted. The bridge represents no pending legacy item as null; the TypeScript adapter omits the optional property.

Every retained document ID, record ID and cleanup ID must be valid and unique in its respective set. Cleanup IDs cannot overlap retained documents or the legacy reference. An empty collection with pending deletion cleanup is valid.

## Safe legacy migration

The old format is an unversioned object with optional `current` and `pendingCleanup` UUIDs. Reading it returns an explicit legacy reference and translates its cleanup pointer to an array **without rewriting the file or changing the document**. Unknown versioned/corrupt state is never treated as an empty or legacy wallet.

The UI shows **Saved prescription — details needed**. The user can view it through the existing authenticated native `open` path before completing metadata, including after a failed completion attempt. Normal collection mutations are blocked until completion. Existing legacy cleanup debt must be retried first; that operation preserves the legacy reference.

The form requires explicit kind and expiry. It does not prefill dates or invent medication links. New/migrated records are unlinked; optional dates are included only when entered. Existing medication links are preserved when editing metadata; medication linking UI is deferred until it can use real Medication IDs.

`migrateLegacy` validates metadata, checks the expected legacy reference and existing document, allocates a new record ID, and atomically publishes a version 2 state referencing the **same stored document**. It never copies, moves, modifies or deletes that document.

Retries use persisted state:

- Before commit: legacy state remains authoritative, so viewing and retry stay available.
- After commit/lost response/restart: find the persisted record by document ID. Identical metadata returns that exact record without rewriting state. Different metadata rejects as stale/conflicting state; use normal metadata editing instead.
- If the migrated record was later replaced/deleted, an old migration request fails rather than recreating it.
- A leftover `state.next` is uncommitted staging, never evidence that migration completed. It is ignored on reads and overwritten by the next transaction.

There is no in-memory migration-completed flag.

## Transactions, cleanup and security

Native storage serialises transactions across its instances in this process. Replacement, metadata editing and deletion compare the complete expected record, including both IDs and every metadata field. All mutations reject cleanup-pending state.

Before publication, metadata is encoded to `state.next`, given complete iOS file protection and backup exclusion, and flushed. A same-directory atomic rename publishes `state.json`, followed by a parent-directory flush. The previous committed state remains available on staging/protection/pre-commit failure.

If publication succeeds but its durability acknowledgement fails, native returns `prescription_documents_commit_uncertain`. It preserves referenced copies rather than pretending to roll back. Imports return a typed `verification-required` outcome and still release the candidate; the UI reloads state and asks the user to check it before retrying. Cleanup and orphan recovery flush the committed state's directory before deleting copies. New document files and their container directories are flushed before publication.

Imports copy candidates into fresh protected, backup-excluded document containers before publishing metadata. Replacement changes only document ID, preserving record ID and metadata. Deletion removes only the selected record. Both commit cleanup IDs in the same state as their record change, before any old stored document is removed. External source files are never deletion targets.

Cleanup removes only journalled, unreferenced app-owned copies and persists each completed entry. Removal/write failure leaves retryable journal entries; an already-missing superseded file is tolerated. Candidate release operates only within the candidate namespace and is idempotent. UI retries are provided for cleanup and candidate-release failures.

Startup orphan recovery first reads validated committed state. It protects collection document references, pending cleanup IDs and the legacy document. It removes unreferenced app-owned copies and abandoned candidates; unreadable/corrupt state prevents document cleanup. Recovery never uses a partly written stage to decide which documents to retain.

Native authentication retains the tested `LAContext.deviceOwnerAuthentication` policy, including its existing system fallback and cancellation behavior. Every stored-document view checks membership, authenticates, then rechecks membership before Quick Look presentation. Cancellation stays quiet in the UI; authentication failure does not open/import a document. No document content is held in React state or logs.

## UI

Library navigation remains unchanged. Prescriptions lists standard/temporary records, required expiry and supplied optional dates, with a derived Expired indication. Each record offers View, Edit details, Replace document and confirmed Delete. Add uses the metadata form then Files selection. Replacement also requires explicit confirmation. The screen contains no medication stock controls.

Expiry refreshes while the screen is open and on app activation. Failed loading shows Retry rather than a fabricated empty wallet. Pending cleanup blocks mutations while retaining viewing access.

## Validation

Run JavaScript checks from `app/`:

```sh
npm test -- --runInBand
npm run lint
npx tsc --noEmit
```

Run `git diff --check` from the repository root.

Native storage tests use temporary synthetic files, the actual Swift store, pre-commit/post-publication fault hooks and a failing file manager. They cover uncertain commit acknowledgement as well as pre-commit failure. On an Apple-silicon Mac, from the repository root:

```sh
xcrun --sdk macosx swiftc -target arm64-apple-macos11.0 \
  app/ios/PrescriptionDocumentStorage.swift \
  app/ios/tests/PrescriptionDocumentStorageTests.swift \
  -o /tmp/personal-os-storage-tests
/tmp/personal-os-storage-tests
```

Use `x86_64-apple-macos11.0` on an Intel Mac. The test source is outside the app target. macOS tests exercise storage/recovery; iOS file-protection calls remain iOS-only and require device verification.

Before marking the milestone complete:

- Build the iOS application in Xcode and check bridge selectors and all collection operations.
- Run native storage tests, including identical/conflicting migration retries, lost response, leftover stage, interrupted replacement, failed migration/deletion/cleanup and orphan safety.
- Exercise upgrade from a seeded legacy installation, with and without cleanup debt, across app termination before/after commit.
- On a physical iPhone, verify Face ID success/cancellation/failure and the existing fallback for both legacy and collection records; verify no preview appears on failed authentication.
- Verify Files/iCloud permissions, external source preservation, complete protection/backup exclusion for directories, staged metadata, candidates and committed files, and behavior when locked/backgrounded.
- Test Quick Look, stock isolation, small-screen layout, Dynamic Type and VoiceOver.
- Validate filesystem durability and recovery under interruption on the actual Apple filesystem. Linux/mock tests are not evidence of device-level durability or protection.

A pending legacy item requires user-supplied metadata to become a valid collection record. Corrupt or missing stored documents are not guessed/reconstructed. Downgrading to an old single-current build is unsupported once version 2 has been written; retain the upgraded app when testing migration.
