# Complete evidence review

No code changes or device operations during this review. Original log hashes verified unchanged. Installation and permission state preserved. Prior uncommitted implementation changes remain in place; they were not altered here.

## Documented facts, refreshed 2026-10-22

- Installed iPhoneOS27.1.sdk HealthKit.framework/Headers/HKHealthStore.h, lines 86–102: per-object request is asynchronous; completion may be on a background queue; prior access does not remove the described prompt; success concerns successful, uncancelled processing, explicitly not granted authorization. Don’t Allow is not the human action Cancel.
- [Current direct API documentation](https://developer.apple.com/documentation/healthkit/hkhealthstore/requestperobjectreadauthorization(for:predicate:completion:)): Bool reports whether processing encountered an error, not consent. Its discussion describes per-object prompting regardless of earlier grants. It supports calling the method again to request additional access.
- [Current exact SwiftUI overload](https://developer.apple.com/documentation/swiftui/view/healthdataaccessrequest(store:objecttype:predicate:trigger:completion:)): predicate defaults to nil; a changed State trigger requests again. Completion is after the request. This is the per-object overload, not the ordinary readTypes/shareTypes method.
- Reviewed docs/header contain no medication-specific refusal/re-presentation rule, cooldown, quota, process-restart guarantee, or force-sheet flag. This is a scoped negative finding, not proof that no internal limit exists. The examples discuss vision prescriptions generically; do not claim those examples empirically establish medication behavior after refusal.
- HealthKitUI arm64e-apple-ios.swiftinterface confirms default nil predicate and Sendable completion; it does not expose implementation or prove which internal method the SwiftUI wrapper calls.

Current official Markdown content was refreshed from Apple. The previously inspected current medication sample uses a root State trigger with omitted predicate and contains no refusal-specific re-request strategy. Generic prompt-once rules for camera, FinanceKit or ordinary type-based Health authorization are not evidence for this medication API.

## Actual arguments and invocation

| Property | S | M | D |
| --- | --- | --- | --- |
| Entry point | SwiftUI per-object healthDataAccessRequest | Same exact overload | HKHealthStore.requestPerObjectReadAuthorization |
| Type | userAnnotatedMedicationType | Same | Same |
| Predicate | Omitted, default nil | Explicit nil | Explicit nil |
| Initiation | false→true State on root appearance | false→true request State after UIKit presentation completion | Manual tap after interactive screen, settled-context check |
| Store lifetime | App-lifetime static | Retained request view State | Observer-owned store; completion retains observer |
| UI | Persistent root modifier | Transparent overFullScreen retained host | Existing root; no Health modifier/modal |
| Callback | Result Bool/error → Task MainActor | Result Bool/error → Dispatch main | Raw Bool/error logged separately → Task MainActor |

No queries/writes/status probes; same diagnostic identity. Fresh processes clear app-local one-shot state but do not establish reset of system-held state. S/M build predates D addition; D1/D2 share the updated installed build.

## Evidence and hypotheses

S1 and D1 visibly presented and ended with Don’t Allow, disappearance and responsive counter. M1/M2/S2/D2 did not visibly present and completed immediately with success. All counters responsive. Logs contain no timeout. D2 pre-request background/foreground is a retained confound, not a causal explanation.

The evidence does not isolate refusal history, elapsed time, foreground history, SwiftUI activation, presentation placement or another system condition. D1 proves presentation remained possible through direct/manual invocation after earlier refusal; D2 demonstrates it was not repeatable in that next attempt. Neither a modal-specific failure nor D as a PersonalOS fix is established. Callback success establishes neither visible presentation nor read access. Cancellation-based causal interpretations remain withdrawn.

## Investigation status

**Reported to Apple; cause unresolved.** User reports submission FB25287175 on
22 October 2026 under “Intermittent medication per-object authorization sheet
presentation across repeated requests”. See APPLE_FEEDBACK_SUBMISSION.md.

The submission included our reviewed, sanitised APPLE_FEEDBACK_REPRODUCTION.zip
and a separate iOS Sysdiagnose required by Feedback Assistant. The sysdiagnose
was not reviewed or sanitised by this investigation and is not covered by the
archive review. The archive and original logs are preserved unchanged.

Await Apple’s response. No additional experiment or production change is planned.
Read access remains untested. Shared diagnostic opt-in is disabled. Actual device
metadata read during finalisation was iOS 27.0.1 (24A446), not a contemporaneous
capture for each earlier attempt.
