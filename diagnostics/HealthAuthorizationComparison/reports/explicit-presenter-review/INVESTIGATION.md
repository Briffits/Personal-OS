# Explicit-presenter D after fresh installation — consolidated evidence

Consolidated 2026-10-28 without another attempt. This is a changed D variant,
not a repeat of unchanged historical inferred-presenter D. Historical S/M/D
reports and submitted archive remain unchanged. Earlier preparation documents
are preserved as dated records; this report supersedes their pending-trial status.

## Installation and source provenance

Source starts at c52bd59f02c410916583a6246c58772e10f7c5bf with the adjacent
explicit-presenter changes. The user reported deleting the previous standalone
app. A signed build was installed successfully under the original diagnostic
bundle ID as a **fresh installation**, without uninstall or reset by the agent.
Continuity with earlier HealthKit permission or other system-held state is unknown.
Neither identity reuse nor deletion establishes preservation or reset of that state.

D uses the same manual one-shot request, medication object type and nil predicate.
It now supplies and strongly retains the controller validated by the existing
readiness traversal. S/M request behavior, the 10-second readiness bound, 120-second
callback bound and 10-second observation window remain unchanged. There is no
Health query or read-access test. See ../../EXPLICIT_PRESENTER_D.md.

## Run 1 — interrupted request

Label: explicit-presenter D after fresh installation, first launched process.
The launch was user-authorized with explicit environment path D and sanitized
console capture. The assistant asked the user to confirm readiness and leave the
request button untouched. No readiness confirmation or request instruction had
been recorded before this run's manual button event. The trace establishes a
button-handler invocation, not the person's intention or reason for tapping.
The implementation has no automatic request-on-appearance or foreground retry.

Human evidence: no sheet visibility, action label, disappearance, counter outcome
or cause of interruption was reported for this first request. Those are unknown.
The next user instruction was to start a fresh run. Do not borrow the second run's
Don't Allow/foreground observations for this run.

Trace evidence (monotonic uptime, seconds):

| Event | Uptime | Relative to request.begin |
| --- | ---: | ---: |
| root.appear | 283044.80776195833 | before request |
| scene.active | 283045.0523887917 | before request |
| direct.button.tap | 283068.9622667084 | immediately before request |
| context.ready | 283068.962706125 | immediately before request |
| direct.presenter.explicit.retained | 283068.96273458336 | immediately before request |
| request.begin | 283068.96276925004 | 0 |
| scene.inactive | 283087.710018375 | +18.747 |
| scene.background | 283088.9791521667 | +20.016 |
| cleanup.rootRetained | 283088.97923245834 | +20.016 |
| run.ended | 283088.9792431667 | +20.016 |

No callback.raw, direct.callback, callback.main, observation.begin or timeout is
present in the preserved trace. Backgrounding ended the diagnostic's active
request-wait phase, before a callback and before post-callback observation began.
This is an interrupted trial, not a successful observation window or callback
timeout. run.ended does not prove that HealthKit cancelled its native request or
that an Apple sheet disappeared. Any unlogged callback or visual outcome is unknown.

The user explicitly requested a fresh process. The launch command used
--terminate-existing for this diagnostic only; this was not an automatic retry.
Original run 1 logs were preserved separately. The next run therefore follows an
already-issued explicit-presenter request, even though it began in a fresh process.

## Run 2 — completed trial

Label: explicit-presenter D after fresh installation — user-requested fresh run 2.
The process was launched with explicit path D. Before the request, the user
confirmed No request started and that the interaction counter incremented. The
assistant then instructed one manual button tap. No automatic request occurred.
The user did not separately transcribe the on-screen Path D label; the path was
verified in console. Do not turn that console evidence into a human confirmation.

User-confirmed observations, separate from the logs:

- Apple sheet appeared after the request.
- User tapped **Don't Allow**, not Cancel.
- Sheet disappeared afterward and the counter still responded.
- Phone remained continuously foregrounded without interruption during the trial.

Trace evidence:

| Event | Uptime | Interpretation |
| --- | ---: | --- |
| root.appear | 283161.17751458334 | path=D |
| scene.active | 283161.377368875 | before readiness confirmation |
| interaction.tap | 283170.92673112504 | pre-request interaction; further taps logged |
| direct.button.tap | 283219.54451979167 | manual request handler |
| context.ready | 283219.5452382084 | prerequisite passed |
| direct.presenter.explicit.retained | 283219.54527862504 | variant marker |
| request.begin | 283219.54532408336 | callback clock begins |
| callback.raw | 283230.8668744583 | successTrue, background callback; +11.322 s |
| direct.callback | 283230.86692554166 | success=true, errorDomain=none, errorCode=none |
| callback.main | 283230.8708912917 | successTrue; +11.326 s |
| observation.begin | 283230.87092012505 | post-callback observation begins |
| observation.end.rootRetained | 283241.3557594167 | after approximately 10.485 s |
| cleanup.rootRetained / run.ended | 283241.3560704167 / 283241.35610358336 | observer finished |
| interaction.tap | 283251.09102987504 | after observation ended |

No timeout or background event between request and run end appears in this trace.
The user separately confirmed uninterrupted foreground observation. The retained
root/store/presenter are not released at callback or diagnostic finish; their
cleanup boundary is process termination. No process termination was performed
as part of this consolidation, and current process liveness was not checked.

## Bounded interpretation

Explicit-presenter D presented in the completed run. Callback success concerns
request processing, not consent, sheet visibility or readable data. The observed
Don't Allow action is refusal, not evidence of a cancellation callback. No Health
query was performed; **read access remains untested**.

This is not a matched control for historical D2, which included a pre-request
background/foreground cycle. Fresh installation, elapsed time, build differences
and intervening request history are additional uncontrolled differences. This
completed run also follows the interrupted run 1 request. No permission-state,
causal, repeatability or production-fix conclusion follows. Direct per-object
requesting was already tested by historical D; explicit selection is the variant.
**FB25287175 remains unresolved.**

No further attempt, access request, install, launch or reset occurred during this
consolidation. Production/v2, Metro, storage and Health data were not changed.
