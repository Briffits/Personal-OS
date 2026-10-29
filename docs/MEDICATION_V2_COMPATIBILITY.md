# Medication v2 compatibility — implementation and validation

Implementation review: 28 October 2026. Rehearsal evidence reviewed: 29 October 2026.

Both isolated synthetic device rehearsals completed successfully against implementation
commit `09c5a4bef3752d229f9f40d80ba248f6fc460327`. This update changes documentation
only; no production installation or merge was performed. See the
[sanitised evidence summary](MEDICATION_V2_REHEARSAL_EVIDENCE.md).

## Provenance and scope

- Branch: `feat/medication-v2-compatibility`.
- Implementation parent: `14bae037ff3f7c6febe9016ea4e9d693f8fc825c`.
- Tested implementation checkpoint: `09c5a4bef3752d229f9f40d80ba248f6fc460327`.
- Selectively adapted Phase 1 reference: `39e8f589d7b45adcbd2973f93059e2aa38cc02c4`; no old-branch merge.
- Recorded installed-v2 source: `a7a78c0d17d2f74376d7d6caa5fc4c9f013d218e`; its medication source matches baseline `ce7e0542d85778f441a5773683cb865d1c15feee`. The preceding review verified the 15-file icon/startup-only diff and clean v2 worktree. Existing build evidence establishes historical Today/icon acceptance, not retained-device storage correctness.

The change adds complete-envelope v1 migration, zero-write v2 reads, matching native/TypeScript models and commands, local manual stock arithmetic and decimal input. Recognized stock history, thresholds and opaque source references survive edits/unlinks. Linked or retained-source records cannot undergo stock mutations at the native boundary, and cannot display a gross manual total. Unsupported schema versions have a distinct write-blocking error from malformed records.

No Keychain wrapper, bridge, project, scheme, entitlement, signing, deployment, dependency or lockfile change. Existing main Health access, navigation and Reminders implementation remain in place. No old Health integration, queries, link controls or threshold-editing commands were imported. Existing dependencies/Pods/generated iOS sources were independently copied from the matching main-icon worktree; package and Pod locks match, with no installs or dependency changes.

## Committed implementation checkpoint scope

Modified:

```text
app/__tests__/App.test.tsx
app/__tests__/MedicationScreen.test.tsx
app/__tests__/NativeMedicationStorage.test.ts
app/__tests__/medicationService.test.ts
app/__tests__/prescriptionDeletion.test.ts
app/ios/MedicationCollectionStorage.swift
app/ios/tests/MedicationCollectionStorageTests.swift
app/src/components/MedicationCard.tsx
app/src/medications/medication.ts
app/src/medications/medicationService.ts
app/src/screens/MedicationScreen.tsx
app/test-utils/medicationFixture.ts
docs/MEDICATION.md
```

Added:

```text
app/__tests__/medicationCompatibility.test.ts
app/ios/tests/MedicationV1DowngradeTests.swift
app/ios/tests/run-medication-checks.sh
app/src/medications/countArithmetic.ts
app/src/medications/medicationStock.ts
app/test-utils/fixtures/README.md
app/test-utils/fixtures/medication-v2.json
docs/MEDICATION_V2_COMPATIBILITY.md
```

The two lists above are the exact 21-file implementation checkpoint scope, committed
and pushed before rehearsal. This follow-up changes only this report and adds the
sanitised evidence summary. Rehearsal targets/configuration, dependencies/build output,
private logs, profiles, credentials, device exports and unrelated worktree changes
remain excluded from the compatibility PR.

Production changes are one native store, matching model/service and manual stock helpers, plus the existing card/screen. Remaining changes are synthetic fixtures/tests and documentation. No files deleted. Reviewed and pre-review patch exports are retained privately outside Git.

## Original implementation validation (historical)

| Check                                                 | Result                                                                                          |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Medication native in-memory tests                     | 22 passed                                                                                       |
| Pinned main/v1 reader against actual migration output | Passed: read and mutation reject, zero writes/fallback                                          |
| Jest                                                  | 415 tests across 17 suites accounted for as passing after focused repair; see run history below |
| TypeScript `tsc --noEmit`                             | Passed after focused repair                                                                     |
| ESLint `npm run lint`                                 | Passed, no warnings                                                                             |
| Native prescription storage                           | 30 synthetic-file tests passed                                                                  |
| Native Reminders                                      | 15 synthetic tests passed; no EKEventStore created                                              |
| Native startup filter                                 | 4 tests passed; no app launch                                                                   |
| Unsigned generic-iOS Debug build                      | Succeeded, exit 0, `CODE_SIGNING_ALLOWED=NO`                                                    |
| `git diff --check`                                    | Passed                                                                                          |

