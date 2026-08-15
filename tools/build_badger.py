"""
Turns the team badger into the site's logo assets — without redrawing it.

Input:  blogic.png       the badger on a white background
        blogic.jpeg      the full logo (badger + wordmark), kept for reference
Output: assets/badger.png    badger, background knocked out, trimmed
        assets/favicon.png   badger on a dark rounded tile, square
        assets/og.jpg        1200x630 social card

The white is removed by flood-filling inward from the four corners rather than
by thresholding brightness. Thresholding would also eat the white stripe on the
badger's back and the white of its face; a flood fill stops at the dark outline,
so only background that is actually connected to the edge is removed.

Run with:  python tools/build_badger.py
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"

SOURCES = ["blogic.png", "blogic.jpg", "blogic.jpeg",
           "assets/blogic.png", "assets/blogic-logo.png"]

SENTINEL = (255, 0, 255)   # a colour the logo cannot contain
FILL_THRESHOLD = 70        # tolerance for JPEG noise in the background
PAD = 6

ORANGE = "#f59410"
BG = "#0b0d11"          # social card background
FAVICON_BG = "#ffffff"  # tab icon — the logo was drawn for a white ground


def find_source():
    for name in SOURCES:
        path = ROOT / name
        if path.exists():
            return path
    raise SystemExit("blogic.png bulunamadi.")


def knock_out_background(img):
    """Flood fill the background from every corner, then make it transparent."""
    rgb = img.convert("RGB")
    w, h = rgb.size

    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(rgb, seed, SENTINEL, thresh=FILL_THRESHOLD)

    out = img.convert("RGBA")
    pixels = list(rgb.getdata())
    data = list(out.getdata())

    for i, pixel in enumerate(pixels):
        if pixel == SENTINEL:
            data[i] = (data[i][0], data[i][1], data[i][2], 0)

    out.putdata(data)
    return out


def feather(img, rounds=2):
    """
    Flood fill stops at the first pixel dark enough to fail the threshold, which
    leaves a pale fringe where the outline was anti-aliased against the white.
    Fade any bright pixel that touches transparency, twice, to eat that fringe.
    """
    for _ in range(rounds):
        alpha = img.getchannel("A")
        # A pixel's neighbourhood minimum is 0 only if something near it is clear.
        neighbourhood = alpha.filter(ImageFilter.MinFilter(3))

        data = list(img.getdata())
        near = list(neighbourhood.getdata())
        width = img.width

        for i, (r, g, b, a) in enumerate(data):
            if a == 0 or near[i] != 0:
                continue
            if min(r, g, b) > 205:       # pale fringe, not the badger's own white
                data[i] = (r, g, b, 0)

        img.putdata(data)

    return img


def build_badger():
    source = find_source()
    print(f"kaynak: {source.name}  ({Image.open(source).size[0]}x{Image.open(source).size[1]})")

    img = feather(knock_out_background(Image.open(source)))

    box = img.getbbox()
    if box is None:
        raise SystemExit("Resim tamamen sasfaf cikti - esik degerini gozden gecir.")

    badger = img.crop(box)
    padded = Image.new("RGBA", (badger.width + PAD * 2, badger.height + PAD * 2),
                       (0, 0, 0, 0))
    padded.paste(badger, (PAD, PAD), badger)

    padded.save(ASSETS / "badger.png", optimize=True)
    print(f"yazildi: assets/badger.png  ({padded.width}x{padded.height})")
    return padded


def build_favicon(badger):
    """
    Square tile. A transparent landscape badger shrunk into a 16px square is
    unreadable, so it gets a plate to sit on and as much width as the tile
    allows. The plate is white: the badger's own outline and mask are the dark
    shapes, so a dark plate swallowed them.
    """
    size = 256
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    plate = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(plate).rounded_rectangle([0, 0, size - 1, size - 1],
                                            radius=54, fill=FAVICON_BG)
    tile.alpha_composite(plate)

    inner = int(size * 0.82)
    scale = inner / badger.width
    art = badger.resize((inner, max(1, round(badger.height * scale))), Image.LANCZOS)
    tile.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))

    tile.save(ASSETS / "favicon.png", optimize=True)
    print(f"yazildi: assets/favicon.png  ({size}x{size})")


def font(size, bold=False):
    names = (["seguisb.ttf", "segoeuib.ttf", "arialbd.ttf"] if bold
             else ["segoeui.ttf", "arial.ttf"])
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default(size)


def build_og(badger):
    card = Image.new("RGB", (1200, 630), BG)
    draw = ImageDraw.Draw(card)

    for y in range(0, 630, 24):
        for x in range(0, 1200, 24):
            draw.point((x, y), fill="#1a1f27")

    draw.rectangle([0, 0, 1200, 6], fill=ORANGE)

    # Native width where possible; upscaling a small source only adds blur.
    target = min(430, badger.width * 2)
    scale = target / badger.width
    art = badger.resize((target, max(1, round(badger.height * scale))), Image.LANCZOS)
    card.paste(art, (700, (630 - art.height) // 2), art)

    draw.text((80, 170), "Berk Muammer", font=font(72, True), fill="#f2f5f9")
    draw.text((80, 250), "KUZU", font=font(72, True), fill=ORANGE)
    draw.text((80, 370), "Digital design · FPGA / RTL", font=font(30), fill="#98a1af")
    draw.text((80, 412), "Embedded systems · Ankara", font=font(30), fill="#98a1af")
    draw.text((80, 492), "berkkuzu.com", font=font(26, True), fill=ORANGE)

    card.save(ASSETS / "og.jpg", quality=88, optimize=True, progressive=True)
    print("yazildi: assets/og.jpg")


if __name__ == "__main__":
    mark = build_badger()
    build_favicon(mark)
    build_og(mark)
