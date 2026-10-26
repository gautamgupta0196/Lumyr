#!/usr/bin/env npx tsx
/**
 * Pre-build validation script
 * Run this before packaging to catch common issues early
 * Usage: npm run validate:packaging
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

interface Check {
  name: string
  passed: boolean
  message: string
}

const checks: Check[] = []

function check(name: string, passed: boolean, message: string) {
  checks.push({ name, passed, message })
  const icon = passed ? '✓' : '✗'
  console.log(`${icon} ${name}`)
  if (!passed) {
    console.log(`  └─ ${message}`)
  }
}

console.log('\n=== Lumyr Packaging Validation ===\n')

// 1. Check Python dependencies in bundled environments
console.log('Checking bundled Python environments...\n')

const currentPlatform = process.platform
const currentArch = process.arch

// Only check platforms relevant to current build environment
const pythonDirs: Array<{ dir: string; platform: string; critical: boolean }> = [
  { dir: 'resources/python-mac-arm64', platform: 'darwin', critical: currentPlatform === 'darwin' && currentArch === 'arm64' },
  { dir: 'resources/python-mac-x64', platform: 'darwin', critical: currentPlatform === 'darwin' && currentArch === 'x64' },
  { dir: 'resources/python-win', platform: 'win32', critical: currentPlatform === 'win32' }
]

const requiredDeps = ['streamlit', 'pandas', 'openpyxl', 'pdfplumber', 'plotly']

for (const { dir, platform, critical } of pythonDirs) {
  if (!fs.existsSync(dir)) {
    if (critical) {
      console.log(`  ⚠ ${dir} (not found - needed for current platform)`)
    } else {
      console.log(`  Skipping ${dir} (not found, not current platform)`)
    }
    continue
  }

  const isWindows = platform === 'win32'
  const pythonBin = isWindows
    ? path.join(dir, 'python.exe')
    : path.join(dir, 'bin', 'python3')

  if (!fs.existsSync(pythonBin)) {
    if (critical) {
      check(`${dir}: Python binary`, false, `Not found at ${pythonBin}`)
    }
    continue
  }

  console.log(`  Checking ${dir}${critical ? ' (current platform)' : ''}...`)

  for (const dep of requiredDeps) {
    try {
      execSync(`"${pythonBin}" -c "import ${dep}"`, { stdio: 'pipe' })
      check(`  ${dep}`, true, 'installed')
    } catch {
      // Only fail for critical (current platform) dependencies
      if (critical) {
        check(`  ${dep}`, false, `MISSING - run: ./scripts/prepare-python.sh`)
      } else {
        console.log(`  ⚠ ${dep} (missing, but not current platform)`)
      }
    }
  }
  console.log('')
}

// 2. Check electron-builder.yml configuration
console.log('Checking electron-builder.yml...\n')

const builderConfig = fs.readFileSync('electron-builder.yml', 'utf-8')

const hasAsarUnpack = builderConfig.includes('asarUnpack') && builderConfig.includes('python/**/*')
check('asarUnpack includes python/**/*', hasAsarUnpack,
  'Add asarUnpack: ["python/**/*"] to electron-builder.yml')

const hasExtraResources = builderConfig.includes('extraResources')
check('extraResources configured', hasExtraResources,
  'extraResources needed for bundled Python')

// 3. Check main.ts path configuration
console.log('\nChecking electron/main.ts...\n')

const mainTs = fs.readFileSync('electron/main.ts', 'utf-8')

// Check for the double /resources bug
const hasDoubleResourcesBug = mainTs.includes("path.join(process.resourcesPath, 'resources')")
check('No double /resources bug', !hasDoubleResourcesBug,
  'resourcesPath should be process.resourcesPath directly, not path.join(process.resourcesPath, "resources")')

// Check for proper app.isPackaged usage
const usesIsPackaged = mainTs.includes('app.isPackaged')
check('Uses app.isPackaged for path detection', usesIsPackaged,
  'Should use app.isPackaged to differentiate dev vs packaged paths')

// 4. Check file-manager.ts configuration
console.log('\nChecking electron/file-manager.ts...\n')

const fileManager = fs.readFileSync('electron/file-manager.ts', 'utf-8')

const fileManagerUsesIsPackaged = fileManager.includes('app.isPackaged')
check('file-manager.ts uses app.isPackaged', fileManagerUsesIsPackaged,
  'Should use app.isPackaged for path detection')

const usesAsarUnpacked = fileManager.includes('app.asar.unpacked')
check('file-manager.ts uses app.asar.unpacked', usesAsarUnpacked,
  'Python scripts must be accessed from app.asar.unpacked')

// 5. Check requirements.txt has all dependencies
console.log('\nChecking python/requirements.txt...\n')

const requirements = fs.readFileSync('python/requirements.txt', 'utf-8')

const criticalDeps = ['openpyxl', 'pdfplumber', 'streamlit', 'pandas']
for (const dep of criticalDeps) {
  check(`requirements.txt includes ${dep}`, requirements.includes(dep),
    `Add ${dep} to python/requirements.txt`)
}

// Summary
console.log('\n' + '='.repeat(50))
const failed = checks.filter(c => !c.passed)
const passed = checks.filter(c => c.passed)

console.log(`\nResults: ${passed.length} passed, ${failed.length} failed\n`)

if (failed.length > 0) {
  console.error('❌ VALIDATION FAILED\n')
  console.error('Fix the following issues before packaging:\n')
  for (const f of failed) {
    console.error(`  • ${f.name}`)
    console.error(`    ${f.message}\n`)
  }
  process.exit(1)
} else {
  console.log('✅ All validation checks passed!\n')
  console.log('Safe to run: npm run build\n')
}