The first full Jest run passed 413 tests and failed two inherited service tests that still called excluded threshold-editing commands. Those tests now seed/preserve threshold data without exposing that feature. Only the affected service suite was rerun: all 38 tests passed. The other 16 suites passed in the full run, including Medication UI, frozen compatibility, current App/navigation, Reminders UI/bridge and Health access. Final review moved version detection before schema-specific validation so a future envelope with only a version marker receives `unsupported-version`. The three affected Jest suites were rerun (76/76 passed), as were the 22 native medication cases, pinned downgrade check, TypeScript, lint and incremental unsigned build; all passed. No claim is made of a second full-suite run.

Native coverage includes exact frozen-v2 byte preservation across reads/restarts; edit/unlink field preservation; no Health-source stock mutations even for identical tokens or absent baselines; null/zero/max-safe-integer migration; empty/multi/pending collections; unchanged recovery bytes; failed and lost-acknowledgement migration; verification failure; exhausted revisions; stale additions after lost acknowledgement; malformed/unsupported envelopes; concurrent initialization/mutation; and downgrade rejection. TypeScript/UI tests consume the same frozen JSON and exercise bridge validation, permitted edits, source-unavailable states, menu/VoiceOver parity, decimal input and failure blocking.

The medication runner never compiles the Security wrapper or runs the Keychain smoke test. Prescription native tests use temporary synthetic files only. Health access regression evidence is mocked Jest plus compilation of current main's native module; no Health authorization or real query was performed.

Build command (from `app`):

```sh
xcodebuild -workspace ios/PersonalOS.xcworkspace -scheme PersonalOS \
  -configuration Debug -destination 'generic/platform=iOS' \
  -derivedDataPath /tmp/PersonalOS-medication-v2-compatibility-unsigned \
  CODE_SIGNING_ALLOWED=NO build
```

The initial sandboxed Xcode attempt failed before compilation while accessing workspace/services. The identical unsigned build succeeded outside the sandbox. Swift package/prescription regressions likewise needed compiler-cache access outside the sandbox. Dependency/generated JavaScript and script-output warnings remain; no build errors. No project or deployment configuration was changed to make the build pass.

Local logs and synthetic runner outputs remain private. The final native, affected
Jest and unsigned-build logs were inspected for this documentation update; their
results match the counts below. Earlier regression results remain historical rather
than newly rerun evidence. Raw logs are not repository artifacts.

## Independent review findings and repairs

All 21 files were reviewed against the pinned base, including production data flow, test doubles/runners, frozen fixture and documentation. The earlier passing counts were not used as evidence that edge cases were correct.

1. **High — decoded opaque identities could change during an unrelated write.** On this Darwin Foundation, `JSONSerialization` decodes both literal and escaped leading U+FEFF away: a stored `"\\ufeffSynthetic"` becomes `"Synthetic"`. A nonblank opaque reference could therefore be silently changed by a subsequent edit/unlink/correction on another record. Collection decoding now uses a small local `Decodable` JSON value backed by `JSONDecoder`, then the existing strict field validators. No dependency or Keychain change. New tests preserve these scalars in names, active links and baseline sources through reads and unrelated mutations. Existing bytes are never rewritten merely to canonicalize them.
2. **Medium — native and JS blank-name/reference validation disagreed.** Foundation's whitespace set includes U+0085 and U+200B, while ECMAScript trim retains them; ECMAScript additionally strips U+FEFF. This could accept invalid command names in JS or reject native-valid persisted strings in JS. TypeScript now uses the historical native whitespace set for stored name/reference validation and command-name trimming. Stored strings are returned unchanged. The same boundary cases run on both sides.
3. **Medium — timestamp validators disagreed.** Foundation's round-trip parser accepted the Julian leap date `1500-02-29` and five-digit year `10000`, but rejected/normalized Gregorian-cutover dates that JS accepts. Native now explicitly checks the documented four-digit, canonical UTC proleptic-Gregorian format and calendar ranges. Invalid dates fail before publication; no attempted repair of malformed stored data. Tests cover year zero, century leap rules, the 1582 cutover, year 9999/10000, clock fields and trailing newline.
4. **Coverage gap — full-record preservation across every command needed stronger assertions.** Added native comparisons over the complete frozen collection for create/remove, physical correction, legacy addition and bulk unlink; existing tests cover baseline additions, edits and pending completion. These are mutation-specific assertions, not just aggregate test counts.

