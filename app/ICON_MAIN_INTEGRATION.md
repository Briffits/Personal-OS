# Main-based icon/startup integration — 22 October 2026

Base: current fetched origin/main at 752c84910f3a2246343a11c389600cbc0f2ea206.
Branch: feat/personal-os-app-icon-main.
Source of selected changes: a7a78c0d17d2f74376d7d6caa5fc4c9f013d218e.

## Scope

Standard-only AppIcon, preserved originals, deterministic preparation script,
simulated previews, and the minimal SampleTurboModule startup correction.
AppDelegate installs a dependency-provider subclass that filters only exact
SampleTurboModule entries from super's eager-module list. Other provider behavior,
module order and duplicates are preserved. Review this workaround when upgrading
React Native 0.87.1.

Main has no native test target. Only four app source-reference/membership lines
are added to project.pbxproj; no v2 test-target infrastructure is imported.
Original four focused tests run via `bash app/ios/tests/run-startup-checks.sh`,
using a temporary Mac Swift package containing only the filter and XCTest cases.

No Health integration, storage/domain changes, dependency-lock changes, signing,
entitlements or scheme modifications. The v2 build report is intentionally not
copied because its signing, storage and device validation do not apply to main.

## Validation on this branch

- Four focused Mac XCTest cases passed, zero failures: exact-match removal,
  order/duplicates, lookalike names, empty/absent lists and RN's generated order.
- Deterministic regeneration produced identical Standard and preview hashes.
- Source copies and derivative match the approved source commit.
- Main's storage/Health-related files remain unchanged; complete tracked diff
  limited to the AppIcon JSON, AppDelegate and project source membership.
- Xcode 27.1 (27A9275), iPhoneOS SDK 27.1: unsigned generic-iOS Debug build.
  **SUCCEEDED**, exit 0; asset compilation included. Warnings remain in
  dependency code/generated JS and script output tracking; no build errors.
- git diff --check and project plist validation passed.

Build command:

```sh
xcodebuild -workspace app/ios/PersonalOS.xcworkspace -scheme PersonalOS \
  -configuration Debug -destination 'generic/platform=iOS' \
  -derivedDataPath /tmp/PersonalOS-app-icon-main-Debug CODE_SIGNING_ALLOWED=NO build
```

Independent copies of existing matching node_modules, Pods and generated sources
were used; Podfile.lock must match Pods/Manifest.lock. Generated dependencies and
build products remain ignored/outside the proposed commit. No signing material,
raw logs or device metadata included.

## Device-testing limits

This main-based integration was **not installed or launched**. The installed v2
app, its data/permissions and its Metro server were left untouched.

The user previously observed Today without error and the Standard icon without
apparent clipping on feat/personal-os-app-icon-v2 at a7a78c0. Those observations
are historical v2 evidence only, not main validation. Real storage behavior and
Health access were not tested during that acceptance either.

Main still supports Medication schema v1 only; the prior v2 app may retain v2
Keychain data even after deletion. Main rejects v2, so this build must not be used
to replace the installed v2 app for icon testing without a separately reviewed
compatibility plan. No storage migration/downgrade fix is part of this PR.
No Health presentation/root-cause claim is made.
