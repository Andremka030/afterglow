"""Portrait (9:16) crops + PWA icons from art-src/. Run: /tmp/rb/bin/python tools/mobile-assets.py"""
import os
from PIL import Image, ImageOps, ImageEnhance
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, OUT = os.path.join(R, "art-src"), os.path.join(R, "assets", "img")
def crop916(im, cx=0.5, cy=0.5):
    w, h = im.size; tw = min(w, round(h * 9 / 16)); th = min(h, round(tw * 16 / 9))
    x = int(max(0, min(w - tw, cx * w - tw / 2))); y = int(max(0, min(h - th, cy * h - th / 2)))
    return im.crop((x, y, x + tw, y + th))
def save(im, name, size=(720, 1280), q=80):
    im.convert("RGB").resize(size, Image.LANCZOS).save(os.path.join(OUT, name + ".webp"), quality=q, method=6); print("ok", name)
# character cards (portrait, full-screen swipe cards)
for name, src in (("p_elena", "elena_smile"), ("p_maya", "maya"), ("p_sasha", "sasha")):
    save(crop916(Image.open(os.path.join(SRC, src + ".jpg")), 0.5, 0.5), name)
# portrait backgrounds (location cards + date scene on phones); cx = horizontal focus per scene
for name, cx in (("bg_hotel", .52), ("bg_rooftop", .55), ("bg_beach", .40), ("bg_market", .5), ("bg_apartment", .5), ("title", .70)):
    save(crop916(Image.open(os.path.join(SRC, name + ".jpg")), cx), name + "_p")
# PWA icons from Elena's face
face = Image.open(os.path.join(SRC, "elena_smile.jpg")).convert("RGB"); w, h = face.size
sq = face.crop((int(w * .18), int(h * .06), int(w * .82), int(h * .06 + w * .64)))
sq = ImageEnhance.Contrast(sq).enhance(1.04)
for s in (192, 512): sq.resize((s, s), Image.LANCZOS).save(os.path.join(OUT, f"icon-{s}.png"), optimize=True)
# maskable: subject inside 80% safe zone on brand bg
m = Image.new("RGB", (512, 512), (14, 12, 16)); m.paste(sq.resize((420, 420), Image.LANCZOS), (46, 46))
big = sq.resize((512, 512), Image.LANCZOS)  # full-bleed face reads better; face sits in centre safe zone
big.save(os.path.join(OUT, "icon-maskable-512.png"), optimize=True)
sq.resize((180, 180), Image.LANCZOS).save(os.path.join(OUT, "icon.png"), optimize=True)
print("icons ok")
