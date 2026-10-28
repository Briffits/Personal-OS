# Explicit-presenter D repeat 1 — same installed build

One user-authorized fresh process with explicit path D; no rebuild, reinstall,
permission reset or configuration change. Path D and active scene verified in
console. User confirmed Path D, No request started and a responsive counter
before the assistant instructed one manual request-button tap.

## Human observations

No sheet appeared. Check interaction continued incrementing the counter.
Sheet action and disappearance are not applicable. The user retrospectively
confirmed that the phone remained unlocked and the app foregrounded without
interruption throughout.

## Separate trace evidence

One manual tap, settled context and direct.presenter.explicit.retained precede
request.begin. Raw callback success=true with no error arrived after approximately
0.03558 seconds; main callback after approximately 0.03568 seconds. The observation
window completed after approximately 10.49683 seconds, with root retention and
run.ended. Later counter taps were logged. No timeout, inactive or background event
appears in the captured trial trace.

## Interpretation

Presentation from the preceding completed trial was not reproduced. Explicit
presenter selection is insufficient to guarantee a visible sheet in this repeat;
the no-sheet/immediate-success pattern also occurs with this variant. This does
not identify refusal history, timing, presenter selection or another system
condition as causal. Callback success is not evidence of consent or read access.
Read access remains untested; FB25287175 remains unresolved.

The current installation began fresh; earlier permission-state continuity remains
unknown. This repeat follows the earlier interrupted request and the completed
Don't Allow trial. No additional request, Health query or automatic retry occurred.
Historical evidence, production/v2 and Metro remain unchanged. No commit or push.
