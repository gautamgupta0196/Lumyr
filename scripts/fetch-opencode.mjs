#!/usr/bin/env node
/**
 * Download the opencode CLI binary for each release target.
 *
 * npm installs opencode's platform binary only for the machine running
 * `npm ci`, but one runner builds several architectures (macos-14 builds both
 * Intel and Apple Silicon). Fetch every target's binary explicitly so each
 * installer ships the one it can actually run; electron-builder picks it up
 * from vendor/opencode/<platform>-<arch>/ via its ${arch} macro.
 *
 * Usage: node scripts/fetch-opencode.mjs darwin-arm64 darwin-x64
 *        node scripts/fetch-opencode.mjs win32-x64 win32-arm64
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Pin to the exact version the lockfile resolved, so dev and release match.
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'))
const version = lock.packages?.['node_modules/opencode-ai']?.version
if (!version) {
  console.error('opencode-ai is not in package-lock.json')
  process.exit(1)
}

// Node platform names -> opencode package names.
const PACKAGE_OS = { darwin: 'darwin', win32: 'windows', linux: 'linux' }

const targets = process.argv.slice(2)
if (targets.length === 0) {
  console.error('Usage: node scripts/fetch-opencode.mjs <platform-arch> [...]')
  process.exit(1)
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

for (const target of targets) {
  const [platform, arch] = target.split('-')
  const pkgOs = PACKAGE_OS[platform]
  if (!pkgOs || !['x64', 'arm64'].includes(arch)) {
    console.error(`Unsupported target: ${target}`)
    process.exit(1)
  }

  const pkg = `opencode-${pkgOs}-${arch}`
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-'))
  const tarball = execFileSync(npm, ['pack', `${pkg}@${version}`, '--silent', '--pack-destination', tmp], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  }).trim().split('\n').pop()

  execFileSync('tar', ['-xzf', path.join(tmp, tarball), '-C', tmp])

  const binName = platform === 'win32' ? 'opencode.exe' : 'opencode'
  const src = path.join(tmp, 'package', 'bin', binName)
  if (!fs.existsSync(src)) {
    console.error(`${pkg}@${version} has no bin/${binName}`)
    process.exit(1)
  }

  const destDir = path.join(root, 'vendor', 'opencode', target)
  fs.rmSync(destDir, { recursive: true, force: true })
  fs.mkdirSync(destDir, { recursive: true })
  const dest = path.join(destDir, binName)
  fs.copyFileSync(src, dest)
  fs.chmodSync(dest, 0o755)
  fs.rmSync(tmp, { recursive: true, force: true })

  const mb = (fs.statSync(dest).size / 1024 / 1024).toFixed(0)
  console.log(`${target}: ${pkg}@${version} -> vendor/opencode/${target}/${binName} (${mb} MB)`)
}