No additional concrete defect was found in the following reviewed paths:

- **Numeric contract:** Boolean/string/nonfinite/negative values are rejected; fractional quantities and smallest positive Double are readable; revisions and pending stock remain safe integers. MAX_SAFE_INTEGER is preserved; overflow/non-advancing additions reject. Values have binary64/JS-number semantics, not arbitrary-precision JSON decimal semantics. Ordinary decimal input is checked before conversion; extreme Foundation Decimal arithmetic can reject unsupported precision/range without writing. The API does not promise arbitrary decimal precision.
- **Reads/migration:** valid v2 reads return before publication. V1 migration changes the complete envelope once under the shared lock and increments revision once. Missing collection alone permits singleton import. Read failures, malformed/unsupported records and revision exhaustion cannot fall back. A lost acknowledgement requires durable read-back, never additive replay or a claimed rollback.
- **Mutation scope:** create leaves existing records intact; edit changes only name/link; unlink changes only matching prescription links; additions change only the selected stock input; explicit physical correction intentionally replaces that record's baseline and clears superseded additions/legacy stock while retaining threshold/link/name. Remove intentionally deletes only the selected record. Pending completion preserves its ID/quantity and cannot coexist with ordinary records.
- **Health-source safety:** native blocks both stock commands whenever either active link or retained baseline source is non-null, without comparing opaque identities. UI hides those commands and displays unavailable/confirmation-required rather than gross stock. Name edits/unlinks preserve opaque references.
- **Versions/downgrade:** unsupported numeric versions are detected before version-specific fields. Both version and malformed errors block writes. The pinned v1 reader rejects migrated output without fallback. No reverse migration; unknown extra v2 keys are not guaranteed after later mutations, so future fields requiring preservation must bump the version.

## Checks after the review fixes

| Check                                | Result                                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Native medication in-memory suite    | 24 passed, including Unicode/date/numeric agreement and full-record preservation                                             |
| Pinned v1 reader on migrated output  | Passed; zero writes and legacy reads                                                                                         |
| Affected Jest suites                 | 180 passed across 6 suites: compatibility, service, medication screen, native adapter, prescription deletion, App/navigation |
| TypeScript and lint                  | Passed; no lint warnings                                                                                                     |
| Incremental unsigned iOS Debug build | Succeeded, exit 0; no signing/install/launch                                                                                 |
| Diff/allowlist check                 | 21 files; no deployment, dependency, Keychain-wrapper or bridge changes                                                      |

Initial review regression execution exposed the Foundation leading-BOM bug and
failed the native case; that led to the decoder repair rather than weakening the
assertion. A control-character regex lint warning was corrected using named
whitespace escapes. Final native/Jest/build logs remain private. Unchanged
standalone Reminders/startup/prescription suites were not rerun; their earlier
results remain historical. No tests or device actions were repeated for this
documentation update.

## Completed isolated device rehearsals

Both chains used synthetic data, separate private app identities and prepared
Release candidates at the tested implementation commit. Within each chain,
fixture 100 → candidate 200 → inspector 300 → candidate 400 → inspector 500
used in-place upgrades without uninstall/reseed. Candidates embedded JavaScript;
Metro was not used or changed. Inspectors read raw medication bytes only after
an explicit snapshot action; they do not migrate or initialise medication data.

Signing, effective private Keychain groups, profile trust/validity, artifact hashes
and connected-device coverage passed before transitions. No production/shared
access group was claimed. The fixture harness needed a scene-lifecycle correction;
only the isolated harness changed, and all candidate hashes remained unchanged.

### Automated persisted comparisons

- **V1:** baseline A matched the four-record schema-1/revision-7 fixture. B matched
  the complete expected migration at schema 2/revision 8 after repeated candidate
  visits. IDs, names, links, null/zero/max-safe stock and pending state survived;
  no stock baseline or Health source was fabricated. Final C matched the approved
  ledger at revision 12: record 1 renamed, baseline 0.1 with one addition of 0.2,
  legacy stock cleared and both matching prescription links cleared. Every other
  field matched B.
