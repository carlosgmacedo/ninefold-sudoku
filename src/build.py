import os, json, shutil, hashlib
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(ROOT, "app.html")).read()
engine = open(os.path.join(ROOT, "engine.js")).read()
bank = open(os.path.join(ROOT, "bank.js")).read()
body = src.replace("/*ENGINE*/", engine).replace("/*BANK*/", bank)

# 1) Artifact version: page fragment (the artifact host adds the document skeleton)
art_dir = os.path.join(ROOT, "dist", "artifact")
os.makedirs(art_dir, exist_ok=True)
art = body.replace("<!--PWA_HEAD-->", "").replace("<!--PWA_SCRIPT-->", "")
open(os.path.join(art_dir, "sudoku.html"), "w").write(art)

# 2) Installable offline version (PWA)
pwa_dir = os.path.join(ROOT, "dist", "ninefold-sudoku")
shutil.rmtree(pwa_dir, ignore_errors=True)
os.makedirs(pwa_dir)

pwa_head = """<meta name="theme-color" content="#EDF0F4" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0E131B" media="(prefers-color-scheme: dark)">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" href="icon-192.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Ninefold">
<meta name="apple-mobile-web-app-status-bar-style" content="default">"""
pwa_script = """<script>
if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", function(){ navigator.serviceWorker.register("sw.js").catch(function(){}); });
}
</script>"""
inner = body.replace("<!--PWA_HEAD-->", pwa_head).replace("<!--PWA_SCRIPT-->", pwa_script)
# split head material (title/meta/link/style) from body content
cut = inner.index('<div class="app"')
head_part, body_part = inner[:cut], inner[cut:]
doc = ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
       "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no\">\n"
       + head_part + "</head>\n<body>\n" + body_part + "</body>\n</html>\n")
open(os.path.join(pwa_dir, "index.html"), "w").write(doc)

def icon(size, path, pad_ratio=0.0):
    S = size * 4
    im = Image.new("RGBA", (S, S), (20, 33, 58, 255))
    d = ImageDraw.Draw(im)
    pad = int(S * (0.20 + pad_ratio))
    g = S - 2 * pad
    cell = g / 3
    d.rounded_rectangle([pad, pad, pad + g, pad + g], radius=int(S * 0.04), fill=(255, 255, 255, 255))
    d.rectangle([pad + cell, pad + cell, pad + 2 * cell, pad + 2 * cell], fill=(33, 82, 207, 255))
    lw = max(4, int(S * 0.018))
    for k in (1, 2):
        x = pad + k * cell
        d.line([x, pad, x, pad + g], fill=(20, 33, 58, 255), width=lw)
        d.line([pad, x, pad + g, x], fill=(20, 33, 58, 255), width=lw)
    im = im.resize((size, size), Image.LANCZOS)
    im.save(path)

icon(180, os.path.join(pwa_dir, "icon-180.png"))
icon(192, os.path.join(pwa_dir, "icon-192.png"))
icon(512, os.path.join(pwa_dir, "icon-512.png"))
icon(512, os.path.join(pwa_dir, "icon-maskable-512.png"), pad_ratio=0.06)

manifest = {
    "name": "Ninefold Sudoku", "short_name": "Ninefold",
    "start_url": "./", "scope": "./", "display": "standalone",
    "background_color": "#EDF0F4", "theme_color": "#14213A",
    "icons": [
        {"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "icon-512.png", "sizes": "512x512", "type": "image/png"},
        {"src": "icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}
    ]
}
open(os.path.join(pwa_dir, "manifest.webmanifest"), "w").write(json.dumps(manifest, indent=2))

ver = hashlib.sha1(doc.encode()).hexdigest()[:10]
sw = """const CACHE = "ninefold-%s";
const FILES = ["./", "index.html", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).catch(() => caches.match("index.html"))));
});
""" % ver
open(os.path.join(pwa_dir, "sw.js"), "w").write(sw)

shutil.make_archive(os.path.join(ROOT, "dist", "ninefold-sudoku"), "zip", os.path.join(ROOT, "dist"), "ninefold-sudoku")
print("built", ver, os.listdir(pwa_dir))
