# D2 result

Same installed updated Debug build and diagnostic identity as D1; no rebuild or
installation. Fresh process launched using --terminate-existing and explicit
PERSONALOS_NATIVE_HEALTH_PATH=D; path=D confirmed. No debugger attached.

Human observations: No request started confirmed before tap; no Apple sheet
appeared after request; counter still responsive. No sheet action/disappearance
applicable. No granted read access inferred. Human interruption status has not
been explicitly confirmed for D2.

Console: interaction.tap 54708.653094208334 before request; direct.button.tap
54716.85369425001; context.ready 54716.85432729167; request.begin
54716.85439258334; callback.raw 54716.883440708334 successTrue;
direct.callback 54716.88346991667 success=true errorDomain=none errorCode=none;
callback.main 54716.883545625 (~0.02915 s after request, within 120 s);
observation.begin 54716.88357895834; observation.end.rootRetained
54727.376939375004 (~10.49336 s); cleanup.rootRetained and run.ended followed.
Post-window interaction.tap 54732.52829170834. No timeout.

Scene.background occurred at 54683.21595766667 BEFORE the manual request;
scene.active 54685.75173458333 preceded the tap. No background event was logged
between request and run end. This pre-request background/return is a procedural
difference to retain when comparing D1 and D2; its cause is not established.
No automatic request occurred on foreground return.

D presentation was not reproduced in D2. The no-sheet/immediate-success behavior
also occurs with the direct/manual path. This does not identify refusal, timing,
request history or presentation code as the cause. It does not establish read
access. S1/D1 used Don’t Allow, not Cancel; cancellation-based interpretations
remain withdrawn.

Shared scheme opt-in remains disabled. Process D opt-in is one-shot and not
persisted. No further test, query, permission reset, uninstall, PersonalOS change,
commit, push or merge. D2.log preserves sanitized application trace only.
