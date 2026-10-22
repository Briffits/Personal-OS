# HealthKit checkpoint and handover — 22 October 2026

Status: **Reported to Apple; cause unresolved**. Apple Feedback **FB25287175**, user-confirmed submission 22 October 2026, “Intermittent medication per-object authorization sheet presentation across repeated requests”.

## Worktrees and remote backup

- Diagnostic: `PersonalOS-native-health`, detached HEAD `6304d7c24ba988aaf2bb6bfe5ec065360fc75b26`. Four tracked diagnostic files modified; report directory untracked; six trace logs additionally ignored by the global `*.log` rule. Nothing staged here.
- Current startup-corrected PersonalOS validation checkout: `Personal-OS-original-smoke`, detached HEAD `24c746bea38fb080cdaaf5da6e0cc637351b5e11`. Project file, scheme and Info.plist have staged changes; scheme also has unstaged changes. A project.pbxproj.conflicted-backup is untracked. Preserve all.
- Older PersonalOS development checkout: `Personal-OS`, branch `test/healthkit-opacity`, HEAD `e9dfda1396f1fe9722d295b8245fdc89789680d1`, with local project/scheme/Info.plist changes. It is the earlier opacity experiment, not the latest startup-corrected validation checkout.
- Three existing stashes remain local. The local `backup/mac-xcode-before-healthkit-sync` branch tip ed89f95 is not contained in the known remote branches; do not push signing/configuration backups without separate review.

Live origin heads checked read-only with git ls-remote: native-comparison = 6304d7c; manual-after-startup = 24c746b; opacity = e9dfda1; main = 752c84910f3a2246343a11c389600cbc0f2ea206. Current local work, D implementation, reports, feedback record and standalone logs have no Git remote checkpoint. Apple submission is a separate external copy, not a repository backup. No other backup service was inspected or assumed.

## Durable evidence outside /tmp

All investigation materials below reside in this worktree. The original S/M implementation is in HEAD; the D addition is in local source. README/check_project.py document/audit the addition. SESSION_NOTES.md and corrected reviews record Don’t Allow for both S1 and D1, not Cancel. Six sanitized trace files S1/M1/M2/S2/D1/D2.log are present. They match their submitted ZIP copies byte-for-byte. Feedback submission and separate sysdiagnose provenance are in APPLE_FEEDBACK_SUBMISSION.md.

S1 and D1 presented; Don’t Allow was tapped; sheet disappeared; counters responded. M1/M2/S2/D2 had no visible sheet with immediate successful callbacks. D2 had a pre-request background/foreground cycle: preserve the detail without treating it as causal. No cause established, no verified D production fix, read access untested. S/M trials used original build; D1/D2 used the same updated build after an over-install. Callback success is separate from presentation and consent.

The frozen submitted ZIP has pre-submission draft wording; the adjacent current submission record supersedes that status. Preserve its exact bytes. Sysdiagnose was separately supplied to Apple as required by Feedback Assistant; it is outside our sanitisation review and is not in this worktree/archive. Raw device metadata, raw signing/build logs and built binaries remain outside the proposed checkpoint (some in /tmp). They are not required evidence to commit.

## Proposed checkpoint — not executed

Create branch **diag/health-authorization-feedback-checkpoint** at current diagnostic HEAD 6304d7c, preserving its working changes. Proposed commit message: **Checkpoint native Health authorization investigation and FB25287175**.

Include exactly these files, relative to the diagnostic worktree:

