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

Implemented as a distinct navigation placeholder labelled Ask, with a visible
"Not available yet" message. The main tabs remain available for returning to
Today or Library. No question entry, AI processing or connected-source access is
implemented.

### Capture

Implemented as a distinct navigation placeholder labelled Capture, with a visible
"Not available yet" message. The main tabs remain available. No capture controls,
voice, camera, photo or file processing is implemented.

### Library

Provides independent access to Medication and Prescriptions, each with a return
to Library.

Other library features may remain placeholders.

### Settings

The Settings button on Today opens a labelled navigation placeholder with a
"Not available yet" message and a Back to Today button. The tab bar is hidden
while Settings is open, matching the existing secondary-screen pattern. There
are no settings controls or saved preferences.

### Shell navigation boundary and validation

Today remains the default on launch. Ask, Capture and Settings are navigation
placeholders, not completed features. Navigation state is held only in React
state. Opening these screens performs no storage, document-picker, biometric or
permission operations. Existing Medication and Prescriptions operations remain
behind their Library destinations.

The shell reuses semantic colours, spacing, typography, geometry and AppCard.
Placeholder cards use the standard variant. New buttons have minimum 44-point
touch targets and accessible labels; content scrolls and text scaling is uncapped.

App navigation tests cover distinct destinations, selected tabs, Settings return
and repeated visits, fresh-launch Today, existing Library return paths, and zero
native data/document operations during shell navigation. Run TypeScript, ESLint
and Jest from `app`. React renderer checks do not establish actual iOS layout or
focus behaviour: small-screen wrapping, largest Dynamic Type, light/dark appearance,
VoiceOver reading order and focus after navigation still require device checks.

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

Prescription Wallet is a standalone collection of retained documents, separate from Medication. One prescription may relate to many medications; a medication may link to zero or one prescription. `MedicationRecord.prescriptionId` is the only canonical relationship. Prescription `medicationIds` remains legacy compatibility data, preserved but not interpreted as links. Neither domain owns the other's records. Medication stock tracking continues independently.

Each prescription has a stable `PrescriptionRecordId`, a separate opaque document ID and metadata:

- `displayName`: a user-defined label, required by the entry/edit form; optional in persisted v2 records for compatibility, with “Unnamed prescription” shown when absent;
- `kind`: `standard` or `temporary`;
- `medicationIds`: a readonly array of unique, non-blank medication IDs retained for legacy compatibility only;
- `expiresOn`: required;
- `issuedOn`: optional;
- `startsOn`: optional for temporary prescriptions only.

Dates must be real `YYYY-MM-DD` calendar dates, including leap-year validation. Both `startsOn` and `issuedOn`, when supplied, must be on or before `expiresOn`.

Multiple prescriptions may be retained simultaneously. Every retained record is assumed current; there is no persisted inactive or expired status. Expiry is derived after the expiry day using the user's calendar date. Expiry never deletes a record. Deletion and document replacement require explicit confirmation. Replacement retains the record ID and metadata and changes only the associated document ID.

Documents remain app-private. JavaScript receives opaque identifiers, never filesystem paths. Atomic storage mutations, candidate release, interrupted-commit recovery, file protection, backup exclusion, stale-ID rejection and safe replacement remain required.

Metadata is independently editable through `updatePrescription(recordId, metadata)`. Validate before mutation and preserve both IDs. The durable `updateMetadata(expectedRecord, metadata)` transaction compares the complete existing record and rejects stale snapshots, unknown records and pending cleanup without mutation. Metadata-only updates perform no document, candidate or cleanup operations.

The collection service now connects to native versioned collection storage and the Prescriptions UI. Legacy documents remain available through authenticated viewing until the user supplies required metadata; migration reuses their existing stored documents and commits collection state atomically. See [storage, migration and validation status](PRESCRIPTION_WALLET.md). Mac/Xcode and physical-iPhone validation remain required; no collection persistence is fabricated in JavaScript.

## Medication collection

Medication supports multiple independently identifiable records, a visible Add medication action, compact informational cards, and matching long-press/VoiceOver actions. Each record persists its stable ID, display name, stock (`null` means unrecorded) and optional canonical `prescriptionId`. Add/Edit allows at most one existing prescription or None / Unlinked. Normal tap never changes stock. Deleting medication requires confirmation and never deletes a prescription.

Legacy singleton name/stock migrate without fabricated values or associations. Stock-only legacy data remains pending until the user supplies a name. Native Keychain storage uses serialized, revision-checked updates; legacy entries remain untouched. Confirmed prescription deletion must first unlink matching medications without deleting them or changing their stock; unlink failures stop deletion explicitly. See [Medication storage and migration](MEDICATION.md) for schema, failure handling and tests. No scheduling or dose ownership is introduced; Apple Health remains responsible for both.
