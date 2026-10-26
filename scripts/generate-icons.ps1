$ErrorActionPreference = "Stop"

# Lumyr Icon Generator (Windows)
# Requires ImageMagick ("magick") in PATH.
# Generates:
#   - resources/icon.ico, resources/icon.png
#   - resources/lmr-icon.ico
#   - public/favicon.ico

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ResourcesDir = Join-Path $ProjectRoot "resources"
$PublicDir = Join-Path $ProjectRoot "public"

$AppSvg = Join-Path $ResourcesDir "icon.svg"
$LmrSvg = Join-Path $ResourcesDir "lmr-icon.svg"

Write-Host "Lumyr Icon Generator (Windows)"
Write-Host "============================="

if (-not (Get-Command magick -ErrorAction SilentlyContinue)) {
  throw "ImageMagick not found. Install ImageMagick and ensure 'magick' is in PATH."
}

if (-not (Test-Path $AppSvg)) { throw "Missing $AppSvg" }
if (-not (Test-Path $LmrSvg)) { throw "Missing $LmrSvg" }

function New-IconFamily {
  param(
    [Parameter(Mandatory=$true)][string]$Svg,
    [Parameter(Mandatory=$true)][string]$Prefix,
    [Parameter(Mandatory=$true)][string]$IcoOut,
    [string]$PngOut
  )

  $sizes = @(16, 32, 48, 64, 128, 256, 512, 1024)
  foreach ($size in $sizes) {
    $pngPath = Join-Path $ResourcesDir ("{0}_{1}.png" -f $Prefix, $size)
    & magick -background none $Svg -resize ("{0}x{0}" -f $size) -depth 8 $pngPath | Out-Null
    Write-Host ("  Created {0}" -f (Split-Path $pngPath -Leaf))
  }

  Write-Host ("Generating {0}.ico..." -f $Prefix)
  & magick `
    (Join-Path $ResourcesDir ("{0}_16.png" -f $Prefix)) `
    (Join-Path $ResourcesDir ("{0}_32.png" -f $Prefix)) `
    (Join-Path $ResourcesDir ("{0}_48.png" -f $Prefix)) `
    (Join-Path $ResourcesDir ("{0}_64.png" -f $Prefix)) `
    (Join-Path $ResourcesDir ("{0}_128.png" -f $Prefix)) `
    (Join-Path $ResourcesDir ("{0}_256.png" -f $Prefix)) `
    $IcoOut | Out-Null

  if ($PngOut -and $PngOut.Length -gt 0) {
    Copy-Item (Join-Path $ResourcesDir ("{0}_1024.png" -f $Prefix)) $PngOut -Force
    Write-Host ("  Created {0}" -f (Split-Path $PngOut -Leaf))
  }

  foreach ($size in $sizes) {
    Remove-Item (Join-Path $ResourcesDir ("{0}_{1}.png" -f $Prefix, $size)) -Force
  }
}

Write-Host ""
Write-Host "Generating app icons..."
New-IconFamily -Svg $AppSvg -Prefix "icon" -IcoOut (Join-Path $ResourcesDir "icon.ico") -PngOut (Join-Path $ResourcesDir "icon.png")

Write-Host ""
Write-Host "Generating favicon..."
$tmp16 = Join-Path $env:TEMP "lumyr_favicon_16.png"
$tmp32 = Join-Path $env:TEMP "lumyr_favicon_32.png"
$tmp48 = Join-Path $env:TEMP "lumyr_favicon_48.png"
& magick -background none $AppSvg -resize 16x16 -depth 8 $tmp16 | Out-Null
& magick -background none $AppSvg -resize 32x32 -depth 8 $tmp32 | Out-Null
& magick -background none $AppSvg -resize 48x48 -depth 8 $tmp48 | Out-Null
& magick $tmp16 $tmp32 $tmp48 (Join-Path $PublicDir "favicon.ico") | Out-Null
Remove-Item $tmp16, $tmp32, $tmp48 -Force

Write-Host ""
Write-Host "Generating .lmr file association icon..."
New-IconFamily -Svg $LmrSvg -Prefix "lmr-icon" -IcoOut (Join-Path $ResourcesDir "lmr-icon.ico")

Write-Host ""
Write-Host "Done."

