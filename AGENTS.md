# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

Lumyr is an AI-powered dashboard generator. Users describe visualizations in natural language, and Codex generates interactive Streamlit dashboards. It's a desktop app built with Electron.

## Development Commands

```bash
npm run dev              # Start backend (port 3001) + Electron dev server (port 5173)
npm run dev:backend      # Backend only with hot reload
npm run dev:electron     # Vite dev server only
npm run build            # Full production build
npm run build:full       # Prepare Python + full build
npm run typecheck        # TypeScript validation
npm run lint             # ESLint for src/ and electron/
```

Python setup:
```bash
python3 -m venv .venv
source .venv/bin/activate  # macOS/Linux
pip install -r python/requirements.txt
```

## Architecture

```
┌─────────────────────────────────────────┐
│  Frontend (React + Electron)            │
│  - Zustand state management             │
│  - shadcn/ui components                 │
└────────────┬────────────────────────────┘
             │ IPC Bridge (preload.ts)
┌────────────▼────────────────────────────┐
│  Electron Main Process                  │
│  - dastabase client                     │
│  - Python/Streamlit process manager     │
│  - Encrypted storage (electron-store)   │
└────────────┬────────────────────────────┘
             │ HTTP
┌────────────▼────────────────────────────┐
│  Backend (Express on :3001)             │
│  - Codex API for code generation       │
│  - SSE streaming endpoint               │
└─────────────────────────────────────────┘
```

## Key Directories

- `src/` - React frontend with components, hooks, and Zustand store
- `electron/` - Electron main process: BigQuery client, Python manager, IPC handlers
- `backend/` - Express server with Codex API integration
- `python/` - Streamlit runner that executes generated dashboard code

## Data Flow

1. User types natural language query in QueryPanel
2. Frontend sends to `/api/generate` with query, databse schema, and conversation history
3. Backend calls Codex API to generate Streamlit code
4. Frontend receives code and calls `window.electron.streamlit.runCode()`
5. Electron spawns Streamlit process via PythonManager
6. DashboardViewer displays dashboard in iframe

## IPC Channels

All Electron IPC uses the preload bridge pattern. Main channels:
- `bigquery:*` - BigQuery operations (connect, query, schema)
- `streamlit:*` - Python/Streamlit process control
- `dashboard:*` - CRUD for saved dashboards
- `connections:*` - Manage multiple BigQuery connections

## State Management

- **Zustand store** (`src/stores/app-store.ts`): UI state, schema cache, generation state, conversation history
- **Electron store** (`electron/store.ts`): Persistent encrypted storage for credentials, connections, dashboard metadata

## Environment Variables

Required in `.env`:
- `ANTHROPIC_API_KEY` - Codex API key
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - For OAuth (optional if using Service Account)