- **Existing v2:** A and B were byte-for-byte and SHA-256 identical to the six-record
  frozen fixture at schema 2/revision 42 after repeated visits. Final C matched
  the explicitly approved v2 ledger at revision 46: record 2 renamed; record 1's
  old baseline/history intentionally replaced with baseline 0.1 and exactly one
  addition of 0.2; all six prescription links cleared. Every threshold, opaque
  Health reference and unrelated field survived. In particular, records 2/3's
  original baseline/addition objects remained unchanged.
- Each final export retained earlier A/B snapshots byte-identically. Snapshot
  summaries matched raw-file hashes; comparisons checked field sets, values,
  record order and addition count. Generated baseline/addition UUIDs, references
  and timestamp order were validated against the run, not assumed stable from
  an unobserved intermediate snapshot.

### User observations (separate evidence)

The user confirmed three read-only Medication visits and two cold relaunches in
both chains, without errors or changed displays. Only newly confirmed v1 visits
count; pre-interruption visits were not confirmed. Both mutation runs displayed
0.3 after one 0.2 addition and retained it after a subsequent cold restart. Ordinary
app switching/navigation was recorded separately and was not counted as a restart.
Cancellation retained the synthetic prescription; confirmed deletion left the
expected medications present and unlinked. In v2, records 2/3 retained unavailable/
confirmation-required stock labels and offered no stock actions; record 2 retained
its unavailable label after renaming. These are UI observations, not per-step
persisted-state measurements.

### Failures resolved during rehearsal

The first fixture installation encountered the free-profile app quota. Later
explicitly authorised test-app retirement resolved capacity; completed v1 evidence
was backed up before v1 retirement for the separate v2 chain. The earlier
Reminders test retirement was separately authorised; both Health test apps were
preserved. The harness startup defect was corrected before
successful seeding. Local launch-command syntax errors were corrected with retained
failed receipts. One v1 snapshot transfer was denied and succeeded on an authorised
retry after unlocking; this is not a systematic Keychain lock/unlock test. No
migration or final-field comparison mismatch remained. No failure was hidden by
resetting or reseeding a measured store.

## Remaining gaps and merge assessment

| Gap | Existing evidence and limit | Assessment for this compatibility change |
| --- | --- | --- |
| Intermediate revisions and generated IDs before unlink | Device snapshots measure A/B/C, not each operation. Native revision/stale-write and full-record tests cover command boundaries. Final delta is +4 in each mutation ledger. | No unexplained final delta or field loss; intermediate device revisions remain unmeasured. |
| Zero correction, invalid/boundary input and comma keyboard | Native fractional/correction tests include zero replacement; MedicationScreen tests reject invalid input without writes; compatibility tests exercise `0,2`, decimal totals and boundary rejection. Both device additions used `0.2`; zero/invalid/comma-input device cases were deferred. | Automated coverage exists; physical keyboard/input coverage is not claimed. No extra device run required for this documentation update. |
| Unsupported source writes | UI menus hid stock actions on device; native injected-store tests reject same-token, different-token, retained-source and missing-baseline cases without writes. | No native bypass/fault injection was attempted on the phone. |
| Accessibility | Renderer tests cover labels and long-press/VoiceOver action parity. | Real VoiceOver focus/reading order, largest Dynamic Type, small-screen layout and visual contrast were not established by these rehearsals; retain as manual release-validation gaps. |
| Lock/unlock and offline conditions | Existing protection policy is unchanged; injected read errors distinguish inaccessible data from absence and block unsafe writes. | No systematic lock/unlock, locked mutation, network-disconnected launch or physical protected-storage recovery test. The transfer retry is not a substitute. |
| Failure/downgrade and other fixture shapes | In-memory tests cover empty/pending v1, malformed/future schemas, failed/lost-acknowledgement writes, stale retries, zero-write v2 reads and pinned-v1 downgrade rejection. | Physical power-loss, interruption inside a Keychain write, cross-device restore and production-identity access remain untested/out of scope. |

No unresolved correctness or preservation failure was identified as a merge blocker
for this scoped implementation from the reviewed evidence. That is a scoped review
finding, not approval to merge or deploy, and does not assert current branch
protection/CI approval. Accessibility and physical protection-state coverage remain
explicit release-validation gaps; this update neither waives them nor expands device
testing automatically. Existing valid-v2 byte equality does not prove zero
identical-value writes; that guarantee is supported by injected write-call tests.

The v1 harness is a pinned old-store fixture, not every historical production UI.
Neither rehearsal proves access to a production identity. No reverse migration is
provided; the pinned v1 reader rejects v2. Private evidence and backups are retained
outside version control. Only the sanitised summary and this documentation update
belong in the follow-up commit.
