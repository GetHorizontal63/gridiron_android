<#
Build a signed release APK and publish it as a GitHub release.

    .\tools\release.ps1 -Version 1.0.0                  # build + publish
    .\tools\release.ps1 -Version 1.0.0 -NoPublish       # build only (APK lands in dist\)

Run from a drive letter, not a network (UNC) path: Gradle's Windows scripts can't run from one.
Needs: keystore.properties + the keystore it names (see README; never committed), and the GitHub CLI (gh) logged in
for publishing. The app reads league data from the published site, so a release is only needed for code changes.
#>
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,
    [string]$Repo = 'GetHorizontal63/gridiron_android',
    [switch]$NoPublish
)
$ErrorActionPreference = 'Stop'
$App = Split-Path -Parent $PSScriptRoot
Set-Location $App
if (-not (Test-Path 'keystore.properties')) { throw 'keystore.properties is missing (see README: Signing).' }

# versionCode must always increase: 1.2.3 -> 10203
$parts = $Version.Split('.') | ForEach-Object { [int]$_ }
$code = $parts[0] * 10000 + $parts[1] * 100 + $parts[2]

Write-Host "Building Grass Touchers $Version (code $code)"
python tools/build_web.py
if ($LASTEXITCODE) { throw 'build_web.py failed' }
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = Join-Path $env:ProgramFiles 'nodejs\node.exe' }   # Node's default install folder
& $node node_modules\@capacitor\cli\bin\capacitor sync android   # node directly: npx can't always find it
if ($LASTEXITCODE) { throw 'cap sync failed' }

if (-not $env:JAVA_HOME) { $env:JAVA_HOME = Join-Path $env:ProgramFiles 'Android\Android Studio\jbr' }   # Android Studio's bundled JDK 21
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk" }   # Android Studio's default SDK location
Push-Location android
try {
    .\gradlew.bat assembleRelease "-PappVersionName=$Version" "-PappVersionCode=$code" --no-daemon
    if ($LASTEXITCODE) { throw 'Gradle build failed' }
} finally { Pop-Location }

New-Item -ItemType Directory -Force dist | Out-Null
$apk = "dist\GrassTouchers-$Version.apk"
Copy-Item 'android\app\build\outputs\apk\release\app-release.apk' $apk -Force
Write-Host "APK: $apk ($([math]::Round((Get-Item $apk).Length / 1MB, 1)) MB)"

if ($NoPublish) { return }
gh release create "v$Version" $apk --repo $Repo --title "Grass Touchers $Version" `
    --notes "Download GrassTouchers-$Version.apk on your Android phone and open it to install (allow installs from your browser if asked). League data loads live from the site."
if ($LASTEXITCODE) { throw 'gh release create failed' }
Write-Host "Published: https://github.com/$Repo/releases/tag/v$Version"
