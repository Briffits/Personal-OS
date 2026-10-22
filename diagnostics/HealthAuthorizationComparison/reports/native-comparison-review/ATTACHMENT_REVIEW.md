# Reproduction archive attachment review

- APPLE_FEEDBACK_DRAFT.md: complete corrected six-attempt narrative, actual current iOS 27.0.1 (24A446), Xcode/SDK separately labelled, candidate reproduction steps and limitations.
- APPLE_FEEDBACK_REPRODUCTION.zip: reviewed standalone source, project/shared scheme with blank development team and disabled opt-in, Info.plist, HealthKit entitlement, portable audit, Apple sample license, six sanitized trace logs and the same draft. No binary or provisioning material.

Checked every proposed archive member for local home paths, known device/team identifiers, UUIDs, email-like data and private-key markers. Development team is blank in the project. Logs contain only sanitized app trace events, timings and Bool/error tokens, no device identifiers or Health objects. Source review shows no captured records, personal medication information, credentials, user documents or private content. Public diagnostic bundle ID and general iPhone model are intentionally retained as reproduction context. The full PersonalOS checkout is not attached.

Excluded: raw connected-device JSON/command output, raw build/signing logs, signing certificates/profiles, device UDID/name, chronology with local filesystem paths, binaries, screenshots, Health contents and sysdiagnose. Existing original reports/logs preserved. This is a sanitization review of the prepared files, not approval to submit or collect additional diagnostics.

Submission update: user confirms FB25287175, 22 October 2026, included this archive plus a separate Feedback Assistant-required iOS Sysdiagnose. The exclusions above describe the reproduction archive only. The sysdiagnose was not inspected or sanitised by us and is not covered by this review. The submitted ZIP remains unchanged; its draft records pre-submission wording.
