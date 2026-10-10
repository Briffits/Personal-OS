# Medication collection test audit

## Count reconciliation

Baseline: `dd9f6bf` (`Refine Medication card actions and persist editable name`). An isolated copy of HEAD collected 268 tests in 9 suites. That audit run had one wallet-test timeout (267 passed); it establishes the count, not a clean baseline validation. The working tree was not reset, and no stash was read or applied.

The reported 237-test intermediate state is not a committed snapshot. Its count can be reconstructed from the collection test blocks preceding the later regression/unlink additions already present when this session resumed:

| Suite                       |               HEAD | Initial collection report (reconstructed) |        Resumed tree |               Final |
| --------------------------- | -----------------: | ----------------------------------------: | ------------------: | ------------------: |
| App                         |                  5 |                                         5 |                   5 |                   5 |
| MedicationScreen            |                 47 |                                        21 |                  47 |                  47 |
| medicationNameStorage       |                  9 |                                   removed |             removed |             removed |
| medicationStockStorage      |                 29 |                                   removed |             removed |             removed |
| medicationService           |             absent |                                        30 |                  36 |                  36 |
| NativeMedicationStorage     |             absent |                                         3 |                   3 |                   3 |
| PrescriptionWalletScreen    |                 28 |                                        28 |                  32 |                  32 |
| prescriptionDeletion        |             absent |                                    absent |                  12 |                  14 |
| prescriptionService         |                 71 |                                        71 |                  71 |                  71 |
| NativePrescriptionDocuments |                 60 |                                        60 |                  60 |                  60 |
| currentPrescriptionService  |                 13 |                                        13 |                  13 |                  13 |
| prescriptionMigration       |                  6 |                                         6 |                   6 |                   6 |
| **Total**                   | **268 / 9 suites** |                        **237 / 9 suites** | **285 / 10 suites** | **287 / 10 suites** |

Exactly: `268 - 9 - 29 - 47 + 21 + 30 + 3 = 237`, a net reduction of 31. The resumed tree already added 26 screen cases, 6 service cases (five invalid-name variants and invalid unlink ID), 4 wallet unlink-failure cases and 12 coordinator cases: `237 + 48 = 285`. This session adds two empty/pending-migration deletion cases and strengthens both existing action-sheet parity cases without changing their count.

## Removed storage suites

All nine `medicationNameStorage` cases were removed with the singleton module:

- Absent-name fallback: obsolete; collections must not fabricate “Medication A”. Empty-state and native migration tests replace it.
- Independent name/stock writes and reloads, and rename before stock exists: replaced by collection service field-preservation, screen null/zero/positive-stock rename, navigation and native restart checks.
- Two blank-name writes and two invalid stored names: replaced by service invalid-name validation, malformed collection checks and Swift invalid legacy-name cases.
- Read errors and false/rejected writes: collection read/write failures now flow through the native adapter and UI. Native Keychain publication/failure tests replace react-native-keychain boolean-result assertions.

All 29 `medicationStockStorage` cases were removed with its module:

- Absent credentials (1), valid legacy counts (3), malformed stored JSON/counts (12): responsibility moves to Swift migration/decoding tests, with TypeScript collection validation and bridge rejection tests for incoming data.
- Sanitised read failure (1): native bridge emits fixed errors without raw Keychain details; UI and adapter error-path tests remain. Security behaviour still requires native execution.
- Valid singleton-format writes/protection (3): the old write format is obsolete. Collection commands replace singleton writes; Keychain protection is checked by native review/device validation, not Jest mocks.
- Invalid numeric writes (6): replaced by service numeric validation/overflow and Swift invalid-command cases.
- False native write result and sanitised rejected write (2): obsolete boolean API; replaced by native throwing write/uncertain-commit paths and service/UI failure handling.
- Isolated singleton clear (1): obsolete removed API. Medication deletion now removes only a selected stable record; source singleton entries remain untouched recovery copies.

Swift cases include loops over multiple inputs, so they are not numerically interchangeable with expanded Jest `test.each` cases and are not included in Jest totals.

## Screen and navigation coverage

The initial screen rewrite was not only consolidation: relevant regressions needed restoring. The resumed tree already contained those additions. Mapping of all 47 original screen cases by behaviour:

