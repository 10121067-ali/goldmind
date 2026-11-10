from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "icons"
OUT.mkdir(exist_ok=True)


def icon(size, pad_ratio=0.0):
    s = size * 4
    img = Image.new("RGBA", (s, s), (11, 14, 20, 255))
    d = ImageDraw.Draw(img)
    for y in range(s):
        t = y / s
        d.line([(0, y), (s, y)], fill=(int(14 + 10 * t), int(18 + 8 * t), int(28 + 14 * t), 255))
    p = s * pad_ratio
    inner = s - 2 * p
    # rising candles
    cx = [0.26, 0.42, 0.58, 0.74]
    tops = [0.62, 0.50, 0.40, 0.24]
    bots = [0.80, 0.72, 0.66, 0.56]
    for i, x in enumerate(cx):
        x0 = p + inner * (x - 0.055)
        x1 = p + inner * (x + 0.055)
        y0 = p + inner * tops[i]
        y1 = p + inner * bots[i]
        col = (233, 185, 73, 255) if i % 2 == 0 or i == 3 else (246, 215, 122, 255)
        d.line([((x0 + x1) / 2, y0 - inner * 0.05), ((x0 + x1) / 2, y1 + inner * 0.04)], fill=col, width=int(inner * 0.018))
        d.rounded_rectangle([x0, y0, x1, y1], radius=inner * 0.02, fill=col)
    # trend arrow
    pts = [(p + inner * 0.18, p + inner * 0.60), (p + inner * 0.45, p + inner * 0.38),
           (p + inner * 0.60, p + inner * 0.46), (p + inner * 0.84, p + inner * 0.20)]
    d.line(pts, fill=(31, 199, 126, 255), width=int(inner * 0.035), joint="curve")
    ax, ay = pts[-1]
    a = inner * 0.08
    d.polygon([(ax + a * 0.25, ay - a * 0.25), (ax - a * 0.9, ay - a * 0.1), (ax - a * 0.1, ay + a * 0.9)], fill=(31, 199, 126, 255))
    img = img.resize((size, size), Image.LANCZOS)
    return img


icon(192).save(OUT / "icon-192.png")
icon(512).save(OUT / "icon-512.png")
icon(512, pad_ratio=0.12).save(OUT / "icon-maskable-512.png")
print("ok")
