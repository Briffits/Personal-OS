# v2 Standard icon build — 22 October 2026

Worktree: PersonalOS-app-icon-v2; branch feat/personal-os-app-icon-v2.
Exact base: ce7e0542d85778f441a5773683cb865d1c15feee.
Existing worktrees and uncommitted work preserved. No commit/push/merge.

## Diff and storage

Carried the three approved original PNG copies, Standard derivative, two simulated
previews, generation script and preparation README. Only AppIcon Contents.json
selects the Standard/Any asset; Dark/Tinted unset.

Applied only the AppDelegate and Xcode source-membership patch from 59f9748, plus
ReactNativeStartupModules.swift and its four focused tests. Membership includes
the app filter and the existing baseline test target's filter/tests. The Mac-only
test runner is also carried over. No later Health diagnostic changes imported.
The patch reverses cleanly against the original minimal patch. Additional files
are this report and the updated icon provenance README.

Storage/domain source remains unchanged from ce7e054. Medication storage/native
bridge/Keychain wrapper and Prescription storage were byte-compared with HEAD.
The prior assessment established parity with the previously used 24c746b storage.
19 FakeKeychain storage tests passed on these worktree sources. No real retained
records, Keychain values, Health or prescription data were accessed. Manual app
deletion is acknowledged; retained Keychain state is not assumed deleted.

## Startup and opt-ins

AppDelegate starts the React factory with the corrected dependency provider;
SceneDelegate starts the native app. App.tsx initially renders Today, which has
no Health authorization/query or Medication initialization call. Medication's
access request is wired to its manual button only. Native module construction
creates store/reader objects without issuing a query or permission request.
Run/Test scheme has no enabled PERSONALOS diagnostic environment flags. Baseline
smoke/synthetic tests are explicitly opt-in and were not executed.

No unexpected automatic Health request found by source review. Existing behavior:
opening Medication calls storage.read(), which can initialize or migrate v1;
valid v2 is accepted without downgrade. Do not open Medication or Wallet during
initial icon/Today acceptance. Baseline Health query/link functionality and Debug
request traces remain present but are not invoked by normal Today startup.
Runtime Today startup was subsequently confirmed by the user below. Health access
and device storage behaviour remain untested.

## Validation and signed product

- Four focused startup XCTest cases passed on Mac; zero failures.
- Nineteen in-memory Medication storage tests passed.
- git diff --check and Xcode project plist validation passed.
- Original PNG copies, preview PNGs and script matched the approved prior worktree.
- Standard derivative SHA-256:
  bd8d3c00e3277605d3bd61e73bbf674d0cbae29d19d23d38fa0d2fe21bafa763.
- Signed bundle's generated AppIcon PNGs match prior validated compiled PNGs.
- Debug build SUCCEEDED (exit 0), Xcode 27.1 / iPhoneOS SDK 27.1.

Build command:

```sh
xcodebuild -workspace app/ios/PersonalOS.xcworkspace -scheme PersonalOS \
  -configuration Debug -destination 'generic/platform=iOS' \
  -derivedDataPath /tmp/PersonalOS-app-icon-v2-Signed \
  -xcconfig /tmp/personalos-icon-signing.xcconfig build
```

Independent local copies of matching node_modules, Pods and generated sources
were used. Podfile.lock matches Pods/Manifest.lock; locks were not changed.
Signing configuration remains outside Git. Full raw build log is temporary at
/tmp/personalos-icon-v2-signed-build.log; it may contain private signing details
and must not be published without sanitisation. Dependency/script/generated-JS
warnings remain; no build errors.

Product: /tmp/PersonalOS-app-icon-v2-Signed/Build/Products/Debug-iphoneos/PersonalOS.app
Identity: com.briffits.personalos. codesign --verify --deep --strict passed.
Signed entitlements exactly equal the local signed PersonalOS reference:
application-identifier, com.apple.developer.team-identifier,
com.apple.developer.healthkit=true and get-task-allow=true. Profile app identifier
and team match; connected iPhone is provisioned. Profile expires
26 October 2026 20:34:24 UTC. Personal signing/device identifiers omitted.
Comparison against the previous installed binary was unavailable because the user
had deleted PersonalOS. The prepared build was subsequently installed as recorded below.

## Automated installation and launch outcomes

After explicit authorization, Metro's listening-process directory was reverified
as PersonalOS-app-icon-v2/app. The original-smoke Metro server had been stopped;
the v2 server was started on port 8081. Install command succeeded without an
uninstall or reset. devicectl confirmed launch of com.briffits.personalos.

An initial launch command supplying an empty environment dictionary was rejected
by devicectl before launch (exit 64). The successful retry omitted that option and
removed all DEVICECTL_CHILD_ and PERSONALOS_ variables from the caller environment.
Thus diagnostic flags were unset; no Xcode scheme environment was used.

Captured startup output showed JavaScript evaluation, no SampleTurboModule lookup
error, a packager connection warning with automatic retry, and a dropped
momentum-scroll event warning. Metro's correct root was verified, but a successful
packager connection was not independently confirmed. These console warnings are
not equivalent to user-visible errors. Raw console/installation metadata stays
outside Git; this paragraph is the sanitised outcome record.

No programmatic navigation, Health authorization request, storage test on device,
uninstall, reset, permission change, commit, push or merge was performed.

## User-observed device acceptance — 22 October 2026

The user confirmed:
- Today appeared without error.
- The Standard PersonalOS icon was visible on the Home Screen with no apparent
  clipping.

These are human observations, separate from signature/build/source checks and
console output. They establish initial Today and visual icon acceptance only.
**Retained-device storage behaviour and Health access remain untested.** The
in-memory storage tests above do not verify the user's retained data. No inference
that app deletion removed Keychain data is made.

## Scoped commit proposal — not staged or committed

Branch: feat/personal-os-app-icon-v2.
Base: ce7e0542d85778f441a5773683cb865d1c15feee.
Suggested message: `Add Standard app icon and exclude unused startup sample module`

Exact proposed 15-file allowlist:

```text
app/Icon/Originals/2026OctDarkThemePersonalOSIcon.png
app/Icon/Originals/2026OctMonochromePersonalOSIcon.png
app/Icon/Originals/2026OctStandardPersonalOSIcon.png
app/Icon/Previews/Standard-simulated-60pt-2x.png
app/Icon/Previews/Standard-simulated-60pt-3x.png
app/Icon/README.md
app/Icon/prepare_standard.swift
app/V2_ICON_BUILD_PREPARATION.md
app/ios/PersonalOS.xcodeproj/project.pbxproj
app/ios/PersonalOS/AppDelegate.swift
app/ios/PersonalOS/Images.xcassets/AppIcon.appiconset/Contents.json
app/ios/PersonalOS/Images.xcassets/AppIcon.appiconset/AppIcon-Standard-1024.png
app/ios/ReactNativeStartupModules.swift
app/ios/tests/ReactNativeStartupTests.swift
app/ios/tests/run-startup-checks.sh
```

Dark/Monochrome originals are preservation/provenance only, not configured assets.
Generated derivative/previews are intentional reviewed icon assets, not build
products. Project changes are source membership only; no signing/build settings
changed. Storage, Health implementation, schemes and dependency locks are unchanged.

Exclude all external signing xcconfig, profiles, certificates, private team/device
identifiers, raw logs/device JSON, Pods, node_modules, generated ios/build,
DerivedData, app/IPA/dSYM products and the separate Health Feedback/sysdiagnose
materials. No broad git add or forced addition is needed. Existing worktrees and
stashes remain outside this proposal. Review the exact staged diff again if a
commit is later authorized.
