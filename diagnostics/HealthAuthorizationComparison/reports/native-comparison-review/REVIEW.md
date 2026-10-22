# Native medication authorization comparison review

Review date: 2026-10-22. Implementation commit: `6304d7c24ba988aaf2bb6bfe5ec065360fc75b26`. Xcode 27.1 (27A9275), iPhoneOS SDK 27.1, Swift 5 language mode. Actual device OS version was not captured in this session; do not substitute SDK version for device OS.

Same installed Debug executable and bundle identity `org.personalos.diagnostics.HealthAuthorizationComparison`; fresh process for every attempt, explicit environment S/M, verified in console. Launches used devicectl without an attached debugger, not Xcode Product → Run. This procedural departure must accompany the evidence. No implementation changes or further device tests during this review.

## Observations and logs

| Run | Human sheet observation | Observed action / disappearance | Callback main after request.begin | Observation / cleanup | Human interaction |
| --- | --- | --- | --- | --- | --- |
| S1 | Apple medication-selection sheet visible | “Don’t Allow” tapped (corrected); sheet disappeared | successTrue, 91.154 s | 10.490 s; root retained | Counter increased |
| M1 | No Apple sheet | No cancellation; disappearance N/A | successTrue, 0.024 s | 10.491 s retained host; dismissal and release ~0.015 s | Counter responds |
| M2 | No Apple sheet | No cancellation; disappearance N/A | successTrue, 0.039 s | 10.485 s retained host; dismissal and release ~0.016 s | Counter responds |
| S2 | No Apple sheet | No cancellation; disappearance N/A | successTrue, 0.036 s | 10.499 s; root retained | Counter responds |

No timeout logged. S1/M2/S2: user explicitly reported no locking/backgrounding/other interruption. M1: interruption status was not explicitly confirmed. Console interaction events and human counter confirmation are distinct evidence. S1 confirmed presentation, refusal via “Don’t Allow”, disappearance and interaction; it did not establish cancellation. S2 prevents treating the sequence as evidence of modal-specific failure. Read access was never tested.

Adjacent S1.log/M1.log/M2.log/S2.log preserve all captured application trace lines only (system command output removed). No Health records, device identifiers, signing credentials or private content are included. SESSION_NOTES.md preserves the chronological notes, including preliminary entries subsequently superseded by confirmed results. These files are uncommitted.

## Documented facts (current official Apple sources)

