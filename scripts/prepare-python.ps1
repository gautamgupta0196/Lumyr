# PowerShell script to prepare bundled Python environment for Windows distribution

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$ResourcesDir = Join-Path $ProjectRoot "resources"
$PythonVersion = "3.11.9"
$PythonUrl = "https://github.com/indygreg/python-build-standalone/releases/download/20240415/cpython-${PythonVersion}+20240415-x86_64-pc-windows-msvc-install_only.tar.gz"
$PythonDir = Join-Path $ResourcesDir "python-win"
$PythonBin = Join-Path $PythonDir "python.exe"

Write-Host "=== Lumyr Python Bundler ===" -ForegroundColor Cyan
Write-Host "Platform: Windows (x64)"
Write-Host "Python version: $PythonVersion"
Write-Host ""

# Create resources directory
if (!(Test-Path $ResourcesDir)) {
    New-Item -ItemType Directory -Path $ResourcesDir | Out-Null
}

# Download Python if not already present
if (!(Test-Path $PythonBin)) {
    Write-Host "Downloading standalone Python..."
    $TempFile = Join-Path $env:TEMP "python-standalone.tar.gz"
    Invoke-WebRequest -Uri $PythonUrl -OutFile $TempFile

    Write-Host "Extracting Python..."
    if (!(Test-Path $PythonDir)) {
        New-Item -ItemType Directory -Path $PythonDir | Out-Null
    }

    # Extract using tar (available in Windows 10+)
    tar -xzf $TempFile -C $PythonDir --strip-components=1
    Remove-Item $TempFile

    Write-Host "Python extracted to: $PythonDir"
} else {
    Write-Host "Python already exists at: $PythonDir"
}

# Upgrade pip
Write-Host ""
Write-Host "Upgrading pip..."
& $PythonBin -m pip install --upgrade pip --quiet

# Install dependencies
Write-Host ""
Write-Host "Installing Python dependencies..."
$RequirementsFile = Join-Path $ProjectRoot "python\requirements.txt"
& $PythonBin -m pip install -r $RequirementsFile --quiet

# Verify installation
Write-Host ""
Write-Host "Verifying installation..."
& $PythonBin -c "import streamlit; import pandas; import plotly; import google.cloud.bigquery; import pandas_gbq; print('All dependencies installed successfully!')"

# Show installed packages
Write-Host ""
Write-Host "Installed packages:"
& $PythonBin -m pip list | Select-String -Pattern "(streamlit|pandas|plotly|google|numpy|scipy)"

Write-Host ""
Write-Host "=== Done! ===" -ForegroundColor Green
Write-Host "Bundled Python is ready at: $PythonDir"
