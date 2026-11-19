// Local OCR worker. Emit measurements only, without retaining the recognized text.
import AppKit
import Foundation
import ImageIO
import Vision

struct Input: Decodable { let digest: String; let path: String }

func makeImage(_ url: URL) -> CGImage? {
    if let source = CGImageSourceCreateWithURL(url as CFURL, nil) {
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 3200
        ]
        if let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) { return image }
    }
    // ImageIO does not rasterize SVG on some macOS versions.
    guard let vector = NSImage(contentsOf: url), vector.size.width > 0, vector.size.height > 0 else { return nil }
    let scale = 2400 / max(vector.size.width, vector.size.height)
    let bounds = CGRect(x: 0, y: 0, width: max(1, vector.size.width * scale), height: max(1, vector.size.height * scale))
    guard let bitmap = CGContext(data: nil, width: Int(bounds.width), height: Int(bounds.height),
                                 bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                                 bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
    bitmap.setFillColor(CGColor(gray: 1, alpha: 1))
    bitmap.fill(bounds)
    var proposed = bounds
    guard let cg = vector.cgImage(forProposedRect: &proposed, context: nil, hints: nil) else { return nil }
    bitmap.draw(cg, in: bounds)
    return bitmap.makeImage()
}

func readText(_ image: CGImage) throws -> (lines: Int, characters: Int, coverage: Double) {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    request.automaticallyDetectsLanguage = true
    request.minimumTextHeight = 0.002
    try VNImageRequestHandler(cgImage: image).perform([request])
    var lines = 0, characters = 0
    var coverage = 0.0
    for observation in request.results ?? [] {
        guard let candidate = observation.topCandidates(1).first else { continue }
        let length = candidate.string.filter { $0.isLetter || $0.isNumber }.count
        guard length > 0, candidate.confidence >= (length == 1 ? 0.90 : 0.45) else { continue }
        lines += 1
        characters += length
        coverage += observation.boundingBox.width * observation.boundingBox.height
    }
    return (lines, characters, min(1, coverage))
}

let detailPass = CommandLine.arguments.contains("--detail")
func measure(_ input: Input) -> [String: Any] {
    guard let image = makeImage(URL(fileURLWithPath: input.path)) else {
        return ["digest": input.digest, "error": "Could not decode image"]
    }
    do {
        if detailPass {
            // Independent overlapping crops give distant signs and labels a larger scale in the detector.
            let width = Int(ceil(Double(image.width) * 0.56)), height = Int(ceil(Double(image.height) * 0.56))
            for y in [0, image.height - height] {
                for x in [0, image.width - width] {
                    guard let crop = image.cropping(to: CGRect(x: x, y: y, width: width, height: height)) else {
                        return ["digest": input.digest, "error": "Could not crop image"]
                    }
                    if try readText(crop).lines > 0 { return ["digest": input.digest, "text": true] }
                }
            }
            return ["digest": input.digest, "text": false]
        }
        let result = try readText(image)
        return ["digest": input.digest, "lines": result.lines, "characters": result.characters, "coverage": result.coverage]
    } catch {
        return ["digest": input.digest, "error": error.localizedDescription]
    }
}

let inputs = try JSONDecoder().decode([Input].self, from: FileHandle.standardInput.readDataToEndOfFile())
let queue = OperationQueue()
queue.maxConcurrentOperationCount = 3
let lock = NSLock()
for input in inputs {
    queue.addOperation {
        autoreleasepool {
            let record = measure(input)
            let data = try! JSONSerialization.data(withJSONObject: record)
            lock.lock()
            FileHandle.standardOutput.write(Data("ENTITY_OCR ".utf8) + data + Data([10]))
            lock.unlock()
        }
    }
}
queue.waitUntilAllOperationsAreFinished()
