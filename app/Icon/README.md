# Standard app-icon preparation

Originally prepared 22 October 2026 on main at
`752c84910f3a2246343a11c389600cbc0f2ea206`. Approved artwork, script and previews
carried into `feat/personal-os-app-icon-v2` at
`ce7e0542d85778f441a5773683cb865d1c15feee`. Initial-stage notes below are historical.
No app installation, launch, signing changes or startup correction performed.

## Preserved sources

The supplied files were found in the original development checkout's `app/Icon`
(singular, not `app/Icons`). `Originals/` contains byte-identical copies; the
source files remain untouched. All three are 1254×1254, 8-bit RGB PNGs without
alpha or tRNS, and without iCCP, sRGB or gAMA colour metadata.

| Filename | SHA-256 |
| --- | --- |
| 2026OctStandardPersonalOSIcon.png | e552fec98af1537d54860b7bcda57817a2a0b17cdc2da3e89807fc2339615c0e |
| 2026OctMonochromePersonalOSIcon.png | 887f993fe2d054644cba15f632d7c391cbf6e51bbf727e57cfdbbd1e45d32fc7 |
| 2026OctDarkThemePersonalOSIcon.png | ecbc7fdb052bb7bf3f2a85ab3484a9c71ea97e2a0803bbe2f5793ad59b8f5cf0 |

The rounded tile, background, shadows and outer margins are baked pixels.
The variants have different artwork scales/margins, so are not registered
appearance variants. Only Standard is used in the asset catalogue.

## Processing and reproduction

Run from the repository root:

```sh
swift app/Icon/prepare_standard.swift
```

No dependencies beyond macOS Apple frameworks. Assign **sRGB** to the untagged
source RGB values as an explicit assumption; the original intended colour space
cannot be recovered from the file. CoreGraphics high-quality interpolation
resizes the entire 1254×1254 composition to 1024×1024 in opaque RGB. ImageIO writes
an sRGB IEC61966-2.1 profile. No crop, added padding, background removal, redraw,
artwork generation or mask is applied to the asset. Original metadata is retained
in the source copies; the derivative is freshly encoded.

Asset SHA-256: `bd8d3c00e3277605d3bd61e73bbf674d0cbae29d19d23d38fa0d2fe21bafa763`.
Two consecutive runs produced identical asset and preview hashes on macOS 27.0.1
(26A434), Xcode 27.1 (27A9275). Byte-level encoder reproducibility across future
macOS versions is not asserted.

`AppIcon.appiconset` uses one universal iOS 1024×1024 Any entry. Custom Dark and
Tinted entries remain unset. The existing project already selects `AppIcon`.
Apple supports this single-size asset catalogue workflow:
https://developer.apple.com/documentation/xcode/configuring-your-app-icon
Design guidance: https://developer.apple.com/design/human-interface-guidelines/app-icons

## Previews

`Previews/Standard-simulated-60pt-2x.png` and `...-3x.png` show the same Standard
asset on light and dark neutral backgrounds at 120px and 180px respectively
(60pt Home Screen examples). View at native image resolution; a viewer may scale
them. They are **simulated**, not screenshots or evidence of an installed app.
The exponent-5 superellipse approximates iOS system corner masking, but is not
Apple's exact system mask. Actual OS masking/effects and user icon-size settings
may differ. Dark background here does not represent a custom Dark appearance.
The asset retains the complete original composition, including baked margins.

## Validation

- Original copies compared byte-for-byte with all three supplied sources: pass.
- Source PNG dimensions, colour type, lack of transparency/profile: checked.
- Derivative: 1024×1024, no alpha, embedded sRGB profile: pass.
- Repeat generation hashes identical: pass.
- Catalogue has exactly one Any entry and no appearance overrides: pass.
- Xcode 27.1 / iPhoneOS SDK 27.1 asset compilation: exit 0, no warnings/notices.
  Command (output directory must exist):

```sh
xcrun actool app/ios/PersonalOS/Images.xcassets \
  --compile /tmp/personalos-app-icon-actool --platform iphoneos \
  --minimum-deployment-target 15.1 --target-device iphone --app-icon AppIcon \
  --output-partial-info-plist /tmp/personalos-app-icon-actool/partial.plist \
  --output-format human-readable-text --warnings --notices
```

Produced Assets.car, generated icon PNGs and partial.plist outside the worktree.
No full application build or device validation was performed.

## Startup finding at initial icon preparation

Main's `app/ios/PersonalOS/AppDelegate.swift` still installs
`RCTAppDependencyProvider()` without filtering `SampleTurboModule`.
The known correction is `59f9748a3110ec94c39938b738faf99f25ef0242` on
`fix/sample-turbomodule-startup`; it installs a subclass filtering only that sample
from `unstableModulesRequiringMainQueueSetup`.
Main's package.json, Podfile and Podfile.lock are identical to those at the
correction commit: React Native 0.87.1, React-Core-prebuilt, no
ReactCommon-Samples implementation pod. This indicates the known correction is
still needed for that dependency configuration before reliable device startup
testing. This is source/configuration evidence, not a new reproduction on main.
Review and authorize that fix separately; it was not cherry-picked or applied.

## Subsequent build preparation

The minimal startup correction has now been applied in this worktree and the
unsigned Debug build passed. See [V2_ICON_BUILD_PREPARATION.md](../V2_ICON_BUILD_PREPARATION.md)
for exact changes, focused checks and limitations. Earlier statements above
describe the initial asset-only preparation stage. No device launch occurred.

The current v2 worktree has a signed Debug build. See the linked v2 report for
current signing, unchanged storage, Metro and deferred device steps.

## Device acceptance

On 22 October 2026 the user confirmed Today appeared without error and the
Standard icon was visible on the Home Screen with no apparent clipping. These
are human observations; storage behaviour and Health access remain untested.
See the v2 build report for the separate automated outcomes and commit proposal.
