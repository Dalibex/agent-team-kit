# Turns social.html (the whole team at work) into docs/images/social-preview.png, 1280×640, with headless Edge or Chrome.
# Run after draw.mjs, from anywhere: pwsh scripts/readme-images/png.ps1
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$page = (Join-Path $PSScriptRoot 'social.html') -replace '\\', '/'
$out = Join-Path $root 'docs\images\social-preview.png'
$browser = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { throw 'Neither Edge nor Chrome was found.' }
# --virtual-time-budget lets the drawing's animations run for a few seconds before the shot, past their entrances.
& $browser --headless=new --disable-gpu --hide-scrollbars --window-size=1280,640 --virtual-time-budget=4000 --screenshot="$out" "file:///$page" | Out-Null
Write-Output "wrote $out"
