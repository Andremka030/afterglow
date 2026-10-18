#!/usr/bin/env python3
"""Turn source art (art-src/*.jpg, named by asset) into web-sized assets in assets/img/.
- elena_<emotion>: background removed (rembg, if installed) -> transparent webp 900x1200
- elena_card / maya / sasha: 3:4 card webp 600x800
- bg_* (hotel, rooftop, beach, market, apartment) / title: 1920x1080 webp (+ og.jpg 1200x675 from title)
Usage: python3 tools/import-assets.py [SRC_DIR]   (default: art-src/)
Background removal: pip install "rembg[cpu]" (a venv is fine)."""
import os, sys
from PIL import Image, ImageFilter, ImageEnhance
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "art-src")
out = os.path.join(root, "assets", "img"); os.makedirs(out, exist_ok=True)
try:
    from rembg import remove, new_session
    sess = new_session("isnet-general-use")
except Exception as e:
    print("rembg not available, emotions keep their dark backdrop:", e); remove = None
def calm_neon(rgb):
    """Desaturate only magenta/purple and cyan/blue hues (rim lights), keep skin & denim tones."""
    import numpy as np
    hsv = np.array(rgb.convert("HSV")).astype(np.float32)
    h = hsv[..., 0] * 360 / 255
    mag = ((h > 265) & (h < 345)).astype(np.float32)
    cya = ((h > 168) & (h < 214)).astype(np.float32)
    k = 1 - 0.72 * mag - 0.62 * cya
    hsv[..., 1] *= k
    hsv[..., 2] *= 1 - 0.12 * mag      # pull down the hot pink highlights a bit
    out = Image.fromarray(hsv.clip(0, 255).astype("uint8"), "HSV").convert("RGB")
    return ImageEnhance.Color(out).enhance(0.92)
EMO = ["neutral", "smile", "laugh", "shy", "annoyed", "sad", "flirty", "surprised"]
def fit(im, w, h):  # cover-crop to exact size
    r = max(w / im.width, h / im.height); im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2; return im.crop((x, y, x + w, y + h))
def open_src(name):
    for ext in (".jpg", ".png", ".webp"):
        p = os.path.join(src, name + ext)
        if os.path.exists(p): return Image.open(p)
for e in EMO:
    im = open_src("elena_base" if e == "neutral" else "elena_" + e)
    if im is None: print("missing elena_" + e); continue
    im = fit(im.convert("RGB"), 900, 1200)
    if remove:
        # soft hair matte: alpha matting, then 1px choke + tiny feather to kill dark halos
        im = remove(im, session=sess, alpha_matting=True, alpha_matting_foreground_threshold=240,
                    alpha_matting_background_threshold=15, alpha_matting_erode_size=8)
        a = im.split()[3].filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
        rgb = calm_neon(im.convert("RGB"))   # neutralise magenta/cyan studio rim light; scenes re-light her in CSS
        im = rgb.convert("RGBA"); im.putalpha(a)
    im.save(os.path.join(out, f"elena_{e}.webp"), "WEBP", quality=82, method=6); print("ok elena_" + e)
for name, srcname in (("elena_card", "elena_smile"), ("maya", "maya"), ("sasha", "sasha")):
    im = open_src(srcname)
    if im: fit(im.convert("RGB"), 600, 800).save(os.path.join(out, name + ".webp"), "WEBP", quality=80, method=6); print("ok", name)
for name in ("bg_hotel", "bg_rooftop", "bg_beach", "bg_market", "bg_apartment", "title"):
    im = open_src(name)
    if not im: print("missing", name); continue
    im = fit(im.convert("RGB"), 1920, 1080)
    im.save(os.path.join(out, name + ".webp"), "WEBP", quality=78, method=6); print("ok", name)
    if name == "title": im.resize((1200, 675), Image.LANCZOS).save(os.path.join(out, "og.jpg"), quality=85)
