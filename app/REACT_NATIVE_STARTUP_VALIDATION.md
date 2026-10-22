# App-owned SampleTurboModule startup correction

Branch: `fix/sample-turbomodule-startup`, based on
`ab2f0d2a168d02d5b46c6f0be482c6c8a163909a`.

Implementation is ready for Mac validation. **Native build, XCTest execution
and physical-device acceptance remain pending.** The host-retention comparison
is paused. First device acceptance is normal Run reaching **Today** without the
`SampleTurboModule` overlay; repeat clean startup before resuming the comparison.

## Installed API and cause

Before implementation, the installed React Native 0.87.1 sources were inspected:

- `scripts/codegen/templates/RCTAppDependencyProviderH.template` declares
  `RCTAppDependencyProvider : NSObject <RCTDependencyProvider>` without a
  subclassing restriction.
- `Libraries/AppDelegate/RCTDependencyProvider.h` declares the instance method
  `- (NSArray<NSString *> *)unstableModulesRequiringMainQueueSetup` under
  `NS_ASSUME_NONNULL_BEGIN`. This is the nonoptional `[String]` method being
  overridden. The generated implementation template implements that selector
  and returns `RCTUnstableModulesRequiringMainQueueSetupProvider.modules`.
- `Libraries/AppDelegate/RCTReactNativeFactory.mm:215` obtains the list through
  `self.delegate.dependencyProvider` on its OSS path. A provider subclass is the
  relevant extension point; overriding only the app's factory-delegate method
  would not intercept this route.
- `package.json:206` marks `SampleTurboModule` with
  `unstableRequiresMainQueueSetup: true`. Codegen places it in the eager list.
  `RCTHost` forwards that list to `RCTInstance._start`, whose main-queue loop
  resolves each name through `RCTModuleRegistry` and `RCTTurboModuleManager`.
  Failed resolution logs the supplied error at `RCTTurboModuleManager.mm:917`.
- The app's lockfile selects `React-Core-prebuilt` and omits
  `ReactCommon-Samples`, the separate pod that owns `RCTSampleTurboModule`.
  Neither the core class provider nor the regenerated module-provider map
  supplies the sample implementation. Generated sample interfaces do not make
  that implementation available.

The installed API supports the subclass/selector extension at source level.
The actual Swift import, compilation and binary dispatch must still be checked
with the Mac's generated configuration. This Linux workspace has no Swift
compiler, Xcode, Apple SDK or the Mac's Pods/build products.

## Focused change

`ios/PersonalOS/AppDelegate.swift` installs `PersonalOSDependencyProvider` on the
same delegate already passed to and retained with `RCTReactNativeFactory`.
The subclass overrides only `unstableModulesRequiringMainQueueSetup`, passes
`super`'s result to `personalOSModulesRequiringMainQueueSetup`, and inherits all
other provider behavior. It applies in Debug and Release.

`ios/ReactNativeStartupModules.swift` is a pure filter. It removes only entries
equal to `SampleTurboModule`, retaining all other strings, their order and their
duplicates. It neither trims names nor tests whether other modules resolve.
The small function lets the existing native test target test the actual filter
without importing or mocking React Native.

`ios/tests/ReactNativeStartupTests.swift` covers empty and sample-only arrays,
an absent sample, duplicate sample entries, duplicate real entries, future/unknown
names, case/prefix/suffix/whitespace lookalikes and RN 0.87.1's generated order.
The Xcode project adds only source membership: the filter to app and test
targets, and the tests to the test target. No build settings are changed.

No dependencies, package/Pod locks, generated Pods, installed RN sources, logging,
Health authorization code, signing, entitlements, schemes, app identity or
storage behavior are changed. The workaround should be reviewed when upgrading
React Native; it does not add the sample implementation or conceal other lookup
errors. Existing diagnostic work and pending notes remain in their original
worktrees. The base commit's retention implementation is preserved.

## Verification performed here

- Inspected the installed provider protocol, generated header/implementation
  templates and factory call path before editing.
- Checked the startup assignment, subclass, single override and call to `super`
  against those APIs. Reviewed that every remaining provider selector is inherited.
- Reproduced the generated eager list in `/tmp` from the installed dependencies:
  `AccessibilityManager`, `Appearance`, `AppState`, `DeviceInfo`,
  `PlatformConstants`, `SampleTurboModule`, `StatusBarManager`.
