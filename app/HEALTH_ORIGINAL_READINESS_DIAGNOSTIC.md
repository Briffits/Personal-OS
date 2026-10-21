# Original authorization presenter: test-context readiness

**Device result at `4ab5b66`: automated callback/cleanup PASS in 0.565 seconds;
visibility UNVERIFIED; presentation acceptance UNMET.** The reported trace was
`request.enter main=true`, `result.successTrue main=true`, then
`caller.deliver.afterDismissal main=true`. A brief unidentified screen appeared,
too briefly to identify. Apple's medication-selection sheet was NOT confirmed.
Neither a confirmed sheet nor confirmed absence during that flash is established.

The text below records the `4ab5b66` baseline implementation and procedure.
For the current diagnostic branch use the
[controlled host-retention A/B procedure](HEALTH_HOST_RETENTION_DIAGNOSTIC.md),
which adds equal post-callback observation windows and requires an arm selection.

Base: `19f30ff1e89fbcd905199db101e5286f9fe8956d`. Its reported 0.110-second
failure was `context.presenterBeingPresented` followed by
`caller.deliver.contextRejected`, before host creation. It did not exercise
Apple's Health modifier and is not a direct comparison with later
success-without-sheet runs.

Only the native smoke-test harness changes. Before its single original-presenter
call, it checks on the main actor for exactly one foreground-active key window,
a root controller, a settled root/presented-controller chain (no presentation,
dismissal or transition coordinator), and a final controller attached to that
window. It checks immediately and yields for 50 ms between unsuccessful checks,
with a monotonic 10-second deadline. This is condition-based polling, not a fixed
delay before requesting access. There is no suspension between the successful
check and the request. Timeout fails the presentation prerequisite and returns
without calling the presenter; it is separate from the existing 120-second
callback timeout.

The production file is unchanged from the base, including its guards, clear
content, host, Health modifier, trigger, callback mapping and cleanup. The test
does not prove rendering, inspect private Apple UI or retry authorization.

## Exact physical-iPhone procedure

1. Use this branch/revision in Xcode: `diag/health-authorization-original-readiness`.
   Open `app/ios/PersonalOS.xcworkspace`, select **PersonalOS** and the same
   unlocked physical iPhone running iOS 26+. Keep the existing installation,
   bundle/signing identity, SDK/build configuration and Health state. Record the
   commit, Xcode/SDK/iOS versions and any local configuration differences.
2. Preserve the already-initialized v2 Medication collection. Do not uninstall,
   reset permissions, initialize/migrate storage or change Health settings. Do
   not open Medication or Prescription Wallet during this test: mounting those
   screens can read/initialize/migrate storage. Stay on the default Today screen.
   Do not add/select medications or perform stock, link/unlink or document edits.
3. In **Product → Scheme → Edit Scheme → Test**, use **Debug**. Under
   **Arguments**, disable **Use the Run action's arguments and environment
   variables** if necessary. Enable `PERSONALOS_AUTHORIZATION_SMOKE_TEST=1` for
   **Test only**; leave `PERSONALOS_SYNTHETIC_HEALTH_TESTS` unset/disabled in both
   Run and Test. Retain inherited `DEBUG` and the test target's `NATIVE_XCTEST`
   compilation conditions. No scheme/project change is part of this commit.
4. Start Metro for this checkout if the Debug host needs it. In the Test
   navigator run **only**
   `PersonalOSTests/MedicationNativeTests/testAuthorizationPresenterSmoke`
   using its individual run button. Do not run the full suite or
   `testRealIdentifierSecureRoundTripAndSemanticEquality`. Keep the phone unlocked
   and the host foregrounded; use no breakpoint pauses or extra delays.
5. Observe the phone from launch. The prerequisite gets up to 10 seconds; after
   the request, the callback gets up to 120 seconds. If Apple's medication sheet
   visibly appears, cancel without changing selections. If no sheet appears,
   record **no sheet, no user interaction**, even if XCTest passes. Do not query
   Health, identifiers or dose records, including after a successful callback.
6. Record the prerequisite result, sanitized callback result, observed sheet
   visibility/cancellation and host cleanup/app usability separately. Capture
   only the fixed XCTest activity labels and
   `[MedicationAuthorizationOriginalDiagnostic]` lines. Do not save Health UI,
   real medication data, identifiers, documents or raw error descriptions in
   this public repository. If the app closes, record that observation without
   inferring a crash or successful return to the app.
7. Disable the smoke opt-in after the run. If the callback times out with a sheet
   open, cancel it and stop the test host before another manually initiated run.

## Interpretation and validation

- **Prerequisite failure:** the distinct 10-second failure means the original
  presenter was not called. There should be no `request.enter` from this test.
  This is not an Apple authorization failure or a presentation comparison.
- **Prerequisite satisfied:** the XCTest activity precedes `request.enter`.
  A subsequent `context.*` / `caller.deliver.contextRejected` is still an
  unexercised modifier path. Do not weaken guards or silently retry it.
- **Callback/cleanup:** `result.successTrue` and
  `caller.deliver.afterDismissal` describe callback mapping and host dismissal.
  Cancellation errors, other errors and callback timeouts remain distinct.
- **Visibility:** a green callback check does not verify sheet presentation or
  Health access. No observed sheet is presentation **FAIL**; no visual observation
  is **UNVERIFIED**. Only actual observation establishes visibility. Manual
  cancellation and restored app interaction require their own observations.

Validation in this workspace: `git diff --check` passed. Source/diff review
confirmed only this guide and the smoke-test harness changed, with no new
storage/Health queries or mutations. All other 134 tracked files, including
production sources and configuration, match the base byte-for-byte. Existing
storage/mapping tests and the synthetic Health test are unchanged. Review covered
missing/ambiguous windows, missing roots, detached presenters, unsettled
controllers/ancestors and the timeout return before any authorization call.
Native compilation and XCTest/device execution were not run: this Linux
workspace has no Swift compiler, Xcode or Apple SDK. Mac/iPhone validation remains
required. This correction addresses the test prerequisite only, not the
missing-sheet symptom.
