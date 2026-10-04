# Personal OS — MVP Specification

## Purpose

This document defines the first working version of Personal OS.

The MVP should prove one core proposition:

> Personal OS can reduce the mental effort required to understand what deserves the user's attention today.

The MVP is intentionally limited in scope.

Do not implement features that are listed as future work unless explicitly requested.

---

## Platform

Personal OS MVP is:

- iPhone-first
- built with React Native
- written primarily in TypeScript
- allowed to use native Swift modules where Apple-specific APIs require them

The project should remain architected so future platforms may be added later, but no Android, iPad, Mac or web client is required for the MVP.

---

## MVP Core Navigation

The application should include these main areas:

### Today

Mandatory main screen.

Today must always remain available.

### Ask

Placeholder only in the first build.

No AI functionality is required initially.

### Capture

Placeholder only in the first build.

No voice, camera or file processing is required initially.

### Library

Provides access to the Prescription Wallet.

Other library features may remain placeholders.

### Settings

Accessible from the main interface.

---

## Today Screen

The Today screen should use this structure:

### NOW

One highest-priority action.

### TODAY

Two additional priorities.

The initial implementation may use placeholder or test data.

The goal is to establish the interface structure before connecting real task or calendar sources.

Example:

```text
NOW

Call pharmacy
Estimated time: 5 minutes

TODAY

Finish Codistry exercise
Estimated time: 40 minutes

Reply to important email
Estimated time: 10 minutes
```

---

## Prescription Wallet

Prescription Wallet is a standalone collection of retained documents, separate from Medication. A prescription may link to zero, one or many medication IDs; a medication may relate to zero, one or many prescriptions. Prescriptions do not own medication records and are never properties of medications. Medication stock tracking continues independently.

Each prescription has a stable `PrescriptionRecordId`, a separate opaque document ID and metadata:

- `kind`: `standard` or `temporary`;
- `medicationIds`: a readonly array of unique, non-blank medication IDs;
- `expiresOn`: required;
- `issuedOn`: optional;
- `startsOn`: optional for temporary prescriptions only.

Dates must be real `YYYY-MM-DD` calendar dates, including leap-year validation. Both `startsOn` and `issuedOn`, when supplied, must be on or before `expiresOn`.

Multiple prescriptions may be retained simultaneously. Every retained record is assumed current; there is no persisted inactive or expired status. Expiry is derived after the expiry day using the user's calendar date. Expiry never deletes a record. Deletion and document replacement require explicit confirmation. Replacement retains the record ID and metadata and changes only the associated document ID.

Documents remain app-private. JavaScript receives opaque identifiers, never filesystem paths. Atomic storage mutations, candidate release, interrupted-commit recovery, file protection, backup exclusion, stale-ID rejection and safe replacement remain required.

Metadata is independently editable through `updatePrescription(recordId, metadata)`. Validate before mutation and preserve both IDs. The durable `updateMetadata(expectedRecord, metadata)` transaction compares the complete existing record and rejects stale snapshots, unknown records and pending cleanup without mutation. Metadata-only updates perform no document, candidate or cleanup operations.

This iteration implements the platform-independent TypeScript model, collection service and tests. The existing native store and screen remain legacy single-document implementations pending the [native and UI migration](PRESCRIPTION_WALLET.md). No collection persistence is fabricated in JavaScript.