- Checked Xcode source membership and that project changes leave all build
  settings, existing sources and target dependencies intact.
- Reviewed the complete diff against `ab2f0d2`, including unchanged Health,
  storage and configuration files, and checked whitespace and sensitive data.

These are source/configuration checks, not native execution. The new four XCTest
methods have **not run**. No JavaScript change was made; Jest, TypeScript and
ESLint would not validate this Swift correction. Native provider wiring and
other inherited capabilities still need the focused Mac checks below.

## Mac validation, in order

1. Preserve all Mac-local work before switching to the supplied branch/commit.
   Retain the same installation, signing team, bundle identifier, entitlements,
   app group/Keychain settings, iPhone and permissions. Do not overwrite local
   Xcode signing changes with repository defaults. Do not uninstall, reset
   permissions, clear storage or alter Health selections. Preserve the existing
   initialized v2 Medication collection. Keep private device details and Health
   contents out of committed evidence.
2. Open `app/ios/PersonalOS.xcworkspace`. Verify the actual installed RN version
   and `Podfile.lock`/`Pods/Manifest.lock` match. Inspect the generated provider
   header and `RCTUnstableModulesRequiringMainQueueSetupProvider.mm` under
   `ios/build/generated/ios`. The raw generated list should still contain the
   sample. Do not hand-edit generated files or run dependency updates for this
   fix. Use the already-working local build configuration and SDK.
3. Keep `PERSONALOS_AUTHORIZATION_SMOKE_TEST`,
   `PERSONALOS_AUTHORIZATION_HOST_RETENTION` and
   `PERSONALOS_SYNTHETIC_HEALTH_TESTS` disabled/unset in **Run and Test** for
   startup acceptance. Do not add `NATIVE_XCTEST` to the app target. Start Metro
   for this checkout if Debug requires it; rebuild native sources with Product
   → Build, rather than relying on Fast Refresh or an old test product.
4. **First device acceptance: use normal Run (not XCTest).** Disable diagnostic
   breakpoints, keep the phone foregrounded/unlocked, and observe startup through
   a settled **Today** screen. Confirm the console has no
   `Unable to find module for SampleTurboModule`, no overlay was merely dismissed,
   and no other startup error replaced it. Stop and repeat from a fresh process.
   Stay on Today: do not open Medication or Prescription Wallet, whose mounting
   can read/initialize/migrate storage. Do not issue Health or dose queries.
5. **Focused provider wiring check, separately from the timing baseline:** on a
   diagnostic launch, break at the return from
   `AppDelegate.application(_:didFinishLaunchingWithOptions:)`. Inspect
   `delegate.dependencyProvider` and `factory.delegate.dependencyProvider`; both
   must be the installed `PersonalOSDependencyProvider`. Inspect its
   `unstableModulesRequiringMainQueueSetup()` result. Compare it with the actual
   generated list: only exact sample entries may be absent. Alternatively break
   in `RCTInstance._start`'s eager-module loop and inspect
   `modulesRequiringMainQueueSetup` to verify the list that reaches startup.
   Verify the subclass has no overrides for the provider's image loaders,
   decoders, URL handlers, Fabric components or module providers. Remove these
   breakpoints before any clean baseline or retention run.
6. Build for Testing and run **only** `PersonalOSTests/ReactNativeStartupTests`
   using that class's Test-navigator run button. Confirm all four tests pass.
   Leave all Health opt-ins disabled. Do not run the full suite or
   `testRealIdentifierSecureRoundTripAndSemanticEquality`. Also build Release
   without installing it, to check the unconditional provider override; retain
   the same Debug installation for subsequent comparisons.
7. Only after normal startup repeatedly reaches Today without the overlay may
   the [host-retention procedure](HEALTH_HOST_RETENTION_DIAGNOSTIC.md) resume.
   Re-establish a fresh Arm A before B with the same installation and state.
   Record callback/lifetime assertions separately from visible Apple-sheet
   appearance, cancellation and restored interaction. The previous 10.614-second
   Arm A result overlapped the overlay/startup and is not a clean baseline.

Record Debug build, Release build, focused XCTest, provider wiring and repeated
normal-Run Today acceptance independently. None is marked passed by this commit.
