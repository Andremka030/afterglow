#!/usr/bin/env python3
"""Generate/edit images with xAI Imagine API. Key from env LLM_API_KEY (or XAI_API_KEY).
usage: xai_image.py gen  OUT.jpg ASPECT "prompt"
       xai_image.py edit OUT.jpg ASPECT "prompt" REF1.jpg [REF2.jpg ...]"""
import base64, json, os, sys, time, urllib.request
KEY = os.environ.get("XAI_API_KEY") or os.environ["LLM_API_KEY"]
MODEL = os.environ.get("IMG_MODEL", "grok-imagine-image-2.0")
mode, out, aspect, prompt, *refs = sys.argv[1:]
body = {"model": MODEL, "prompt": prompt, "aspect_ratio": aspect, "resolution": os.environ.get("IMG_RES", "2k"), "response_format": "b64_json"}
if mode == "edit":
    imgs = [{"url": "data:image/jpeg;base64," + base64.b64encode(open(r, "rb").read()).decode(), "type": "image_url"} for r in refs]
    if len(imgs) == 1: body["image"] = imgs[0]
    else: body["images"] = imgs
url = "https://api.x.ai/v1/images/" + ("edits" if mode == "edit" else "generations")
req = urllib.request.Request(url, json.dumps(body).encode(), {"Content-Type": "application/json", "Authorization": "Bearer " + KEY})
t = time.time()
try:
    d = json.load(urllib.request.urlopen(req, timeout=300))
except urllib.error.HTTPError as e:
    print("HTTP", e.code, e.read()[:400].decode(errors="ignore")); sys.exit(1)
item = d["data"][0]
open(out, "wb").write(base64.b64decode(item["b64_json"]))
cost = (d.get("usage") or {}).get("cost_in_usd_ticks", 0) / 1e10
with open(os.path.join(os.path.dirname(os.path.abspath(out)), "spend.log"), "a") as f: f.write(f"{os.path.basename(out)}\t{mode}\t{MODEL}\t${cost:.4f}\n")
print(f"ok {out} {item.get('mime_type')} ${cost:.4f} {time.time()-t:.1f}s")