- `diagnostics/HealthAuthorizationComparison/ComparisonObservation.swift`
- `diagnostics/HealthAuthorizationComparison/HealthAuthorizationComparisonApp.swift`
- `diagnostics/HealthAuthorizationComparison/README.md`
- `diagnostics/HealthAuthorizationComparison/check_project.py`
- `diagnostics/HealthAuthorizationComparison/reports/native-comparison-review/APPLE_FEEDBACK_DRAFT.md`
- `diagnostics/HealthAuthorizationComparison/reports/native-comparison-review/APPLE_FEEDBACK_REPRODUCTION.zip`
- `diagnostics/HealthAuthorizationComparison/reports/native-comparison-review/APPLE_FEEDBACK_SUBMISSION.md`
- `diagnostics/HealthAuthorizationComparison/reports/native-comparison-review/ATTACHMENT_REVIEW.md`
- `diagnostics/HealthAuthorizationComparison/reports/native-comparison-review/CHECKPOINT_HANDOVER.md`
- `diagnostics/HealthAuthorizationComparison/reports/native-comparison-review/D1.log`
- `diagnostics/HealthAuthorizationComparison/reports/native-comparison-review/D1_RESULT.md`
- `diagnostics/HealthAuthorizationComparison/reports/native-comparison-review/D2.log`
- `diagnostics/HealthAuthorizationComparison/reports/native-comparison-review/D2_RESULT.md`
- `diagnostics/HealthAuthorizationComparison/reports/native-comparison-review/D_PREPARATION.md`
- `diagnostics/HealthAuthorizationComparison/reports/native-comparison-review/FINAL_EVIDENCE_REVIEW.md`
- `diagnostics/HealthAuthorizationComparison/reports/native-comparison-review/M1.log`
- `diagnostics/HealthAuthorizationComparison/reports/native-comparison-review/M2.log`
- `diagnostics/HealthAuthorizationComparison/reports/native-comparison-review/REVIEW.md`
- `diagnostics/HealthAuthorizationComparison/reports/native-comparison-review/S1.log`
- `diagnostics/HealthAuthorizationComparison/reports/native-comparison-review/S2.log`
- `diagnostics/HealthAuthorizationComparison/reports/native-comparison-review/SESSION_NOTES.md`

The six .log files are deliberately sanitized investigation evidence but ignored by `*.log`; stage only these exact six paths with `git add -f` when the checkpoint is approved. Do not broadly force-add files or weaken the ignore policy. All other listed paths can be staged explicitly. No project signing edits are needed in this checkpoint. Commit and push are not authorized yet; branch has not been created.

Exclude all PersonalOS project/Info.plist/scheme edits and backups, stashes, signing/team material, device metadata/identifiers, sysdiagnose, raw build/signing logs, generated app/DerivedData, and temporary scripts. Submitted archive checked for signing material/known device identifiers and exact six trace copies. Docs scanned for local home paths, known signing/device IDs, UUIDs and private-key markers. Shared scheme opt-in verified disabled by check_project.py. Audit and git diff --check passed. No new build/device test was run for this handover.

## App-icon handover

Existing source checkout to reference for the latest validated PersonalOS startup is **Personal-OS-original-smoke at 24c746b**. It is dirty/detached and must be preserved; no current clean icon worktree exists. Recommend a separate future worktree **PersonalOS-app-icon**, branch **feat/personal-os-app-icon**, based on 24c746b for continuity with the validated development version. Do not copy its local signing or diagnostic scheme changes automatically. If icon work instead targets released/main-only scope, origin/main 752c849 is an alternative base but omits the later Health/startup work; that should be an explicit scope choice. No branch/worktree created here.

All inspected checkouts and origin/main have the same empty iOS AppIcon catalogue:
`app/ios/PersonalOS/Images.xcassets/AppIcon.appiconset/Contents.json`.
It declares iPhone 20/29/40/60-point 2x/3x slots and a 1024x1024 marketing slot,
with no filenames and no images. Native build configuration already selects AppIcon.
Only other catalogue file is Images.xcassets/Contents.json. Android has existing
ic_launcher.png and ic_launcher_round.png in mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi directories;
these are not evidence of the approved iOS artwork and are outside iPhone scope.

Missing from all inspected repositories: the approved clean square source artwork,
1024x1024 iOS export, populated iOS icon filenames/images, and normal/dark/tinted
variants. docs/PERSONAL_OS_DESIGN_SYSTEM.md and brand.ts explicitly say the clean
source asset is not yet in the repository; palette anchors came from a study
rendering and cannot reproduce the approved icon. No approved artwork attachment
or external location is established in this conversation. Ask for the existing
approved source asset/path before implementation; do not invent/redesign it.

No PersonalOS asset modification or installation performed. No code changes,
commit, push, permission change or device test during this checkpoint preparation.
