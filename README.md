# Grass Touchers — Android app

The Shakuro Style site packaged as an Android app with [Capacitor](https://capacitorjs.com/), released as a
downloadable APK on the GitHub Releases page of [GetHorizontal63/gridiron_android](https://github.com/GetHorizontal63/gridiron_android/releases).

- **Code** (pages, scripts, styles, images) ships inside the APK, copied from `../Shakuro Style`.
- **Data** (league.db, player stats, team names) is read live from the published main site,
  `https://gethorizontal63.github.io/gridiron_web/data/...` ([GetHorizontal63/gridiron_web](https://github.com/GetHorizontal63/gridiron_web)). When the main site is rebuilt and pushed,
  the app shows the new data with no new release. A new release is only needed for code or design changes.

## Folder

| Path | What it is |
|---|---|
| `tools/build_web.py` | Copies the site's code into `www/` (no `data/`), bundles sql.js, ECharts and the fonts into `www/vendor/` so nothing loads from a CDN, and points data requests at the main site. `../Shakuro Style` is never changed. |
| `tools/release.ps1` | Builds a signed release APK and publishes it as a GitHub release. |
| `capacitor.config.json` | App id `com.grasstouchers.ffl`, name "Grass Touchers". |
| `android/` | The native Android project (Android Studio). Icons, splash screen and permissions live here. |
| `www/`, `vendor-cache/`, `node_modules/`, `dist/` | Generated; not committed. |
| `keystore.properties`, `grasstouchers-release.jks` | Release signing key. **Not committed. Back both up.** |

## Release

The usual way is the league's one-click update, which also pushes this source to GitHub:

```powershell
python ../update_and_push.py --release          # data + site + app source, then the next app version (1.0.0, 1.0.1, ...)
python ../update_and_push.py --release 2.0.0    # a specific version
```

To build an APK by hand instead:

Run from a drive letter, not a network (UNC) path: Gradle's Windows scripts can't run from one. Needs Node,
Python, Android Studio (for the SDK and its bundled JDK 21) and the GitHub CLI (`gh auth login` once).

```powershell
npm install                                   # first time only
.\tools\release.ps1 -Version 1.0.1            # build + publish  -> GitHub release v1.0.1 with GrassTouchers-1.0.1.apk
.\tools\release.ps1 -Version 1.0.1 -NoPublish # build only        -> dist\GrassTouchers-1.0.1.apk
```

Each release needs a higher version than the last (it becomes the Android versionCode: 1.2.3 -> 10203).

## Installing

On the phone, open the release page, download the `.apk`, open it, and allow installs from the browser when
Android asks. Updates install over the old version as long as they're signed with the same key.

## Signing

`keystore.properties` names `grasstouchers-release.jks` and its passwords. Every update must be signed with this
same key, or phones refuse to install it over the existing app. Keep a copy of both files somewhere other than
this folder (a password manager or private storage), and never commit them.

## Data source

The app reads `data/league.db`, `data/team_names.json` and `data/player_stats/*` from gridiron_web, which
`update_and_push.py` publishes (the database is the public-safe copy from `NEW/python/build_public_site.py`).
This code builds from `../Shakuro Style` on the league PC, so building needs that folder alongside it.