| Original cases                                                                 | Collection coverage / disposition                                                                                                                     |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial recording 0/7 (2)                                                      | Two recording-current-stock cases; absolute value and Add availability                                                                                |
| Zero and successive adds (1), correction 0/trimmed 7 (2)                       | Consolidated into successive additions and replacement test, plus unrecorded-zero correction                                                          |
| Invalid absolute input (10)                                                    | Ten cases now each exercise both recorded and unrecorded medications                                                                                  |
| Invalid additions (7), overflow (1)                                            | Screen rejection cases plus service invalid-addition matrix and overflow test; no need to duplicate every value at every layer                        |
| Loading (1), failed read/retry (1), repeated failures (1), duplicate retry (1) | Collection loading/retry tests; no partial name/stock snapshot                                                                                        |
| Tap/long press/VoiceOver correction (1), action parity (2)                     | Informational-card test and two parity cases. This session extends parity to every menu index, Edit, Delete and Cancel, including duplicate callbacks |
| Duplicate prompts/submission/overlapping saves (1)                             | Collection write guard test and stale-revision service test                                                                                           |
| Failed save (1), failed first record (1), failed rename (1)                    | Parameterised record/correct/edit failures plus failed-add/reload and uncertain-publication tests                                                     |
| Cancel stock prompt (1), unmounted prompt (1)                                  | Cancelled callback/fresh prompt and unmounted callback tests                                                                                          |
| No prescription controls (1)                                                   | No document controls or prescription reads on card entry; optional metadata selection in Add/Edit is intentionally new                                |
| Rename with null/0/12 stock (3)                                                | Three rename-preservation cases and independent arithmetic tests                                                                                      |
| Invalid name empty/blank/undefined (3)                                         | Two UI blank-name cases and service invalid-name matrix including undefined                                                                           |
| Name-read failure (1)                                                          | Unified collection read-failure tests; no separate name read remains                                                                                  |
| Rename blocks stock/rename/Back (1), cancelled/unmounted rename (1)            | Busy form, stale form, cancellation and unmount tests                                                                                                 |
| Rejected read waits for other read (1)                                         | Obsolete: one atomic collection read replaces two independent singleton reads                                                                         |

The five App tests remain five: navigation and persistence now use collection records; prescription deletion asserts unlinking and stock preservation. Existing prescription service, native adapter and migration suites remain unchanged. Wallet compatibility-array preservation remains tested. No obsolete singleton implementation was restored to inflate totals.

No still-relevant behaviour identified in this audit remains without a corresponding test. Some persistence/security coverage has moved to **unrun Swift tests**, so this does not establish native correctness on Linux.

## Deletion and restart coverage

Coordinator tests cover one/many matches, other prescriptions, already-unlinked records, empty/pending collections, cancellation, read/write/stale failures, lost acknowledgements, retry, partial deletion and document-cleanup failure. Restart in Jest serializes and validates a snapshot into a fresh service/test store; it does not prove Keychain durability. Swift tests exercise bulk unlink against the actual collection implementation and a shared injected Keychain, then read through a fresh storage instance; failure and uncertain-publication cases are included but await Mac execution.

## Final validation

Final VPS results: **287 tests passed across 10 suites**, zero snapshots; `npm run lint` passed with no warnings; `tsc --noEmit` passed. All 26 changed applicable TS/TSX/Markdown files were formatted and passed Prettier checks (no changed JSON files). `git diff --check` passed.

Mac/Xcode/iPhone validation remains required: compile/run both medication Swift executables and existing prescription native regression tests; build the app; test in-place singleton upgrade, repeated launches, interrupted writes, device lock/unlock, deletion/retry, offline operation, VoiceOver and large Dynamic Type. No Swift or native validation is claimed from Linux.

## Working-tree inventory

37 changed paths: 14 modified, 19 new/untracked, 4 deleted. No commit or push was made. The EXPIRING SOON stash was left untouched.

Modified:

```text
AGENTS.md
README.md
app/__tests__/App.test.tsx
app/__tests__/MedicationScreen.test.tsx
app/__tests__/PrescriptionWalletScreen.test.tsx
app/ios/PersonalOS.xcodeproj/project.pbxproj
app/src/components/PrescriptionMetadataForm.tsx
app/src/prescriptions/prescription.ts
app/src/prescriptions/prescriptionService.ts
app/src/screens/MedicationScreen.tsx
app/src/screens/PrescriptionWalletScreen.tsx
docs/MVP_SPEC.md
docs/PRESCRIPTION_WALLET.md
docs/PROJECT_OVERVIEW.md
```

New/untracked:

```text
app/__tests__/NativeMedicationStorage.test.ts
app/__tests__/medicationService.test.ts
app/__tests__/prescriptionDeletion.test.ts
app/ios/MedicationCollectionStorage.swift
app/ios/MedicationKeychain.swift
app/ios/MedicationStorageBridge.m
app/ios/MedicationStorageModule.swift
app/ios/tests/MedicationCollectionStorageTests.swift
app/ios/tests/MedicationKeychainTests.swift
app/src/components/MedicationCard.tsx
app/src/components/MedicationForm.tsx
app/src/coordination/prescriptionDeletion.ts
app/src/medications/currentMedicationService.ts
app/src/medications/medication.ts
app/src/medications/medicationService.ts
app/src/native/NativeMedicationStorage.ts
app/test-utils/medicationFixture.ts
docs/MEDICATION.md
docs/MEDICATION_TEST_AUDIT.md
```

Deleted obsolete singleton implementation/tests:

```text
app/__tests__/medicationNameStorage.test.ts
app/__tests__/medicationStockStorage.test.ts
app/src/storage/medicationNameStorage.ts
app/src/storage/medicationStockStorage.ts
```
