# Medication compatibility — sanitised rehearsal evidence

Evidence reviewed: 29 October 2026. Tested implementation:
`09c5a4bef3752d229f9f40d80ba248f6fc460327`.

This is a derived summary of private synthetic-device comparisons, not raw device
output. No device/team identifiers, signing material, private paths, raw logs,
app binaries or document exports are included. Full provenance and limitations
are in [the compatibility report](MEDICATION_V2_COMPATIBILITY.md).

## Automated snapshot results

| Chain / snapshot | Schema / revision | Result |
| --- | --- | --- |
| V1 A | 1 / 7 | Exact four-record synthetic fixture. |
| V1 B | 2 / 8 | Complete expected migration; all unrelated values preserved. |
| V1 C | 2 / 12 | Complete expected final envelope after four intentional writes. |
| Existing-v2 A and B | 2 / 42 | Identical bytes, hash and every field across repeated candidate reads. |
| Existing-v2 C | 2 / 46 | Complete expected final envelope after four intentional writes. |

SHA-256 of raw synthetic medication snapshots:

| Snapshot | SHA-256 |
| --- | --- |
| V1 A | `58884d16c5d969dc3d69414ccfe4327c4d4bbf499d21a81891b1729c163d774f` |
| V1 B | `87c5ea603dc62e90a27061461005783aee13d75a061cdd7870e73969e687caf6` |
| V1 C | `c0afc1b114c9753ce2270d17ff4c65a584696ec6ae9c9d0eadc8cc947a4f10e1` |
| Existing-v2 A/B | `76d587c477b9cb8a20da409cd630098083b02fc877f436a2f21036f8a5dad463` |
| Existing-v2 C | `082e1c69a975bd7476cc60f4fee1eb018a0cfd2788cd8876770370c98a8b9380` |

These hashes identify synthetic evidence; hashes alone are not independent proof
of execution. The private comparisons and retained receipts support the results.

## Approved ledger outcomes

V1: record 1 renamed to “Synthetic upgrade 1 reviewed”; its stock corrected to a
new manual 0.1 baseline and one 0.2 addition, with legacyRecordedStock cleared;
both matching prescription links cleared. All four records and other fields
preserved. Cancellation and cold restart added no extra final revision.

Existing v2: record 2 renamed to “Synthetic compatibility 2 reviewed”; manual
record 1 corrected to a new 0.1 baseline with exactly one 0.2 addition. Its previous
4.5 baseline and 0.5 addition were intentionally superseded. All six prescription
links cleared; threshold 0 on record 1 and all other thresholds, opaque Health
references, and unrelated fields preserved. Records 2/3's existing baselines and
addition histories were unchanged. Both final comparisons checked exact field
sets, record/array ordering, values and references against B plus the ledger.

## User observations, not automatic measurements

The user reported three matching read-only visits with two cold relaunches in
each chain; successful one-time ledger actions; 0.3 displayed after addition and
a later cold restart; cancellation retained the prescription; and final medications
remained visible and unlinked. Existing-v2 source-related records exposed no
stock actions and retained the expected unavailable/confirmation-required labels.
App switching/navigation was not counted as a cold restart. These observations
are recorded separately from the A/B/C file comparisons.

## Automated regression evidence reviewed, not rerun

The saved final logs report 24 passing native in-memory medication cases, a
passing pinned-v1 downgrade rejection, 180 tests across six affected Jest suites,
and a successful unsigned iOS build. The implementation report retains the
historical TypeScript/lint and broader regression results with their actual run
boundaries. Test sources cover zero correction, decimal-comma parsing, invalid
input, native source blocking, full-record preservation and uncertain-write
non-replay. No new tests or device actions were performed for this summary.

## Limits retained

- Intermediate revisions were not individually captured. The final +4 revision
  deltas match four intended writes; snapshots do not expose every intermediate
  state or prove absence of identical-value writes.
- Newly generated baseline/addition metadata was validated for UUIDs, references
  and timestamp order, but not separately captured immediately before unlink.
- Zero correction, invalid/boundary input and comma-input device checks were
  deferred. Both device additions used a full stop; automated comma parsing is
  separate evidence from the iOS keyboard.
- UI menu blocking is not an on-device native-bypass test. Native enforcement and
  fault/retry cases are covered by injected-store tests.
- Actual VoiceOver focus/order, largest Dynamic Type, small-screen layout/contrast,
  systematic lock/unlock and locked-write recovery, and network-disconnected
  operation remain unverified by these device runs.
- Production identity/data, real Health access, cross-device restore and physical
  power-loss/Keychain interruption were outside scope. No release or merge is
  authorised by this summary.

Review finding: no unresolved migration, preservation, revision or non-replay
failure in the reviewed scope. Remaining device coverage gaps are disclosed;
no additional device tests were automatically initiated.
