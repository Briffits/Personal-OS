# D1 result

Fresh launch explicitly passed PERSONALOS_NATIVE_HEALTH_PATH=D; console verified
path=D. Prior security-rejected launch did not start a confirmed process; this
retry succeeded. Same diagnostic bundle identity, updated Debug implementation,
over-install without uninstall or permission reset. No debugger attached.

User confirmed No request started before the manual button. User explicitly confirmed the following visual observations:
- Apple sheet appeared after pressing the manual D button.
- User tapped “Don’t Allow”, not Cancel. This is not classified as cancellation.
- The sheet disappeared.
- The counter responded afterward.
- No locking, backgrounding or interruption occurred during the attempt.

These human observations are separate from callback success=true. The callback
is not evidence of granted read access. Read access remains untested. Initial
counter check before request was not explicitly confirmed.

Logs: button 53951.47330500001; context.ready 53951.473807125;
request.begin 53951.473856000004; callback.raw 53958.26290916667 successTrue;
direct.callback 53958.262940375 success=true errorDomain=none errorCode=none;
callback.main 53958.264707375005 (~6.791 s after request, within 120 s);
observation.begin 53958.264733875; observation.end.rootRetained
53968.65968779167 (~10.395 s); cleanup.rootRetained and run.ended followed.
interaction.tap 53967.54619158334 occurred before observation ended; user reports
counter responds, but a post-window tap is not established by this captured event.
No timeout. Root/store retained by design; no app-owned modal to dismiss.
Later scene.background at 54074.66870066667 followed run end; no background event
during active attempt. User explicitly confirmed no interruption during D1;
the later background log is outside the completed attempt.

D1.log preserves captured sanitized application trace lines only. Shared scheme
opt-in remains disabled; D was process-local and one-shot. No further attempt.
No Health query, reset, PersonalOS modification, commit, push or merge.

Cross-run correction: S1 also used “Don’t Allow”, not Cancel. D1 shows direct/manual presentation remained possible after that earlier refusal. API choice and manual-trigger timing both differed; cause is unresolved. D2 repeatability check is proposed only, not run.
