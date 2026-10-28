FB25287175 — explicit-presenter follow-up

The standalone diagnostic now explicitly assigns a validated foreground controller to HKHealthStore.authorizationViewControllerPresenter and strongly retains it. The request remains manually triggered requestPerObjectReadAuthorization(for: .userAnnotatedMedicationType(), predicate: nil), with no Health queries or writes.

Two completed trials used fresh processes of the same installed build, with no intervening rebuild, reinstall, permission reset or configuration change:

- Previous trial — human observation: sheet appeared; Don't Allow tapped without changing selections; sheet disappeared; counter responsive; uninterrupted foreground observation. Trace: explicit presenter retained, success=true with no error after 11.326 s; observation completed after 10.485 s.
- Repeat — human observation: phone unlocked and app foregrounded without interruption; no sheet; counter responsive. No sheet action was possible. Trace: explicit presenter retained, success=true with no error at 0.036 s; observation completed after 10.497 s. No timeout or logged inactive/background event occurred during the trial. Later lifecycle events in the preserved capture occurred after the completed observation.

The current installation was fresh after the previous diagnostic was deleted; continuity with earlier HealthKit permission/system state is unknown. Before these completed trials, another explicit-presenter request was interrupted by backgrounding about 20.016 s after request start, with no captured callback and unknown sheet/action outcome. Historical inferred-presenter D2 also had a pre-request background/foreground cycle and is not a matched control.

These observations establish only that explicit presenter selection was insufficient to ensure repeatable presentation. They do not establish permission state or causation. Callback success is not evidence of consent or readable data. Read access remains untested; FB25287175 remains unresolved.
