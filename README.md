# Lumyr

**Ask for a dashboard. Keep your data.**

Lumyr is an open-source desktop app that turns a sentence into a working
Streamlit dashboard. It connects straight to your warehouse, runs every query
on your machine, and calls Claude with **your own Anthropic API key**.

There is no account, no backend, and no Lumyr server. Nothing routes through us,
because there is no "us" in the request path.

[Landing page](https://gautamgupta0196.github.io/Lumyr/) ·
[Releases](https://github.com/gautamgupta0196/Lumyr/releases) ·
[Contributing](CONTRIBUTING.md) · MIT licensed

---

## What leaves your machine

Being precise about this, because it's the whole point:

| Stays local | Sent to Anthropic under your key |
| --- | --- |
| Database credentials (OS keychain) | Your prompt |
| Your API key (encrypted via safeStorage) | Table and column names |
| Query execution and results | Rows the agent samples to verify its work |
| The generated dashboard | |

No telemetry endpoint, no sign-in, no usage metering. Crash reporting exists but
is off unless you build with a `SENTRY_DSN`.

The agent is instructed to issue read-only queries. **Give it a read-only
database role anyway** — an enforced permission is worth more than an
instruction.

## Install

Download a build from [Releases](https://github.com/gautamgupta0196/Lumyr/releases),
or run from source:

```bash
git clone https://github.com/gautamgupta0196/Lumyr
cd Lumyr && npm install

npm run prepare:python             # downloads a self-contained Python + dashboard deps

npm run dev
```

Requirements: Node 20+ and an Anthropic API key from
[console.anthropic.com](https://console.anthropic.com/settings/keys).

On first launch, open **Settings** and paste your API key. It is encrypted with
your OS key store and never written into the repo.

## Data sources

BigQuery · PostgreSQL · Snowflake · Redshift · NetSuite · ODBC · CSV/Excel

## How dashboards get built

Generation is handled by the open-source [opencode](https://opencode.ai) agent,
embedded and run locally. Lumyr gives it a local MCP bridge
(`electron/opencode/`) so it can list your tables, read schemas, and run
read-only queries while it writes the dashboard — then hands you the resulting
`app.py`.

## Development

```bash
npm run dev          # Vite dev server + Electron
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint over src/ and electron/
npm run test:unit    # Vitest
npm run build        # production build via electron-builder
```

Architecture notes for contributors live in [CLAUDE.md](CLAUDE.md).

## License

MIT — see [LICENSE](LICENSE).
