// Run from repository root: swift app/Icon/prepare_standard.swift
import Foundation
import CoreGraphics
import ImageIO
import AppKit

let base = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let source = base.appendingPathComponent("app/Icon/Originals/2026OctStandardPersonalOSIcon.png")
let srgb = CGColorSpace(name: CGColorSpace.sRGB)!
let input = CGImageSourceCreateWithURL(source as CFURL, nil)!
let raw = CGImageSourceCreateImageAtIndex(input, 0, nil)!
precondition(raw.width == 1254 && raw.height == 1254)
// Assign sRGB to untagged RGB values; this is an explicit assumption, not recovery
// of a known source profile. Preserve every pixel of the square composition.
let original = raw.copy(colorSpace: srgb)!
func context(_ width: Int, _ height: Int) -> CGContext {
    CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
              bytesPerRow: width * 4, space: srgb,
              bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
}
func save(_ image: CGImage, _ relative: String) {
    let url = base.appendingPathComponent(relative)
    let destination = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, image, nil)
    precondition(CGImageDestinationFinalize(destination))
}
let c = context(1024, 1024)
c.interpolationQuality = .high
c.draw(original, in: CGRect(x: 0, y: 0, width: 1024, height: 1024))
let asset = c.makeImage()!
save(asset, "app/ios/PersonalOS/Images.xcassets/AppIcon.appiconset/AppIcon-Standard-1024.png")

// Simulated mask ONLY in previews: exponent-5 superellipse, not Apple's exact
// proprietary system mask. Asset remains square, opaque and completely unmasked.
func mask(_ rect: CGRect) -> CGPath {
    let p = CGMutablePath()
    for i in 0...720 {
        let angle = Double(i) * .pi * 2 / 720
        let x = cos(angle), y = sin(angle)
        let pt = CGPoint(x: rect.midX + rect.width / 2 * (x < 0 ? -1 : 1) * pow(abs(x), 0.4),
                         y: rect.midY + rect.height / 2 * (y < 0 ? -1 : 1) * pow(abs(y), 0.4))
        if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
    }
    p.closeSubpath()
    return p
}
for size in [120, 180] {
    let preview = context(640, size + 110)
    preview.setFillColor(CGColor(gray: 0.88, alpha: 1))
    preview.fill(CGRect(x: 0, y: 0, width: 320, height: size + 110))
    preview.setFillColor(CGColor(gray: 0.16, alpha: 1))
    preview.fill(CGRect(x: 320, y: 0, width: 320, height: size + 110))
    for center in [160, 480] {
        let rect = CGRect(x: center - size / 2, y: 55, width: size, height: size)
        preview.saveGState()
        preview.addPath(mask(rect)); preview.clip()
        preview.interpolationQuality = .high
        preview.draw(asset, in: rect)
        preview.restoreGState()
    }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(cgContext: preview, flipped: false)
    for center in [160, 480] {
        let color: NSColor = center == 160 ? .black : .white
        let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 12), .foregroundColor: color]
        ("SIMULATED mask · 60pt @\(size / 60)x" as NSString).draw(at: CGPoint(x: center - 100, y: 25), withAttributes: attributes)
    }
    NSGraphicsContext.restoreGraphicsState()
    save(preview.makeImage()!, "app/Icon/Previews/Standard-simulated-60pt-\(size / 60)x.png")
}
