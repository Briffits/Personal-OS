# Medication v2 compatibility — implementation and validation

Review date: 28 October 2026. No commit, push, merge, installation or launch.

## Provenance and scope

- New durable worktree: `/Users/Craxoid/Developer/PersonalOS-medication-v2-compatibility`.
- Branch: `feat/medication-v2-compatibility`.
- Verified base and unchanged HEAD: `14bae037ff3f7c6febe9016ea4e9d693f8fc825c` (fetched origin/main).
- Selectively adapted Phase 1 reference: `39e8f589d7b45adcbd2973f93059e2aa38cc02c4`; no old-branch merge.
- Recorded installed-v2 source: `a7a78c0d17d2f74376d7d6caa5fc4c9f013d218e`; its medication source matches baseline `ce7e0542d85778f441a5773683cb865d1c15feee`. The preceding review verified the 15-file icon/startup-only diff and clean v2 worktree. Existing build evidence establishes historical Today/icon acceptance, not retained-device storage correctness.

The change adds complete-envelope v1 migration, zero-write v2 reads, matching native/TypeScript models and commands, local manual stock arithmetic and decimal input. Recognized stock history, thresholds and opaque source references survive edits/unlinks. Linked or retained-source records cannot undergo stock mutations at the native boundary, and cannot display a gross manual total. Unsupported schema versions have a distinct write-blocking error from malformed records.

No Keychain wrapper, bridge, project, scheme, entitlement, signing, deployment, dependency or lockfile change. Existing main Health access, navigation and Reminders implementation remain in place. No old Health integration, queries, link controls or threshold-editing commands were imported. Existing dependencies/Pods/generated iOS sources were independently copied from the matching main-icon worktree; package and Pod locks match, with no installs or dependency changes.

## Exact checkpoint allowlist — proposed, not staged

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

The two lists above are the exact 21-file checkpoint allowlist. Do not use a broad add. Recheck the staged diff against this list only if staging/commit is later authorized. Exclude copied node_modules/Pods/generated build files, DerivedData, local logs/patches, signing files, profiles, credentials, device exports, all existing other-worktree changes, and all future rehearsal targets/configuration. Nothing is staged or committed.

Production changes are one native store, matching model/service and manual stock helpers, plus the existing card/screen. Remaining changes are synthetic fixtures/tests and documentation. No files deleted. The complete patch including untracked additions is exported outside Git to `/tmp/personalos-medication-v2-compatibility-reviewed.patch`. The original `/tmp/personalos-medication-v2-compatibility.patch` is preserved as pre-review evidence.

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

Local evidence (outside Git):

- `/tmp/personalos-medication-v2-compatibility-jest.log` — initial full run, including the two resolved failures.
- `/tmp/personalos-medication-v2-service-retest.log` — 38/38 affected tests passed.
- `/tmp/personalos-medication-v2-version-retest.log` — final 76/76 validation/UI/adapter tests passed.
- `/tmp/personalos-medication-v2-native-final.log` — final 22 native cases and downgrade check.
- `/tmp/personalos-medication-v2-build-final.log` — final incremental unsigned build succeeded.
- `/tmp/personalos-medication-v2-compatibility-build.log` — sandbox failure.
- `/tmp/personalos-medication-v2-compatibility-build-unrestricted.log` — successful unsigned build.
- `/tmp/personalos-medication-v2-reminders-native-unrestricted.log`.
- `/tmp/personalos-medication-v2-startup-native-unrestricted.log`.
- `/tmp/personalos-medication-v2-prescription-native.log`.
- Medication runner retained synthetic executables and migrated JSON in the reported `personalos-medication-v2.JVYKbE` temporary directory.

Raw build logs should stay local and be reviewed before publication. They are not repository artifacts.

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

Initial review regression execution exposed the Foundation leading-BOM bug and failed the native case; that led to the decoder repair rather than weakening the assertion. A control-character regex lint warning was corrected using named whitespace escapes. Final logs are `/tmp/personalos-medication-v2-review-native-fixed.log`, `/tmp/personalos-medication-v2-review-jest-fixed.log`, and `/tmp/personalos-medication-v2-review-build.log`. The synthetic native harness is retained in `personalos-medication-v2.Y35jOb` under the system temporary directory. Original logs remain preserved. Unchanged standalone Reminders/startup/prescription suites were not rerun; their earlier results remain historical. The build compiles current main's native integrations, and no real data/permissions were queried.

