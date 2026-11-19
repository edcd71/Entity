import AppKit
import CoreText
import ImageIO
import UniformTypeIdentifiers

// Build from the same font as the title, with its .14em tiles and .012em seams.
let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let output = root.appendingPathComponent("assets/branding")
let iconset = output.appendingPathComponent("Entity.iconset")
let fm = FileManager.default
try fm.createDirectory(at: iconset, withIntermediateDirectories: true)
let fontURL = root.appendingPathComponent("assets/fonts/GeistSerif-Regular.ttf")
let descriptors = CTFontManagerCreateFontDescriptorsFromURL(fontURL as CFURL) as! [CTFontDescriptor]
let font = CTFontCreateWithFontDescriptor(descriptors[0], 1000, nil)
var character: UniChar = 69
var glyph: CGGlyph = 0
guard CTFontGetGlyphsForCharacters(font, &character, &glyph, 1),
      let outline = CTFontCreatePathForGlyph(font, glyph, nil) else { fatalError("Cannot load the Entity E") }

let bounds = outline.boundingBoxOfPath
let scale = 600 / bounds.height
let em = 1000 * scale
let cell = em * 0.14
let gap = em * 0.012
let x = 512 - bounds.midX * scale
let y = 512 - bounds.midY * scale
// Anchor the grid to the glyph rather than the background, as in the title.
let gridX = x - em * 0.22
let gridY = 212 - em * 0.035
var tiles = [CGRect]()
for row in -1...8 {
    for column in -1...8 {
        tiles.append(CGRect(x: gridX + CGFloat(column) * cell, y: gridY + CGFloat(row) * cell,
                            width: cell - gap, height: cell - gap))
    }
}
func number(_ value: CGFloat) -> String { String(format: "%.4f", Double(value)) }
var commands = [String]()
outline.applyWithBlock { pointer in
    let element = pointer.pointee
    func point(_ i: Int) -> String { "\(number(element.points[i].x)) \(number(element.points[i].y))" }
    switch element.type {
    case .moveToPoint: commands.append("M\(point(0))")
    case .addLineToPoint: commands.append("L\(point(0))")
    case .addQuadCurveToPoint: commands.append("Q\(point(0)) \(point(1))")
    case .addCurveToPoint: commands.append("C\(point(0)) \(point(1)) \(point(2))")
    case .closeSubpath: commands.append("Z")
    @unknown default: break
    }
}
let clips = tiles.map { "<rect x=\"\(number($0.minX))\" y=\"\(number($0.minY))\" width=\"\(number($0.width))\" height=\"\(number($0.height))\"/>" }.joined(separator: "\n      ")
let svg = """
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-labelledby="title description">
  <title id="title">Entity</title>
  <desc id="description">The tiled Geist Serif E from Entity, in white on Entity blue.</desc>
  <defs>
    <clipPath id="tiles" clipPathUnits="userSpaceOnUse">
      \(clips)
    </clipPath>
  </defs>
  <rect x="64" y="64" width="896" height="896" rx="200" fill="#2047df"/>
  <g clip-path="url(#tiles)">
    <path fill="#ffffff" transform="matrix(\(number(scale)) 0 0 -\(number(scale)) \(number(x)) \(number(1024-y)))" d="\(commands.joined())"/>
  </g>
</svg>
"""
try svg.write(to: output.appendingPathComponent("entity-icon.svg"), atomically: true, encoding: .utf8)

func render(size: Int, to url: URL) throws {
    let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                            space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    context.scaleBy(x: CGFloat(size) / 1024, y: CGFloat(size) / 1024)
    context.setFillColor(CGColor(colorSpace: colorSpace, components: [CGFloat(32)/255, CGFloat(71)/255, CGFloat(223)/255, 1])!)
    context.addPath(CGPath(roundedRect: CGRect(x: 64, y: 64, width: 896, height: 896), cornerWidth: 200, cornerHeight: 200, transform: nil))
    context.fillPath()
    // At 16/32 px the seams become subpixel noise; preserve the serif silhouette.
    if size > 32 {
        context.clip(to: tiles.map { CGRect(x: $0.minX, y: 1024 - $0.maxY, width: $0.width, height: $0.height) })
    }
    context.translateBy(x: x, y: y)
    context.scaleBy(x: scale, y: scale)
    context.setFillColor(CGColor(gray: 1, alpha: 1))
    context.addPath(outline)
    context.fillPath()
    let image = context.makeImage()!
    let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else { fatalError("Cannot save \(url.path)") }
}

for points in [16, 32, 128, 256, 512] {
    for density in [1, 2] {
        let suffix = density == 2 ? "@2x" : ""
        try render(size: points * density, to: iconset.appendingPathComponent("icon_\(points)x\(points)\(suffix).png"))
    }
}
try render(size: 1024, to: output.appendingPathComponent("entity-icon.png"))
try render(size: 256, to: output.appendingPathComponent("entity-icon-preview.png"))
let process = Process()
process.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
process.arguments = ["-c", "icns", iconset.path, "-o", output.appendingPathComponent("entity.icns").path]
try process.run()
process.waitUntilExit()
guard process.terminationStatus == 0 else { fatalError("Cannot package the icon") }
print("Built Entity icon: SVG, PNG, and macOS ICNS at \(output.path)")
