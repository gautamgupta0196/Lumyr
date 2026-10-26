#!/bin/bash

# Script to prepare bundled Python environment for distribution
# This creates a self-contained Python with all dependencies
# Usage: ./prepare-python.sh [arm64|x64|all]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
RESOURCES_DIR="$PROJECT_ROOT/resources"
PYTHON_VERSION="3.11.9"

# Get target architecture from argument, default to current machine
TARGET_ARCH="${1:-$(uname -m)}"

prepare_python() {
    local ARCH_NAME="$1"
    local PYTHON_URL="$2"
    local PYTHON_DIR="$3"
    local PYTHON_BIN="$PYTHON_DIR/bin/python3"

    echo ""
    echo "=== Preparing Python for $ARCH_NAME ==="
    echo "Target directory: $PYTHON_DIR"

    # Create resources directory
    mkdir -p "$RESOURCES_DIR"

    # Download Python if not already present
    if [ ! -f "$PYTHON_BIN" ]; then
        echo "Downloading standalone Python for $ARCH_NAME..."
        TEMP_FILE=$(mktemp)
        curl -L "$PYTHON_URL" -o "$TEMP_FILE"

        echo "Extracting Python..."
        mkdir -p "$PYTHON_DIR"
        tar -xzf "$TEMP_FILE" -C "$PYTHON_DIR" --strip-components=1
        rm "$TEMP_FILE"

        echo "Python extracted to: $PYTHON_DIR"
    else
        echo "Python already exists at: $PYTHON_DIR"
    fi

    # Upgrade pip
    echo "Upgrading pip..."
    "$PYTHON_BIN" -m pip install --upgrade pip --quiet 2>/dev/null || true

    # Install dependencies
    echo "Installing Python dependencies..."
    "$PYTHON_BIN" -m pip install -r "$PROJECT_ROOT/python/requirements.txt" --quiet

    # Verify installation
    echo "Verifying installation..."
    "$PYTHON_BIN" -c "import streamlit; import pandas; import plotly; import google.cloud.bigquery; import pandas_gbq; import openpyxl; import pdfplumber; print('All dependencies installed successfully!')"

    # Calculate size
    echo "Bundled Python size:"
    du -sh "$PYTHON_DIR"
}

# Detect platform
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "This script is for macOS only. Use prepare-python.ps1 for Windows."
    exit 1
fi

echo "=== Lumyr Python Bundler ==="
echo "Python version: $PYTHON_VERSION"

# URLs for standalone Python builds
ARM64_URL="https://github.com/indygreg/python-build-standalone/releases/download/20240415/cpython-${PYTHON_VERSION}+20240415-aarch64-apple-darwin-install_only.tar.gz"
X64_URL="https://github.com/indygreg/python-build-standalone/releases/download/20240415/cpython-${PYTHON_VERSION}+20240415-x86_64-apple-darwin-install_only.tar.gz"

case "$TARGET_ARCH" in
    "arm64"|"aarch64")
        prepare_python "arm64" "$ARM64_URL" "$RESOURCES_DIR/python-mac-arm64"
        ;;
    "x64"|"x86_64")
        prepare_python "x64" "$X64_URL" "$RESOURCES_DIR/python-mac-x64"
        ;;
    "all")
        prepare_python "arm64" "$ARM64_URL" "$RESOURCES_DIR/python-mac-arm64"
        prepare_python "x64" "$X64_URL" "$RESOURCES_DIR/python-mac-x64"
        ;;
    *)
        echo "Unknown architecture: $TARGET_ARCH"
        echo "Usage: $0 [arm64|x64|all]"
        exit 1
        ;;
esac

echo ""
echo "=== Done! ==="