## Isolated upgrade rehearsal — plan only

### Existing iPhone assessment and identity gate

The existing iPhone can host the core rehearsal alongside production/v2, **conditional on verifying isolation before installation**. A separate physical device is not inherently required for migration, v2 preservation, decimals, unlinking or UI accessibility.

Proposed test bundle ID: `com.briffits.personalos.medication-rehearsal` (availability/provisioning not checked). Both fixture build and candidate must resolve to that exact ID and the same actual App ID prefix, team and effective private Keychain group. Use the app's private application-identifier group, `<AppIdentifierPrefix>com.briffits.personalos.medication-rehearsal`, as its sole effective group. Do not assume the prefix always equals the team ID. Do not add production groups, wildcard group entitlements, App Groups, shared containers, iCloud containers or extensions. A distinct display name/icon must make the test app unmistakable.

Apple documents that absent an explicit group, inserts use the default group while queries/updates search all accessible groups. The unchanged production wrapper omits a group, so isolation depends on the **effective signed entitlements**, not merely an xcconfig or bundle-ID label. Inspect the two signed artifacts and their provisioning entitlements locally before any install: resolved bundle/application IDs, prefix, team, default/access groups and absence of shared containers. Record source/overlay hashes, artifact hashes, resolved identities and the intended synthetic fixture in a local pair manifest. Their access sets must contain no production group. Do not test isolation by querying production items. See [Apple's Keychain access-group rules](https://developer.apple.com/documentation/security/ksecattraccessgroup) and [private-group/default-group behavior](https://developer.apple.com/documentation/security/sharing-access-to-keychain-items-among-a-collection-of-apps).

Keep service/account strings and `WhenUnlockedThisDeviceOnly`/nonsynchronizing protection unchanged **inside the test app**: separation comes from its private access group. Keep production sources and production identity unchanged. A prefix change can lose access on update even with the same bundle suffix; see [Apple TN2311](https://developer.apple.com/library/archive/technotes/tn2311/_index.html). Provisioning eligibility, signing certificate and device registration remain unverified here; no account, Keychain or device lookup was performed.

### Build pair and harness boundary

Prepare future rehearsal artifacts in a separate durable rehearsal checkout/overlay, excluded from this checkpoint:

- **Fixture build A:** dedicated fixture-only target signed as the test identity, using the pinned `14bae037…` v1 store for its medication operations. Compile fixture seeding/inspection controls only into this target or its hosted XCTest bundle, never behind production runtime flags. Seed explicit synthetic v1 envelopes (empty, multi-record null/zero/max, pending) only in this test app's private group. Read back and record synthetic bytes/revision before proceeding. Seeder must refuse an unexpected application identity or pre-existing unrecognized state; do not assume uninstall removed Keychain state.
- **Candidate build B:** exact reviewed candidate source and production medication paths, signed as the same test identity, with a higher build number. No fixture seeding or fault switches in its executable. If inspection is needed, use a separate hosted XCTest bundle, not production startup/bridge code. Keep native code and JS bundle from the same source revision.
- Use the same private group, application identifier, supported signing team/prefix and container identity for A and B. Install B **over A without uninstall/reset** after separate authorization. That is the actual in-place update being rehearsed; changing the bundle ID between A and B would instead create another app.
- Use embedded JS bundles, not the production/v2 Metro server. Future rehearsal-only entitlements should omit Health/shared-container capabilities, and the run must never enter Health or Reminders access screens or document pickers. Current Today startup does not initialize medication or query those integrations. Use synthetic prescription documents generated within the test app's private container; no user documents or shared storage.
- For existing-v2 testing, prepare a separate fixture-only build A2 under the same identity before a separate B upgrade cycle. A2 seeds the frozen v2 bytes, including threshold/source data. It must bypass the v1 reader, which correctly refuses v2. Any between-cycle replacement of test state requires explicit, narrowly scoped authorization and confirmation that the state is synthetic. Alternatively use a fresh unique test bundle suffix per cycle, fixed within each A/B pair. No production identity is used.

### Rehearsal matrix and evidence

1. **V1 upgrade:** run separate empty, multi-record and pending cycles. After A→B, read through the actual bridge/UI; expect v2, revision +1 exactly once, unchanged IDs/names/links/null/zero/max values, no fabricated baseline/time/source/threshold, and unchanged singleton recovery entries. Complete pending name once and check ID/quantity.
2. **Existing v2:** A2→B keeps frozen bytes and revision on entry and repeated launches. Inspect synthetic bytes before/after through the test-only inspection harness. Byte equality alone does not prove no identical-value write occurred: zero write-call evidence comes from the deterministic injected-store tests (or a test-only observer wrapper), not from byte comparison.
3. **Repeated launches:** cold launch and navigate to Medication multiple times, then relaunch after a successful operation. No duplicate migration, ID allocation, stock addition or resurrection from singleton copies.
4. **Decimal/manual operations:** enter `0.1` then add `0,2`, observe recorded `0.3`; test zero correction, invalid input, boundary overflow and ineffective additions. Inspect that baseline/addition identities, other records, thresholds and sources change only where intended. Physical correction intentionally supersedes that record's stock history.
5. **Prescription unlink:** use a synthetic retained prescription and generated synthetic document in the test app container. Confirm deletion through the ordinary UI/coordinator; every matching medication link clears, all stock/source fields survive, and unrelated links/records remain. Also test cancellation and injected failed/uncertain unlink without deleting the prescription prematurely.
6. **Unavailable-source UI:** same-token link, mismatched link, link without baseline, and retained source with no active link all keep opaque data and expose no stock commands. Gross stock is never shown as current. Name edits and prescription unlink still work. No Health query/permission is needed.
7. **Invalid/version and accessibility:** malformed and unsupported synthetic envelopes block writes without defaults. Check VoiceOver actions/destructive index, Dynamic Type, decimal-comma keyboard and offline operation. A downgrade rejection demonstration uses only the test identity/fixtures; never replace production/v2.

### Deterministic faults versus physical interruption

The existing `MedicationKeychainAccess` injection boundary supports deterministic tests without production flags or real Keychain data. In XCTest/in-memory stores, separately inject: read failure before migration, write rejection before publication, successful complete-envelope publication followed by lost acknowledgement, and read-back failure/mismatch. Assert exact old/new envelopes, revisions, retry behavior and no automatic replay. Label these **injected failures**, not physical Keychain interruptions. A test-only hosted harness may wrap the real _test-group_ store for before-call or after-success/acknowledgement faults, but that is distinct from the unmodified candidate acceptance run.

Physical force-quit/termination is a separate optional observational test after authorization. Record operation initiation, any completion signal, termination timing and the synthetic envelope after restart. A killed app does not establish that `SecItemUpdate` was executing at that instant, and the system service may finish independently. A pause before the call proves only pre-write termination; a pause after success proves an acknowledgement-loss window. Neither proves interruption inside a write. Report timing as unknown unless independently evidenced; never claim power-loss/atomicity guarantees from process termination alone.

### What needs another device

No core rehearsal case above inherently requires a second device once private identity isolation is verified. Lock/unlock of the existing iPhone can be a separately authorized test but momentarily affects the whole phone. Tests involving deliberate power loss, OS restore/erase, passcode removal, global permission resets, destructive storage pressure or reboots that would disrupt normal use belong on a spare device if requested. Backup/restore and cross-device `ThisDeviceOnly` behavior genuinely need a second device and/or a disposable restore target. Live Health tests requiring a clean synthetic-only Health database also need a separate environment to avoid touching the everyday Health store; they are outside this compatibility rehearsal. Neither a second device nor this rehearsal can prove access to production retained data without testing that production identity, which remains explicitly prohibited.

No rehearsal artifact, signing overlay or harness has been created in this review. Installation, launch, synthetic device writes and permissions require a later explicit instruction. Production/v2, Metro, existing worktrees, stashes and diagnostic evidence remain untouched.

Suggested future commit message: `Preserve medication v2 storage and migrate v1 safely`.
