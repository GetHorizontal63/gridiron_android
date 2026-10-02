#!/usr/bin/env python3
"""Assemble www/ for the Android app.

The app has its own mobile-first interface (app/: one page, its own screens, bottom tab navigation). It shares
the website's data code with Shakuro Style and reads all league data (league.db, player stats, team names)
live from the published site, so data updates reach the app without a new release.

www/ is generated output: it is rebuilt from scratch on every run from
  * app/                                    the app's page, styles and screens
  * Shakuro Style/js  (DATA_MODULES only)   the shared data code (database, players, analytics)
  * Shakuro Style/assets (ASSETS only)      the logos the app shows
  * vendor-cache/                           sql.js, ECharts and the fonts, downloaded once, so nothing loads from a CDN
Shakuro Style itself is never changed.

  python tools/build_web.py          (then: npx cap sync android)
"""
import re
import shutil
import urllib.request
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
SITE = APP.parent / "Shakuro Style"
SOURCE = APP / "app"
WWW = APP / "www"
CACHE = APP / "vendor-cache"

DATA_MODULES = ["league-db.js", "data.js", "players.js", "analytics.js", "roster-metrics.js"]
ASSETS = ["logos/logo_2.png", "manager-logos", "nfl-logos", "icons/dci-logos"]
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
    css = fetch(FONTS, CACHE / "fonts.css").read_text(encoding="utf-8")
    (out / "fonts").mkdir(exist_ok=True)
    for i, url in enumerate(dict.fromkeys(re.findall(r"url\((https://[^)]+)\)", css))):
        name = f"font-{i}.woff2"
        shutil.copy2(fetch(url, CACHE / "fonts" / name), out / "fonts" / name)
        css = css.replace(url, f"fonts/{name}")
    (out / "fonts.css").write_text(css, encoding="utf-8")


def assemble():
    if WWW.exists():
        shutil.rmtree(WWW)                      # generated output only (never committed); rebuilt below
    shutil.copytree(SOURCE, WWW)
    for name in DATA_MODULES:
        shutil.copy2(SITE / "js" / name, WWW / "js" / name)
    for item in ASSETS:
        src, dst = SITE / "assets" / item, WWW / "assets" / item
        if src.is_dir():
            shutil.copytree(src, dst, dirs_exist_ok=True)
        else:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
    # sql.js's .wasm ships in www/vendor instead of coming from the CDN
    db = WWW / "js" / "league-db.js"
    js = db.read_text(encoding="utf-8")
    assert f"const SQL_WASM_URL = '{SQL_WASM}';" in js, "league-db.js changed: update build_web.py"
    db.write_text(js.replace(f"const SQL_WASM_URL = '{SQL_WASM}';", "const SQL_WASM_URL = 'vendor/sql-wasm.wasm';"), encoding="utf-8")


if __name__ == "__main__":
    print(f"Assembling {WWW.name}/ from app/ + shared data code")
    assemble()
    print("Bundling libraries and fonts")
    vendor()
    size = sum(f.stat().st_size for f in WWW.rglob("*") if f.is_file()) / 1048576
    print(f"Done ({size:.1f} MB). Next: npx cap sync android")
