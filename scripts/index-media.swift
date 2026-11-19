import Foundation
import ImageIO
import AVFoundation
import AppKit

let root = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : FileManager.default.currentDirectoryPath)
let fm = FileManager.default
let manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("media/import-manifest.json"))) as! [String:Any]
let files = manifest["files"] as! [[String:Any]]
let iso = ISO8601DateFormatter()
func clean(_ value:Any) -> Any {
    if let d = value as? [String:Any] { return d.mapValues { clean($0) } }
    if let a = value as? [Any] { return a.map { clean($0) } }
    if let n = value as? NSNumber { return n.doubleValue.isFinite ? n : NSNull() }
    if let s = value as? String { return s }
    if let d = value as? Data { return "<\(d.count) bytes>" }
    return String(describing:value)
}
func writeJSON(_ data:Any, _ path:String) throws {
    let bytes = try JSONSerialization.data(withJSONObject:clean(data),options:[.sortedKeys])
    try bytes.write(to:root.appendingPathComponent(path), options:.atomic)
}
func saveJPEG(_ image:CGImage, _ path:URL) -> Bool {
    guard let out = CGImageDestinationCreateWithURL(path as CFURL,"public.jpeg" as CFString,1,nil) else { return false }
    CGImageDestinationAddImage(out,image,[kCGImageDestinationLossyCompressionQuality:0.8] as CFDictionary)
    return CGImageDestinationFinalize(out)
}
var items = [[String:Any]]()
var errors = [[String:String]]()
let dateParser=DateFormatter()
dateParser.locale=Locale(identifier:"en_US_POSIX")
dateParser.dateFormat="yyyy:MM:dd HH:mm:ss"
// A naive EXIF date stays naive: never infer a timezone from the importing Mac.
for (index,file) in files.enumerated() {
    if file["type"] as? String == "sidecar" { continue }
    autoreleasepool {
        let path=file["path"] as! String
        let url=root.appendingPathComponent(path)
        let id=String((file["sha256"] as! String).prefix(20))+"-"+url.deletingPathExtension().lastPathComponent
        let thumb="media/previews/\(id).jpg"
        var item:[String:Any] = ["id":id,"name":url.lastPathComponent,"path":path,"type":file["type"]!,"bytes":file["bytes"]!,"sha256":file["sha256"]!,"format":url.pathExtension.uppercased(),"metadataPath":"media/metadata/\(id).json"]
        var raw=[String:Any]()
        if file["type"] as? String == "image", let source=CGImageSourceCreateWithURL(url as CFURL,nil), let properties=CGImageSourceCopyPropertiesAtIndex(source,0,nil) as? [String:Any] {
            raw=properties
            item["width"]=properties[kCGImagePropertyPixelWidth as String]
            item["height"]=properties[kCGImagePropertyPixelHeight as String]
            let exif=properties[kCGImagePropertyExifDictionary as String] as? [String:Any] ?? [:]
            let tiff=properties[kCGImagePropertyTIFFDictionary as String] as? [String:Any] ?? [:]
            let gps=properties[kCGImagePropertyGPSDictionary as String] as? [String:Any] ?? [:]
            item["camera"]=tiff["Model"]
            item["make"]=tiff["Make"]
            item["lens"]=exif["LensModel"]
            item["iso"]=(exif["ISOSpeedRatings"] as? [Any])?.first
            item["aperture"]=exif["FNumber"]
            item["exposure"]=exif["ExposureTime"]
            item["focalLength"]=exif["FocalLength"]
            item["focalLength35"]=exif["FocalLenIn35mmFilm"]
            if let date=(exif["DateTimeOriginal"] ?? tiff["DateTime"]) as? String {
                item["capturedAt"]=date.replacingOccurrences(of:":",with:"-",range:date.startIndex..<date.index(date.startIndex,offsetBy:min(10,date.count)))
                item["dateSource"]=exif["DateTimeOriginal"] != nil ? "EXIF DateTimeOriginal" : "TIFF DateTime"
                item["timezone"]=exif["OffsetTimeOriginal"]
            }
            if let lat=gps["Latitude"] as? Double, let lon=gps["Longitude"] as? Double {
                item["latitude"] = (gps["LatitudeRef"] as? String == "S" ? -1 : 1)*lat
                item["longitude"] = (gps["LongitudeRef"] as? String == "W" ? -1 : 1)*lon
                item["altitude"] = gps["Altitude"]
            }
            let maker=properties[kCGImagePropertyMakerAppleDictionary as String] as? [String:Any] ?? [:]
            item["contentIdentifier"]=maker["17"]
            let previewURL=root.appendingPathComponent(thumb)
            if fm.fileExists(atPath:previewURL.path) { item["preview"]=thumb }
            else if let image=CGImageSourceCreateThumbnailAtIndex(source,0,[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceThumbnailMaxPixelSize:1000,kCGImageSourceCreateThumbnailWithTransform:true] as CFDictionary), saveJPEG(image,previewURL) { item["preview"]=thumb }
        } else if file["type"] as? String == "video" {
            let asset=AVURLAsset(url:url)
            let duration=CMTimeGetSeconds(asset.duration)
            if duration.isFinite { item["duration"]=duration }
            if let track=asset.tracks(withMediaType:.video).first {
                let size=track.naturalSize.applying(track.preferredTransform)
                item["width"]=Int(abs(size.width)); item["height"]=Int(abs(size.height)); item["fps"]=track.nominalFrameRate
            }
            var metadata=[String:String]()
            for field in asset.metadata {
                let key=field.identifier?.rawValue ?? String(describing:field.key)
                if let value=field.stringValue {
                    metadata[key]=value
                    if key.contains("creationdate") { item["capturedAt"]=value; item["dateSource"]="QuickTime creationdate" }
                    if key.contains("model") { item["camera"]=value }
                    if key.contains("content.identifier") { item["contentIdentifier"]=value }
                    if key.contains("location.ISO6709") {
                        if let regex=try? NSRegularExpression(pattern:"^([+-][0-9.]+)([+-][0-9.]+)"), let match=regex.firstMatch(in:value,range:NSRange(value.startIndex...,in:value)),let a=Range(match.range(at:1),in:value),let b=Range(match.range(at:2),in:value) {
                            item["latitude"]=Double(value[a]);item["longitude"]=Double(value[b])
                        }
                    }
                }
            }
            if item["capturedAt"] == nil, let d=asset.creationDate?.dateValue { item["capturedAt"]=iso.string(from:d);item["dateSource"]="AVFoundation creationDate" }
            raw=["QuickTime":metadata,"duration":duration.isFinite ? duration : 0,"width":item["width"] ?? NSNull(),"height":item["height"] ?? NSNull(),"fps":item["fps"] ?? NSNull()]
            let previewURL=root.appendingPathComponent(thumb)
            if fm.fileExists(atPath:previewURL.path) {item["preview"]=thumb}
            else {
                let generator=AVAssetImageGenerator(asset:asset)
                generator.appliesPreferredTrackTransform=true
                generator.maximumSize=CGSize(width:1000,height:1000)
                if let image=try? generator.copyCGImage(at:CMTime(seconds:0,preferredTimescale:600),actualTime:nil),saveJPEG(image,previewURL) { item["preview"]=thumb }
            }
        } else {item["extractionError"]="Image properties could not be read"}
        if item["preview"] == nil {item["previewError"]="Preview unavailable"}
        do {try writeJSON(raw,"media/metadata/\(id).json")} catch {errors.append(["name":url.lastPathComponent,"error":error.localizedDescription])}
        items.append(item)
    }
    if index % 100 == 0 { print("Indexed \(items.count) media files"); fflush(stdout) }
}
// Confirm Live Photo associations only when the embedded identifiers match.
var videosByIdentifier=[String:[String:Any]]()
for item in items where item["type"] as? String == "video" {if let key=item["contentIdentifier"] as? String {videosByIdentifier[key]=item}}
var companionIDs=Set<String>()
for i in items.indices where items[i]["type"] as? String == "image" {
    if let key=items[i]["contentIdentifier"] as? String,let companion=videosByIdentifier[key] {
        items[i]["liveVideo"]=companion["path"];items[i]["liveVideoId"]=companion["id"];companionIDs.insert(companion["id"] as! String)
    }
    let base=URL(fileURLWithPath:items[i]["path"] as! String).deletingPathExtension().path
    let sidecars=files.filter {($0["type"] as? String == "sidecar") && URL(fileURLWithPath:$0["path"] as! String).deletingPathExtension().path==base}.map {$0["path"]!}
    if !sidecars.isEmpty {items[i]["sidecars"]=sidecars}
}
for i in items.indices {if companionIDs.contains(items[i]["id"] as! String) {items[i]["isLiveCompanion"]=true}}
try writeJSON(["version":1,"generatedAt":iso.string(from:Date()),"source":"iPhone_entity","sourceFiles":files.count,"sourceBytes":files.reduce(0){$0+($1["bytes"] as? Int ?? 0)},"sidecars":files.filter{$0["type"] as? String == "sidecar"}.count,"items":items,"errors":errors],"media/catalog.json")
print("Completed \(items.count) media files; \(companionIDs.count) confirmed Live Photo pairs; \(errors.count) write errors.")
