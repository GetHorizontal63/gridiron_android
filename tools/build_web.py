#!/usr/bin/env python3
"""Copy the Shakuro Style site's code into www/ for the Android app.

The app ships the pages, scripts, styles and images, and reads all league data (league.db, player
stats, team names) live from the published site, so data updates reach the app without a new release.

The site itself is never changed. In the www/ copy only:
  * sql.js (+ its .wasm), ECharts and the Google Fonts are downloaded once into vendor-cache/
    and served from www/vendor/, so the app needs no CDN;
  * the pages and js/league-db.js are pointed at those local copies;
  * js/site.js sends every data/... request to DATA_BASE (the published site).

  python tools/build_web.py          (then: npx cap sync android)

Files are copied over what is already in www/; nothing is deleted.
"""
import re
import shutil
import urllib.request
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
SITE = APP.parent / "Shakuro Style"
WWW = APP / "www"
CACHE = APP / "vendor-cache"

COPY = ["index.html", "pages", "js", "css", "assets"]       # no data/ (read live), no tools/ or dev server
DATA_BASE = "https://gethorizontal63.github.io/gridiron_web/"   # the published web site (GetHorizontal63/gridiron_web)
SQL_JS = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/sql-wasm.js"
SQL_WASM = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.13.0/sql-wasm.wasm"
ECHARTS = "https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.0/echarts.min.js"
FONTS = "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=Inter:wght@400;500;600;700;800&display=swap"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"   # gets woff2 fonts


def fetch(url, dest):
    """Download once; later builds use the cached copy."""
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            dest.write_bytes(r.read())
        print(f"  downloaded {dest.name}")
    return dest


def vendor():
    out = WWW / "vendor"
    out.mkdir(parents=True, exist_ok=True)
    for url in (SQL_JS, SQL_WASM, ECHARTS):
        shutil.copy2(fetch(url, CACHE / url.rsplit("/", 1)[1]), out)
    # fonts: the stylesheet plus every woff2 it points at
    css = fetch(FONTS, CACHE / "fonts.css").read_text(encoding="utf-8")
    (out / "fonts").mkdir(exist_ok=True)
    for i, url in enumerate(dict.fromkeys(re.findall(r"url\((https://[^)]+)\)", css))):
        name = f"font-{i}.woff2"
        shutil.copy2(fetch(url, CACHE / "fonts" / name), out / "fonts" / name)
        css = css.replace(url, f"fonts/{name}")
    (out / "fonts.css").write_text(css, encoding="utf-8")


def copy_site():
    WWW.mkdir(exist_ok=True)
    for item in COPY:
        src = SITE / item
        if src.is_dir():
            shutil.copytree(src, WWW / item, dirs_exist_ok=True)
        else:
            shutil.copy2(src, WWW / item)


def localize():
    """Point the copied pages at www/vendor instead of the CDNs."""
    for page in [WWW / "index.html", *(WWW / "pages").rglob("*.html")]:
        root = "../" * (len(page.relative_to(WWW).parts) - 1)
        html = page.read_text(encoding="utf-8")
        html = re.sub(r'\s*<link rel="preconnect"[^>]*>', "", html)
        html = html.replace(f'<link href="{FONTS}" rel="stylesheet">', f'<link href="{root}vendor/fonts.css" rel="stylesheet">')
        html = html.replace(f'src="{SQL_JS}"', f'src="{root}vendor/sql-wasm.js"')
        html = html.replace(f'src="{ECHARTS}"', f'src="{root}vendor/echarts.min.js"')
        page.write_text(html, encoding="utf-8")
    db = WWW / "js" / "league-db.js"
    js = db.read_text(encoding="utf-8")
    js = js.replace(f"const SQL_WASM_URL = '{SQL_WASM}';",
                    "const SQL_WASM_URL = (document.documentElement.dataset.root || '') + 'vendor/sql-wasm.wasm';")
    db.write_text(js, encoding="utf-8")
    # data comes from the published site
    site = WWW / "js" / "site.js"
    js = site.read_text(encoding="utf-8")
    for old, new in [("    window.LEAGUE_DB_URL = ROOT + 'data/league.db';",
                      f"    const DATA_BASE = '{DATA_BASE}';   // app: league data is read from the published site\n"
                      "    window.LEAGUE_DB_URL = DATA_BASE + 'data/league.db';"),
                     ("    const url = path => ROOT + path;",
                      "    const url = path => (path.startsWith('data/') ? DATA_BASE : ROOT) + path;")]:
        assert old in js, f"site.js changed: {old.strip()}"
        js = js.replace(old, new)
    site.write_text(js, encoding="utf-8")
    left = [str(p.relative_to(WWW)) for p in WWW.rglob("*.html") if "cdnjs.cloudflare.com" in p.read_text(encoding="utf-8")]
    if left:
        print("  still pointing at a CDN:", ", ".join(left[:5]))


if __name__ == "__main__":
    print(f"Copying {SITE.name} -> {WWW}")
    copy_site()
    print("Bundling libraries and fonts")
    vendor()
    localize()
    print("Done. Next: npx cap sync android")
