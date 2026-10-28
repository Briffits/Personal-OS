# Explicit-presenter checkpoint proposal — not committed

Base: c52bd59f02c410916583a6246c58772e10f7c5bf.
Durable branch: diag/health-explicit-presenter-checkpoint.
Durable worktree: PersonalOS-health-explicit-presenter-checkpoint, alongside the
other development worktrees, outside temporary storage. The original temporary
worktree and diag/health-explicit-presenter branch are preserved unchanged.
The original Health checkpoint, all other worktrees and three stashes are preserved.

## Exact proposed checkpoint file list

Paths relative to repository root:

- `diagnostics/HealthAuthorizationComparison/ComparisonObservation.swift`
- `diagnostics/HealthAuthorizationComparison/EXPLICIT_PRESENTER_D.md`
- `diagnostics/HealthAuthorizationComparison/RetainedModalAuthorization.swift`
- `diagnostics/HealthAuthorizationComparison/check_project.py`
- `diagnostics/HealthAuthorizationComparison/reports/explicit-presenter-review/CHECKPOINT_HANDOVER.md`
- `diagnostics/HealthAuthorizationComparison/reports/explicit-presenter-review/INVESTIGATION.md`
- `diagnostics/HealthAuthorizationComparison/reports/explicit-presenter-review/PREPARATION_AND_SIGNING.md`
- `diagnostics/HealthAuthorizationComparison/reports/explicit-presenter-review/RUN1_INTERRUPTED.log`
- `diagnostics/HealthAuthorizationComparison/reports/explicit-presenter-review/RUN1_RECORD.json`
- `diagnostics/HealthAuthorizationComparison/reports/explicit-presenter-review/RUN2_COMPLETED.log`
- `diagnostics/HealthAuthorizationComparison/reports/explicit-presenter-review/RUN2_RECORD.json`
- `diagnostics/HealthAuthorizationComparison/reports/explicit-presenter-review/RUN2_RESULT.md`
- `diagnostics/HealthAuthorizationComparison/reports/explicit-presenter-review/SHA256SUMS`

Only ComparisonObservation.swift, RetainedModalAuthorization.swift and
check_project.py modify existing tracked files.
EXPLICIT_PRESENTER_D.md and the report directory are additions. Existing historical
native-comparison reports and logs must remain byte-for-byte unchanged.

The two .log files are intentionally sanitized evidence and match their source
capture snapshots byte-for-byte. They are ignored by the existing global *.log
rule. A later authorized checkpoint must explicitly include only those two log
paths (for example with targeted git add -f); do not weaken ignore rules or
broadly force-add. No files are staged by this preparation.

SHA256SUMS covers the proposed files except itself, with paths relative to
HealthAuthorizationComparison. Four preparation files also match the source
manifest recorded during signing. JSON records and RUN2_RESULT.md are original
local observation reports, not independently generated telemetry. Consolidated
INVESTIGATION.md distinguishes their human provenance from the trace evidence.

## Privacy review and exclusions

Only an explicit allowlist was copied. Each trace line was checked against the
bounded diagnostic format; no raw devicectl output is included. Proposed files
were scanned against locally known signing-team/device identifier strings and
for UUIDs, private-key blocks, credential markers, email addresses and private
home paths. No matches were found. The diagnostic bundle ID, source/build hashes,
framework entitlement key names and monotonic timing are intentional public
technical evidence. No Health records, selections, images or screenshots are included.

Excluded: xcconfig, profiles, certificates, signing credentials, team values,
device metadata/identifiers, raw build/install/launch output, binaries/DerivedData,
sysdiagnose, caches and production configuration. Private temporary originals
were not deleted. The existing submitted Apple archive is not changed.

No new build, device attempt, install, launch, authorization request, query,
reset, commit or push is part of consolidation. Earlier build/signing checks are
reported as historical validation, not rerun results. Repository diff/source
checks and checksum verification are the applicable consolidation checks.

Suggested later commit message (not executed):
Checkpoint explicit-presenter D evidence after fresh installation

The checkpoint is local and uncommitted; it is not yet a Git history or remote backup.
