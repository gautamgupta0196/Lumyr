#!/bin/bash
set -e

# ------------------------------------------------------------------
# Lumyr Release Script
#
# Builds, signs, notarizes, and publishes the app for:
#   - macOS (x64 + arm64) - signed and notarized
#   - Windows (x64 + arm64) - unsigned
#
# Outputs to /tmp to avoid iCloud/file-provider xattr issues.
#
# Prerequisites:
#   - Developer ID Application certificate in Keychain
#   - Wine installed (brew install --cask wine-stable) for Windows builds
#   - gh CLI authenticated for GitHub releases
#
# Usage:
#   ./scripts/release.sh <apple-id> <app-specific-password> [team-id]
#   ./scripts/release.sh you@example.com xxxx-xxxx-xxxx-xxxx ABCDE12345
#
# Environment variables (alternative to arguments):
#   APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
# ------------------------------------------------------------------

VERSION=$(node -p "require('./package.json').version")
OUTPUT_DIR="/tmp/lumyr-release"

# Resolve Apple credentials from args or env
export APPLE_ID="${1:-${APPLE_ID}}"
export APPLE_APP_SPECIFIC_PASSWORD="${2:-${APPLE_APP_SPECIFIC_PASSWORD}}"
export APPLE_TEAM_ID="${3:-${APPLE_TEAM_ID}}"

if [ -z "$APPLE_ID" ] || [ -z "$APPLE_APP_SPECIFIC_PASSWORD" ] || [ -z "$APPLE_TEAM_ID" ]; then
  echo "Error: Apple credentials required."
  echo "Usage: ./scripts/release.sh <apple-id> <app-specific-password> [team-id]"
  echo "  Or set APPLE_ID & APPLE_APP_SPECIFIC_PASSWORD env vars."
  exit 1
fi

echo "============================================"
echo "  Lumyr v${VERSION} Release Build"
echo "============================================"
echo ""

# ------------------------------------------------------------------
# Step 1: Clean previous build
# ------------------------------------------------------------------
echo "=== Step 1: Cleaning previous builds ==="
rm -rf "$OUTPUT_DIR" 2>/dev/null || true
mkdir -p "$OUTPUT_DIR"
echo "  Output directory: $OUTPUT_DIR"
echo ""

# ------------------------------------------------------------------
# Step 2: Build frontend
# ------------------------------------------------------------------
echo "=== Step 2: Building frontend ==="
npx tsc && npx vite build
echo ""

# ------------------------------------------------------------------
# Step 3: Build macOS (signed + notarized)
# ------------------------------------------------------------------
echo "=== Step 3: Building macOS (x64 + arm64, signed + notarized) ==="
npx electron-builder \
  --mac \
  --config.directories.output="$OUTPUT_DIR" \
  --publish never

echo ""
echo "  macOS build complete."
echo ""

# ------------------------------------------------------------------
# Step 4: Build Windows
# ------------------------------------------------------------------
echo "=== Step 4: Building Windows (x64 + arm64) ==="

# Add Wine to PATH if available
if [ -d "/Applications/Wine Stable.app/Contents/Resources/wine/bin" ]; then
  export PATH="/Applications/Wine Stable.app/Contents/Resources/wine/bin:$PATH"
fi

npx electron-builder \
  --win --x64 --arm64 \
  --config.directories.output="$OUTPUT_DIR" \
  --publish never

echo ""
echo "  Windows build complete."
echo ""

# ------------------------------------------------------------------
# Step 5: Verify macOS signatures
# ------------------------------------------------------------------
echo "=== Step 5: Verifying macOS code signatures ==="
for app in "$OUTPUT_DIR"/mac*/Lumyr.app; do
  if [ -d "$app" ]; then
    arch=$(basename "$(dirname "$app")")
    codesign --verify --deep --strict "$app" && echo "  $arch: signature VALID" || echo "  $arch: signature INVALID"
    codesign -dvv "$app" 2>&1 | grep "Authority=" | head -1 | sed 's/^/  /'
  fi
done
echo ""

# ------------------------------------------------------------------
# Step 6: List artifacts
# ------------------------------------------------------------------
echo "============================================"
echo "  Release artifacts:"
echo "============================================"
ls -lh "$OUTPUT_DIR"/*.dmg "$OUTPUT_DIR"/*.zip "$OUTPUT_DIR"/*.exe "$OUTPUT_DIR"/latest*.yml 2>/dev/null || true
echo ""

# ------------------------------------------------------------------
# Step 7: Publish to GitHub
# ------------------------------------------------------------------
if command -v gh &>/dev/null; then
  echo "=== Step 7: Publishing to GitHub ==="

  # Collect all release assets
  ASSETS=()
  for f in "$OUTPUT_DIR"/*.dmg "$OUTPUT_DIR"/*.zip "$OUTPUT_DIR"/*.exe "$OUTPUT_DIR"/latest-mac.yml "$OUTPUT_DIR"/latest.yml; do
    [ -f "$f" ] && ASSETS+=("$f")
  done

  if [ ${#ASSETS[@]} -eq 0 ]; then
    echo "  No assets found to upload."
    exit 1
  fi

  gh release create "v${VERSION}" \
    "${ASSETS[@]}" \
    --title "Lumyr v${VERSION}" \
    --notes "## Downloads

### macOS (signed & notarized)
- **Apple Silicon (M1/M2/M3/M4):** Lumyr-${VERSION}-arm64.dmg
- **Intel Mac:** Lumyr-${VERSION}.dmg

### Windows
- **Windows Installer (x64 + ARM64):** Lumyr Setup ${VERSION}.exe"

  echo ""
  echo "  Published: https://github.com/gautamgupta0196/Lumyr/releases/tag/v${VERSION}"
else
  echo "gh CLI not found. Install it to auto-publish, or upload manually."
fi

echo ""
echo "============================================"
echo "  Lumyr v${VERSION} release complete!"
echo "============================================"
