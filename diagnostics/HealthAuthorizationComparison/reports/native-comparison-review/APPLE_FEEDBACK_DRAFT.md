# Apple Feedback draft — submission recorded

Status: **Reported to Apple; cause unresolved.** User-confirmed submission **FB25287175**, **22 October 2026**. See APPLE_FEEDBACK_SUBMISSION.md for attachment provenance. The preserved ZIP contains the pre-submission version of this draft.

Title: Intermittent medication per-object authorization sheet presentation across repeated requests

Area: HealthKit / HealthKitUI medication per-object authorization

Environment: physical iPhone 13 Pro, iOS 27.0.1 (24A446), read from connected-device metadata during finalisation without launching an app. This records current device OS, not a contemporaneous capture for each earlier attempt. Xcode 27.1 (27A9275), iPhoneOS SDK 27.1, deployment target iOS 26. Swift 5 language mode. Standalone native SwiftUI diagnostic, no React Native or dependencies. Bundle ID org.personalos.diagnostics.HealthAuthorizationComparison. Only HealthKit entitlement plus normal development signing entitlements; NSHealthShareUsageDescription configured. No Health queries, writes, permission-status probes, app persistence or networking. Debug opt-in only. Normal devicectl foreground launch without attached debugger.

Question / expected behavior:
The per-object API documentation describes presenting on requests even after previous grants, and supports subsequent direct calls or State-trigger changes. Is the observed intermittent no-sheet success, including on requests following Don’t Allow, expected specifically for userAnnotatedMedicationType? If so, what is the supported re-request mechanism and are there scope/time/presentation limits? If not, please investigate the observed successful no-sheet completion. Success is NOT being interpreted as visible presentation or granted read access. Refusal is not established as the cause. No request to override user refusal is intended.

Observed sequence (human sheet observation is separate from console result):

| Attempt | Path | Human observation | Callback main latency from request initiation |
| --- | --- | --- | --- |
| S1 | Persistent SwiftUI root | Sheet appeared; Don’t Allow tapped; disappeared; counter responsive | successTrue, 91.154 s |
| M1 | Retained SwiftUI modal | No sheet; counter responsive | successTrue, 0.024 s |
| M2 | Retained SwiftUI modal | No sheet; counter responsive | successTrue, 0.039 s |
| S2 | Persistent SwiftUI root | No sheet; counter responsive | successTrue, 0.036 s |
| D1 | Direct API, manual button | Sheet appeared; Don’t Allow tapped; disappeared; counter responsive | success=true, no error, 6.791 s |
| D2 | Direct API, manual button | No sheet; counter responsive | success=true, no error, 0.029 s |

D1 displayed the sheet after the earlier refusal in S1 and the intervening no-sheet requests. D2 then did not display it. Thus presentation remained possible after refusal, but neither API choice nor manual timing is established as causal.

No timeout. All post-callback observations ~10.4–10.5 s. M hosts were retained through observation, then dismissed/detached/released; S/D roots remain retained. D2 includes logged interaction before request and after observation.

Important limitations:
- S1 action was initially mislabelled Cancel in human notes; user explicitly corrected it to Don’t Allow. D1 also used Don’t Allow. No cancellation inference is made from either callback.
- S1/M1/M2/S2 used one installed build. D was then added and installed over the diagnostic without uninstalling or resetting permissions, retaining the same identity. D1/D2 used that same updated build. This is not six attempts with an identical executable.
- D1 changes both API invocation and timing (explicit manual tap after interactive startup). It is not a verified fix; D2 did not reproduce presentation.
- D2 logged background/foreground BEFORE its manual request; the scene was active before the tap. No background was logged during the request/observation. Retain this difference without assuming causation.
- S1/D1/M2/S2 were explicitly confirmed by the user to have no interruption; M1/D2 interruption status is not fully confirmed by the human report. Application lifecycle traces are attached independently.
- Initial consent state before S1 was not measured; no permission/read-access status query was made. No data contents or medication identifiers were captured. A deterministic reproduction rate or reset-to-start procedure is not established.

Diagnostic procedure and observed reproduction:
1. Use the attached standalone diagnostic and existing provisioned diagnostic identity on a physical supported iPhone.
2. In Debug, launch a fresh process with PERSONALOS_NATIVE_HEALTH_PATH=D explicitly supplied (e.g. devicectl --terminate-existing --environment-variables '{"PERSONALOS_NATIVE_HEALTH_PATH":"D"}' --console). Verify path=D, No request started, and responsive interaction counter.
3. Tap D: Request Apple medication-selection sheet once. This checks foreground settled context, then invokes HKHealthStore.requestPerObjectReadAuthorization(for: .userAnnotatedMedicationType(), predicate: nil). A retained store and root survive completion.
4. Observe continuously. If the sheet appears, record the actual button action; in the captured attempts it was Don’t Allow. Record disappearance and counter response independently. Capture raw Bool/error domain/code and raw/main callback timing; allow up to 120 s and then 10 s observation. On timeout follow diagnostic stop instructions.
5. Stop only the diagnostic process. Launch a fresh D process with the same identity/installation/state and repeat the manual procedure once. D2 above completed immediately without a visible sheet. This outcome is observed, not guaranteed for every environment.
6. Optional existing S/M comparison paths use the same medication type and nil predicate through the per-object SwiftUI overload: S changes app State on root appearance; M changes request State after retained modal presentation completion. No additional test is requested by this draft.

The supplied diagnostic performs no Health queries or writes. The recorded investigation preserved the installation and permission state; it did not require granting access.

Attachments for review before submission: sanitized S1/M1/M2/S2/D1/D2 logs, corrected human results, invocation comparison and relevant diagnostic sources. No device UDID, team identity, profile, Health screenshot or private record content is needed. Do not attach unsanitized build logs or a sysdiagnose automatically; any further data collection needs separate review.

Submission subsequently reported by the user as FB25287175 on 22 October 2026. No further device test was performed during finalisation.
