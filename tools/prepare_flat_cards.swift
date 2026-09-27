import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func loadImage(_ path: String) -> CGImage {
    let url = URL(fileURLWithPath: path) as CFURL
    guard let source = CGImageSourceCreateWithURL(url, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        fatalError("Cannot load \(path)")
    }
    return image
}

func savePNG(_ image: CGImage, to path: String) {
    let url = URL(fileURLWithPath: path) as CFURL
    guard let destination = CGImageDestinationCreateWithURL(
        url,
        UTType.png.identifier as CFString,
        1,
        nil
    ) else {
        fatalError("Cannot create \(path)")
    }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else {
        fatalError("Cannot save \(path)")
    }
}

func colorDistance(_ bytes: [UInt8], _ a: Int, _ b: Int) -> Int {
    let dr = abs(Int(bytes[a]) - Int(bytes[b]))
    let dg = abs(Int(bytes[a + 1]) - Int(bytes[b + 1]))
    let db = abs(Int(bytes[a + 2]) - Int(bytes[b + 2]))
    return max(dr, max(dg, db))
}

func prepareCard(input: String, output: String) {
    let source = loadImage(input)
    let width = source.width
    let height = source.height
    let bytesPerRow = width * 4
    var pixels = [UInt8](repeating: 0, count: height * bytesPerRow)
    let space = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue

    guard let context = CGContext(
        data: &pixels,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: bytesPerRow,
        space: space,
        bitmapInfo: bitmapInfo
    ) else {
        fatalError("Cannot create bitmap context")
    }
    context.draw(source, in: CGRect(x: 0, y: 0, width: width, height: height))

    let topRows = min(120, height / 3)
    let leftOuter = 0
    let rightOuter = (width - 1) * 4

    for y in 0..<topRows {
        let row = y * bytesPerRow

        var leftBoundary = 0
        while leftBoundary < width / 3 {
            let index = row + leftBoundary * 4
            if colorDistance(pixels, index, leftOuter) > 34 { break }
            leftBoundary += 1
        }
        if leftBoundary > 0 && leftBoundary < width / 3 {
            let sample = row + min(leftBoundary + 2, width - 1) * 4
            for x in 0..<leftBoundary {
                let index = row + x * 4
                pixels[index] = pixels[sample]
                pixels[index + 1] = pixels[sample + 1]
                pixels[index + 2] = pixels[sample + 2]
                pixels[index + 3] = 255
            }
        }

        var rightBoundary = width - 1
        while rightBoundary > width * 2 / 3 {
            let index = row + rightBoundary * 4
            if colorDistance(pixels, index, rightOuter) > 34 { break }
            rightBoundary -= 1
        }
        if rightBoundary < width - 1 && rightBoundary > width * 2 / 3 {
            let sample = row + max(rightBoundary - 2, 0) * 4
            if rightBoundary + 1 < width {
                for x in (rightBoundary + 1)..<width {
                    let index = row + x * 4
                    pixels[index] = pixels[sample]
                    pixels[index + 1] = pixels[sample + 1]
                    pixels[index + 2] = pixels[sample + 2]
                    pixels[index + 3] = 255
                }
            }
        }
    }

    guard let filled = context.makeImage(),
          let cropped = filled.cropping(to: CGRect(x: 48, y: 2, width: 748, height: 561)) else {
        fatalError("Cannot crop \(input)")
    }

    guard let outputContext = CGContext(
        data: nil,
        width: 700,
        height: 525,
        bitsPerComponent: 8,
        bytesPerRow: 700 * 4,
        space: space,
        bitmapInfo: bitmapInfo
    ) else {
        fatalError("Cannot create output context")
    }
    outputContext.interpolationQuality = .high
    outputContext.draw(cropped, in: CGRect(x: 0, y: 0, width: 700, height: 525))
    guard let result = outputContext.makeImage() else {
        fatalError("Cannot render \(input)")
    }
    savePNG(result, to: output)
}

let arguments = CommandLine.arguments
guard arguments.count == 3 else {
    fatalError("Usage: prepare_flat_cards.swift input output")
}
prepareCard(input: arguments[1], output: arguments[2])
