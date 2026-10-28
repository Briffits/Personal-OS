# Explicit-presenter D after fresh installation — completed observation

This is the user-requested fresh process (run 2), not a repeat of unchanged historical D.

## User-confirmed observations

- Before request: No request started; interaction counter incremented.
- After the single manual request: Apple sheet appeared.
- User tapped **Don’t Allow**, not Cancel; sheet disappeared.
- Counter remained responsive afterward.
- Phone remained continuously foregrounded without interruption during this trial.

## Separate trace evidence

- path=D; manual tap; context.ready; direct.presenter.explicit.retained; request.begin.
- Raw callback success=true, errorDomain=none, errorCode=none.
- Main callback arrived approximately 11.326 seconds after request.begin.
- Observation completed after approximately 10.485 seconds; root retained; run.ended.
- Post-observation interaction was logged. No timeout or background event occurred
  between the request and observation end in the captured trace.

## Interpretation and boundaries

Explicit-presenter D displayed the sheet in this completed trial. Callback success
is separate from the refusal action and does not establish consent or readable data.
Read access remains untested. FB25287175 remains unresolved.

The installation was fresh; continuity with earlier HealthKit permission/system
state is unknown. The first process after installation had already issued an
explicit-presenter request before backgrounding interrupted its observation;
its visual outcome remains unreported. This completed trial therefore follows
that request history, not an untouched first-request state.

Historical D2 included a pre-request background/foreground cycle. The trials are
not matched controls. One successful presentation does not establish that explicit
presenter selection caused the difference, repeatability, or a production fix.

No further request or automatic retry was performed by the assistant. No Health
query, reset, production/v2 or Metro change was made. Historical logs and reports
remain unchanged. This record is stored outside the repository; no commit/push.
