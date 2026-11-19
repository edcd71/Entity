"""Representative sRGB colors from a local preview, ordered by coverage."""
from PIL import Image


def sample_palette(path):
    with Image.open(path) as source:
        image = source.convert("RGB")
        image.thumbnail((96, 96))
        quantized = image.quantize(colors=8, method=Image.Quantize.MEDIANCUT)
        palette = quantized.getpalette()
        colors = []
        for count, index in sorted(quantized.getcolors(), reverse=True):
            rgb = palette[index * 3:index * 3 + 3]
            colors.append({"hex": "#" + bytes(rgb).hex().upper(),
                           "weight": round(count / (image.width * image.height), 5)})
        return colors
