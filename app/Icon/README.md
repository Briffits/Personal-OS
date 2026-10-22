# Standard PersonalOS app icon

This main-based integration carries the approved assets and deterministic script
from a7a78c0d17d2f74376d7d6caa5fc4c9f013d218e. Original PNGs are preserved unchanged.
Only Standard/Any is configured; custom Dark and Tinted appearances are unset.
Dark/Monochrome originals are provenance assets, not configured app icons.

## Sources

All three are 1254×1254, 8-bit RGB PNGs, with no alpha/tRNS and no iCCP, sRGB or
gAMA source colour metadata. Backgrounds, rounded tiles, shadows and margins are
baked pixels. Artwork scale/margins differ between variants.

| Source filename | SHA-256 |
| --- | --- |
| 2026OctStandardPersonalOSIcon.png | e552fec98af1537d54860b7bcda57817a2a0b17cdc2da3e89807fc2339615c0e |
| 2026OctMonochromePersonalOSIcon.png | 887f993fe2d054644cba15f632d7c391cbf6e51bbf727e57cfdbbd1e45d32fc7 |
| 2026OctDarkThemePersonalOSIcon.png | ecbc7fdb052bb7bf3f2a85ab3484a9c71ea97e2a0803bbe2f5793ad59b8f5cf0 |

## Reproduce

From repository root: `swift app/Icon/prepare_standard.swift`.

The script explicitly **assumes untagged RGB is sRGB**; it cannot recover an
unknown original profile. CoreGraphics high-quality interpolation resizes the
entire composition to 1024×1024, opaque RGB. ImageIO embeds sRGB IEC61966-2.1.
No cropping, redraw, background removal, extra padding or generated artwork.
No third-party image-processing dependency.

Standard derivative SHA-256:
`bd8d3c00e3277605d3bd61e73bbf674d0cbae29d19d23d38fa0d2fe21bafa763`.
Repeat generation matched on macOS 27.0.1 / Xcode 27.1. Future OS encoder byte
identity is not promised.

Previews show 60pt @2x/@3x (120/180 pixels) on neutral light/dark backgrounds.
They are explicitly **simulated**, with an exponent-5 superellipse approximation
of system masking, not Apple's exact mask or device screenshots. The app asset
is unmasked and retains the full composition. Preview viewers can rescale images.

Apple supports one 1024×1024 iOS asset for automatic size generation:
https://developer.apple.com/documentation/xcode/configuring-your-app-icon
Design guidance: https://developer.apple.com/design/human-interface-guidelines/app-icons

See [main integration validation](../ICON_MAIN_INTEGRATION.md) for checks on this
branch. Prior user-visible acceptance occurred on the separate v2 branch and
must not be interpreted as device acceptance of this main-based build.
