# Explicit-presenter D — preparation only

Prepared 2026-10-28 from checkpoint
`c52bd59f02c410916583a6246c58772e10f7c5bf`, in isolated branch
`diag/health-explicit-presenter`. This is a changed D implementation, **not a
repeat of unchanged historical D**. No device trial has been performed for it.
The checkpoint, original worktrees, stashes, reports and logs are preserved.

## Change and lifetime

The existing settled-context traversal now returns its validated controller.
`contextIsReady()` remains a Boolean wrapper around that result. Its decisions
are unchanged: exactly one key window in foreground-active scenes, a root and
presented-controller chain with no presenting/dismissing controller or transition
coordinator, and the final controller's loaded view attached to that exact window.
M continues using the wrapper and its unchanged separate presentation gate.

D imports HealthKitUI, strongly retains the returned controller, and assigns it
to `directStore.authorizationViewControllerPresenter` immediately before the
existing `requestPerObjectReadAuthorization` call. No second traversal or async
hop separates validation and assignment/request. The arguments remain
`.userAnnotatedMedicationType()` and `predicate: nil`.

The installed iPhoneOS 27.1 SDK declares the presenter as weak and nullable in
`HealthKitUI.framework/Headers/HKHealthStore+UIKit.h`, available from iOS 17.
The diagnostic already targets iOS 26. There is no new framework dependency in
the project: HealthKitUI is already used by S/M. The explicit property selects
a presenting controller; it is not a force-sheet or permission-reset API.

`directPresenter` is strongly owned by the observer alongside `directStore`.
The observer is the app's StateObject and is also captured strongly by the native
completion. Once selected, neither presenter nor store is cleared at callback,
observation end, timeout, background interruption or a late callback. Callback
success does not prove the sheet disappeared, and a diagnostic timeout does not
cancel the HealthKit operation. Retaining the hosting hierarchy can create a
controller/observer ownership cycle; it is deliberate for this single-attempt
diagnostic. **Process termination is the cleanup boundary.** No additional
modal is created or dismissed. This is not a production retention policy.

If context readiness fails, no presenter is assigned and no request is made.
The sole attempt is still consumed. The existing manual button, Debug-only D
opt-in, one-attempt guard, 10-second readiness bound/50-ms polling, 120-second
callback bound, 10-second post-callback observation, lifecycle handling and
late/duplicate callback handling are unchanged. No queries, permission-status
probes, writes, persistence, retries, reset or additional authorization request
are introduced.

The additional fixed log event is `direct.presenter.explicit.retained`, under
the existing `path=D` trace prefix. It identifies this variant and assignment
preparation, not successful sheet presentation. It includes no controller
address, device identifier or Health content. Record later evidence under
**explicit-presenter D**, never overwrite or append to historical D1/D2 logs.

## Preparation validation

- Existing dependency-free `check_project.py`: passed, with focused assertions
  for explicit assignment, strong retention, no early release, preserved Boolean
  wrapper, unchanged request arguments and Release exclusion. Project identity,
  blank signing team, entitlements and disabled scheme opt-in checks passed.
- Focused source comparison against the checkpoint: app/S trigger source is
  byte-for-byte unchanged; M request, request view and cleanup implementation are
  unchanged; shared observer lifecycle and D request/callback/polling tail are
  unchanged. Normalizing the helper's controller/nil return to its old Boolean
  form yields the original readiness traversal exactly.
- Five temporary negative audit variants were rejected: missing presenter
  assignment, weak presenter storage, early presenter release, changed predicate
  and enabled scheme opt-in. Temporary copies did not alter this worktree.
- Production `app/`, historical `reports/`, project/signing configuration,
  scheme, Info.plist and entitlements have no diff against the checkpoint.
- Exact source diff reviewed; `git diff --check` passed.
- Unsigned generic-iOS Debug build: **BUILD SUCCEEDED**, Xcode 27.1 (27A9275),
  iPhoneOS SDK 27.1, Swift 5 language mode, iOS 26 deployment target.
  Existing unchanged M callback non-Sendable-to-Sendable conversion warning and
  AppIntents metadata-extraction-skipped warning remain. No new D warning.

Build command (no installation or launch):

```sh
xcodebuild \
  -project diagnostics/HealthAuthorizationComparison/HealthAuthorizationComparison.xcodeproj \
  -scheme HealthAuthorizationComparison -configuration Debug -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -derivedDataPath /private/tmp/personalos-health-explicit-presenter-derived \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO build
```

Local build log: `/private/tmp/personalos-health-explicit-presenter-build.log`.
Build outputs remain outside the repository. Signing settings were not edited;
unsigned flags applied to this command only. Shared scheme opt-in stays disabled.
No signing/device acceptance, Release binary, runtime retention, sheet visibility,
device timeout/late callback or read-access result is established by this build.
The source audit is not a UIKit/HealthKit runtime test.

## Proposed single device trial — requires separate authorization

1. Arrange a separately approved signed build/over-install of this variant using
   the existing diagnostic identity and signing setup, with no uninstall/reset.
   The prepared unsigned artifact is not an installed or device-validated app.
   Preserve production/v2, Metro, storage, Health data and permission settings.
2. Once the observer is ready, use a fresh diagnostic process with explicit
   `PERSONALOS_NATIVE_HEALTH_PATH=D`, no attached debugger and no enabled shared
   scheme opt-in. Capture only sanitized diagnostic trace lines in a new
   explicit-presenter D record, with the variant's source/build provenance.
3. Keep the app continuously foregrounded. Do not deliberately background and
   return, lock the phone, switch apps or interrupt the attempt. Confirm Path D,
   No request started, and a responsive counter before pressing the existing
   manual D button exactly once. Do not add a delay or automatic trigger.
4. Record `direct.presenter.explicit.retained` when context passes, then observe
   separately: recognizable Apple sheet visibility, actual action label,
   disappearance, callback Bool/error and timing, and counter responsiveness.
   Do not select medications or grant access for this presentation-only trial;
   if the sheet appears, use Don't Allow as in historical D1 and record the actual
   label. Do not mislabel that action Cancel. No screenshots or Health contents.
5. Keep the existing callback and observation bounds. After the observation
   window, check the counter and end this single trial. If readiness fails, no
   request should occur. On timeout, do not retry: dismiss any visible sheet
   without granting access, then stop the diagnostic process. Do not equate
   timeout with cancellation or root retention with sheet disappearance.

System-sheet inactivity may still be logged; it is distinct from deliberate app
backgrounding. Record any interruption and stop without an automatic replacement
trial. Any later attempt requires a separate decision. Process termination
releases the deliberately retained presenter/store graph.

Historical D2 included a pre-request background/foreground cycle. This proposed
continuous-foreground trial is therefore **not a matched control for D2**. Build,
elapsed time and system-held request history also differ and are not reset.
Presentation would show that this configuration can present in that trial, not
prove that inference caused D2 or that the change is a reliable fix. Immediate
success without a sheet would show that explicit selection is insufficient in
that trial. Error/timeout/context failure are separate outcomes. None establishes
read access. D already tested the direct per-object API; that is not the new
variable. **Read access remains untested; FB25287175 remains unresolved.**

Preparation stopped without install, launch, permission request, device test,
commit, push or merge. No historical evidence was rewritten.