1. [SwiftUI per-object overload](https://developer.apple.com/documentation/swiftui/view/healthdataaccessrequest(store:objecttype:predicate:trigger:completion:)): trigger is State; changing it initiates a request. Predicate narrows the objects considered and defaults to nil. The page describes repeated prompting even after a prior grant, and callback delivery on a background queue. It does not document a cancellation-induced no-sheet state or process-restart recovery rule.
2. [HKHealthStore per-object request](https://developer.apple.com/documentation/healthkit/hkhealthstore/requestperobjectreadauthorization(for:predicate:completion:)): success describes request processing, not granted read permission. The page describes per-object prompting regardless of previous grants. Its example handles user cancellation with errorUserCanceled. The installed SDK HKHealthStore.h additionally describes success as successful, uncancelled prompting. S1’s corrected action was “Don’t Allow”, not Cancel; its successTrue is not evidence of a grant or a cancellation. The earlier supposed discrepancy between Cancel and successTrue is withdrawn.
3. [Current medication sample](https://developer.apple.com/documentation/healthkit/logging-symptoms-associated-with-a-medication), archive `dbe02a347c0c/LoggingSymptomsAssociatedWithAMedication.zip`: downloaded and source-inspected only. MedsSymptomsLoggingApp.swift uses a persistent WindowGroup root modifier, shared store, false State toggled on appearance, medication object type, omitted predicate, and main-actor completion handoff. It sets a UI Boolean for the success case; that example is not an authorization-status check. No cancellation-specific repeat policy is present in this file. The full sample includes Health queries/writes and is unsuitable for running under this diagnostic boundary.
4. [WWDC25 session 321](https://developer.apple.com/videos/play/wwdc2025/321/) demonstrates per-medication consent and completion after review. It does not specify a cancellation cooldown or a guaranteed re-presentation interval.

Health authorization is system-controlled, not reconstructed from these app State variables. None of the reviewed sources promises that a new process resets consent or internal request history. No cancellation occurred in the corrected S1 observation; cancellation-based explanations of this sequence are withdrawn. Do not import ordinary type-level authorization prompt-once assumptions into this API. Persistent authorization and undocumented internal request-history effects are different claims.

## Source-code findings

Both diagnostic paths call the exact SwiftUI per-object overload for userAnnotatedMedicationType. S omits predicate; M supplies nil, equivalent at the API default. Both use State false → true, not a fixed true value. Source review found no app persistence, queries, writes, permission-status probes, networking, or retry. Fresh processes recreate started/phase/trigger/store state; changing process cannot establish that system state is unchanged or cleared.

S retains its root and app-lifetime store. M retains a transparent overFullScreen hosting controller and request-scoped store, triggers after UIKit presentation completion, hands callbacks to main, retains the host through observation, then checks dismissal/detachment and releases it. These are multiple presentation/lifetime differences. The callback outcome enum maps the API Bool/error without asserting sheet visibility or authorization. The modal Sendable warning remains an existing build warning, not an established cause.

## Corrected reassessment and next experiment

Correction annotation: the earlier human label Cancel for S1 was incorrect. The
user tapped “Don’t Allow”; sheet disappeared; counter responded; no interruption.
Machine logs are unchanged. This supersedes cancellation-based interpretations.

- S1: sheet appeared; “Don’t Allow” tapped; sheet disappeared; counter responsive.
- M1/M2/S2: no visible sheet; immediate successTrue; counters responsive.
- D1: direct per-object API, manually triggered after interaction, displayed the
  sheet; “Don’t Allow” tapped; sheet disappeared; counter responsive; no interruption.
  Callback success=true with no error, ~6.791 s; observation ~10.395 s; root retained.

D1 demonstrates presentation remained possible through the direct API after the
earlier refusal. It does not isolate API choice: trigger timing, build and elapsed
session time also differed. S2 rules out treating this as modal-specific evidence.
Read access remains untested; success never establishes granted read access.
No cancellation-based causal hypothesis is supported by the corrected record.

Recommend one D2 repeat using the same updated installed Debug build, identity,
medication type, nil predicate and manual-button procedure as D1, with a fresh
process and explicit D environment. Preserve permission state. Wait for readiness
before launch and initial-screen confirmation before the button tap. Use the
existing 120-second callback bound and 10-second observation, then obtain human
sheet/action/disappearance/counter/interruption observations separately. Record
the actual button label/action; do not describe “Don’t Allow” as Cancel. This is
a recommendation only; no implementation changes or device test performed.

- If D2 presents again: D presentation is repeatable at least twice across fresh
  processes after refusal. A universal refusal-induced inability to present is
  contradicted in this setup; API-versus-trigger-timing causation remains unresolved.
- If D2 returns immediately without a sheet: D1 is not yet repeatable, and the
  no-sheet pattern also affects the direct manual path. Request history/timing or
  another shared condition remains possible; none is proven.
- If D2 errors or times out: report that category separately; no clean conclusion
  about presentation differences follows. A visible sheet plus failed interaction
  is partial evidence, not a complete pass.

No reset, uninstall, record query, PersonalOS change or fresh identity is proposed.
Existing scheme opt-in remains disabled. Logs and reports remain uncommitted.

## D2 completed

D2: same installed build/identity as D1, fresh explicit-D process; manual button
confirmed in console after initial No request started confirmation. User reports
no Apple sheet and responsive counter. success=true with no error after ~0.029 s;
~10.493 s observation, root retained, run ended, post-window interaction logged.
No timeout. A background/foreground cycle occurred before the request, not during
the active attempt; preserve this procedural difference. Human interruption
status has not been explicitly confirmed. See D2_RESULT.md and D2.log.

D1 presentation was not reproduced in D2. Immediate no-sheet success also occurs
through the direct API with manual triggering; an exclusively SwiftUI/modal
explanation is insufficient. Refusal/request-state/timing/presentation causation
remains unresolved. Read access remains untested. No further experiment run.
