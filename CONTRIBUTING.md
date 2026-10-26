# Contributing to Lumyr

Thanks for helping out. Lumyr is a local-first desktop app, so most changes can
be tested end-to-end on your own machine without any infrastructure.

## Getting set up

```bash
git clone https://github.com/gautamgupta0196/Lumyr
cd Lumyr && npm install

npm run prepare:python   # self-contained Python for running dashboards

npm run dev
```

You need your own Anthropic API key to exercise anything that generates a
dashboard. Add it in Settings; never commit it.

## Before opening a pull request

```bash
npm run typecheck
npm run lint
npm run test:unit
```

All three should pass. If a change touches dashboard generation, run the app and
generate one against a real connection — the unit tests do not cover the agent
loop end to end.

## Project layout

- `src/` — React renderer (Zustand store, shadcn/ui components)
- `electron/` — main process: data-source clients, Python/Streamlit manager,
  IPC handlers, encrypted storage
- `electron/opencode/` — the opencode engine and its MCP data bridge
- `python/` — the Streamlit runner that executes generated dashboards
- `docs/` — the GitHub Pages landing page
- `shared/`, `tests/` — dashboard spec schema and unit tests

Deeper architecture notes are in [CLAUDE.md](CLAUDE.md).

## Things worth knowing

**Don't clone into an iCloud-synced folder on macOS** (`~/Documents`,
`~/Desktop`). With "Optimize Mac Storage" on, iCloud evicts files from
`node_modules` and the bundled Python, and every read then blocks on a download:
installs hang, `tsc` crawls, and dashboards time out on startup. Use something
like `~/code`.


**IPC types are declared twice.** `electron/preload.ts` (the `ElectronAPI`
interface) and `src/types/electron.d.ts` must be kept in sync. Changing one
without the other type-checks locally but breaks the renderer at runtime.

**Rollup externals.** Any Node-only or native module used from the main process
must be listed in `vite.config.ts` under `rollupOptions.external`, or the
Electron build will try to bundle it and fail.

**No network calls to a Lumyr service.** There isn't one, and adding one would
defeat the project's purpose. Features should work offline except for calls to
the model provider under the user's own key.

**Keep credentials out of the renderer.** Database credentials and API keys live
in the main process behind `safeStorage`. The renderer asks the main process to
do things; it never holds a secret.

## Releasing

Pushing a `v*` tag runs `.github/workflows/release.yml`, which builds signed
macOS (Intel and Apple Silicon) and Windows installers and publishes a GitHub
Release. The version comes from `package.json`.

The opencode binary is architecture-specific and too large to commit.
`scripts/fetch-opencode.mjs` downloads the right one for each target into
`vendor/opencode/`, and `electron-builder.yml` ships it via `extraResources`.
To package locally:

```bash
node scripts/fetch-opencode.mjs darwin-arm64     # or darwin-x64, win32-x64, win32-arm64
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64 --dir
```

macOS signing needs repository secrets `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
`APPLE_TEAM_ID`, `APPLE_CERTIFICATE_BASE64` and `APPLE_CERTIFICATE_PASSWORD`.

## Reporting bugs

Open an issue with your OS, app version, the data source type, and what you
asked for. If generation failed, the agent's error text is far more useful than
a screenshot of the failure.

Please don't paste real schema names, query results, or API keys into issues.

## License

Contributions are accepted under the MIT license (see [LICENSE](LICENSE)).
