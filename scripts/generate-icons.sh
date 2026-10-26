#!/bin/bash
set -e

# Lumyr Icon Generator
# Generates platform-specific icons from source SVGs.
# Outputs:
#   - resources/icon.icns, resources/icon.ico, resources/icon.png
#   - resources/lmr-icon.icns, resources/lmr-icon.ico
#   - public/favicon.ico

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
RESOURCES_DIR="$PROJECT_ROOT/resources"
PUBLIC_DIR="$PROJECT_ROOT/public"

APP_SVG="$RESOURCES_DIR/icon.svg"
LMR_SVG="$RESOURCES_DIR/lmr-icon.svg"
APP_BUILDER="$(node -e "process.stdout.write(require('app-builder-bin').appBuilderPath)")"

echo "Lumyr Icon Generator"
echo "===================="

# Check for required tools
if ! command -v magick &> /dev/null; then
    echo "Error: ImageMagick not found. Install with: brew install imagemagick"
    exit 1
fi

if [ ! -f "$APP_SVG" ]; then
    echo "Error: $APP_SVG not found"
    exit 1
fi
if [ ! -f "$LMR_SVG" ]; then
    echo "Error: $LMR_SVG not found"
    exit 1
fi

echo "Sources:"
echo "  - $APP_SVG"
echo "  - $LMR_SVG"
echo ""

generate_icon_family() {
  local svg_file="$1"
  local prefix="$2"           # e.g. "icon" or "lmr-icon"
  local icns_out="$3"         # e.g. resources/icon.icns
  local ico_out="$4"          # e.g. resources/icon.ico
  local icon_png_out="$5"     # e.g. resources/icon.png (optional; pass empty to skip)
  local tmp_dir
  tmp_dir="$(mktemp -d)"

  echo "Generating ${prefix} PNGs..."
  # Force 8-bit truecolor+alpha output for downstream tooling.
  magick -background none "$svg_file" -resize 1024x1024 -alpha on -colorspace sRGB -depth 8 -strip "PNG32:$tmp_dir/${prefix}.png"
  echo "  Created ${prefix}.png (1024x1024)"

  echo "Generating macOS .icns for ${prefix}..."
  "$APP_BUILDER" icon --input "$tmp_dir/${prefix}.png" --format icns --out "$tmp_dir" >/dev/null
  # app-builder always outputs icon.icns / icon.ico regardless of input basename.
  cp "$tmp_dir/icon.icns" "$icns_out"
  echo "  Created $(basename "$icns_out")"

  # Generate .ico file for Windows (multi-size)
  echo "Generating Windows .ico for ${prefix}..."
  for size in 16 32 48 64 128 256; do
      magick "$tmp_dir/${prefix}.png" -resize ${size}x${size} -alpha on -colorspace sRGB -depth 8 -strip "PNG32:$RESOURCES_DIR/${prefix}_${size}.png"
  done

  magick \
    "$RESOURCES_DIR/${prefix}_16.png" \
    "$RESOURCES_DIR/${prefix}_32.png" \
    "$RESOURCES_DIR/${prefix}_48.png" \
    "$RESOURCES_DIR/${prefix}_64.png" \
    "$RESOURCES_DIR/${prefix}_128.png" \
    "$RESOURCES_DIR/${prefix}_256.png" \
    "$ico_out"
  echo "  Created $(basename "$ico_out")"

  if [ -n "$icon_png_out" ]; then
    cp "$tmp_dir/${prefix}.png" "$icon_png_out"
    echo "  Created $(basename "$icon_png_out") (1024x1024)"
  fi

  echo "Cleaning up temporary ${prefix} files..."
  rm -rf "$tmp_dir"
  rm -f "$RESOURCES_DIR"/${prefix}_{16,32,48,64,128,256}.png
}

echo "Generating app icons..."
generate_icon_family "$APP_SVG" "icon" "$RESOURCES_DIR/icon.icns" "$RESOURCES_DIR/icon.ico" "$RESOURCES_DIR/icon.png"

# Generate favicon.ico for browsers
echo ""
echo "Generating browser favicon..."
magick -background none "$APP_SVG" -resize 16x16 -alpha on -colorspace sRGB -depth 8 -strip PNG32:/tmp/lumyr_favicon_16.png
magick -background none "$APP_SVG" -resize 32x32 -alpha on -colorspace sRGB -depth 8 -strip PNG32:/tmp/lumyr_favicon_32.png
magick -background none "$APP_SVG" -resize 48x48 -alpha on -colorspace sRGB -depth 8 -strip PNG32:/tmp/lumyr_favicon_48.png
magick /tmp/lumyr_favicon_16.png /tmp/lumyr_favicon_32.png /tmp/lumyr_favicon_48.png "$PUBLIC_DIR/favicon.ico"
rm -f /tmp/lumyr_favicon_16.png /tmp/lumyr_favicon_32.png /tmp/lumyr_favicon_48.png
echo "  Created public/favicon.ico"

echo ""
echo "Generating .lmr file association icons..."
generate_icon_family "$LMR_SVG" "lmr-icon" "$RESOURCES_DIR/lmr-icon.icns" "$RESOURCES_DIR/lmr-icon.ico" ""

echo ""
echo "Done! Generated icons:"
echo "  - resources/icon.icns (macOS)"
echo "  - resources/icon.ico (Windows)"
echo "  - resources/icon.png (Linux/general)"
echo "  - resources/lmr-icon.icns (macOS file association)"
echo "  - resources/lmr-icon.ico (Windows file association)"
echo "  - public/favicon.ico (browser)"
