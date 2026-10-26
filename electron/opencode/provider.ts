/**
 * opencode engine — generates dashboards with the open-source opencode agent.
 *
 * opencode is a full coding agent: it owns the loop, the filesystem tools, and
 * bash. It writes the Streamlit app into a real workspace directory and can
 * iterate on it, which suits "build me a dashboard" far better than single-shot
 * code generation.
 *
 * What Lumyr contributes is the part opencode cannot know: the user's database.
 * We stand up an MCP bridge (see mcp-bridge.ts) and hand it to the agent as a
 * remote MCP server, so it can list tables, read schemas, and run read-only
 * queries while it works.
 *
 * Everything runs locally. The user's API key is pushed into the opencode
 * server at runtime via `auth.set` and is never written to disk by us.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import net from 'net'
import { pathToFileURL } from 'url'
import { app } from 'electron'
import type { createOpencode as CreateOpencode, OpencodeClient, Config } from '@opencode-ai/sdk'
import { createLogger } from '../logger.js'
import { getAnthropicApiKey } from '../store.js'
import { startMcpBridge, type BridgeDeps, type RunningBridge } from './mcp-bridge.js'
import type { AgentStep, AgentStepType, AgentRequest } from '../agent-types.js'
import type { UploadedFile } from '../store.js'
import { dataAccessInstructions } from './data-access.js'

const logger = createLogger('opencode')

/** Entry file the agent is told to write; PythonManager runs this. */
export const DASHBOARD_ENTRY = 'app.py'

const DEFAULT_MODEL = { providerID: 'anthropic', modelID: 'claude-opus-5' }

export class MissingApiKeyError extends Error {
  constructor() {
    super('No Anthropic API key configured. Add one in Settings to generate dashboards.')
    this.name = 'MissingApiKeyError'
  }
}

export class OpencodeNotInstalledError extends Error {
  constructor() {
    super(
      'The opencode CLI was not found. Reinstall Lumyr, or install opencode with ' +
        '"npm i -g opencode-ai" and restart.'
    )
    this.name = 'OpencodeNotInstalledError'
  }
}

/** Extra MCP servers configured on the active connection. */
export interface ExtraMcpServer {
  name: string
  url: string
  apiKey?: string
}

export interface OpencodeRunOptions {
  workspaceDir: string
  prompt: string
  data: BridgeDeps
  model?: string
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[]
  mcpServers?: ExtraMcpServer[]
  customInstructions?: string
  /** Active source, so the dashboard is told how to connect at runtime. */
  sourceType?: AgentRequest['sourceType']
  connectionMeta?: AgentRequest['connectionMeta']
  /** Uploaded files attached to this request. */
  files?: UploadedFile[]
  /** The dashboard being refined, if this is a follow-up turn. */
  currentCode?: string
  /** Live progress, in the same shape the renderer already consumes. */
  onStep?: (step: AgentStep) => void
  signal?: AbortSignal
}

export interface OpencodeRunResult {
  success: boolean
  /** True when the agent answered in words and left the dashboard unchanged. */
  respondedDirectly?: boolean
  message?: string
  code?: string
  entryPath?: string
  summary?: string
  error?: string
  steps: AgentStep[]
}

/**
 * The SDK is ESM-only but the Electron main bundle is CommonJS, so a static
 * import would be emitted as require() and throw ERR_REQUIRE_ESM. Going through
 * `new Function` keeps the bundler from rewriting this into a require call.
 */
const importEsm = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<typeof import('@opencode-ai/sdk')>

/**
 * Absolute URL of the SDK's ESM entry. A bare '@opencode-ai/sdk' specifier
 * would resolve relative to whatever referrer V8 assigns code built with
 * `new Function`, which differs between dev and a packaged app (cwd is `/`
 * there). app.getAppPath() is the project root in dev and app.asar when
 * packaged, and Electron can import ESM from inside asar by absolute path.
 */
function opencodeSdkUrl(): string {
  try {
    const dir = path.join(app.getAppPath(), 'node_modules', '@opencode-ai', 'sdk')
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'))
    const entry = pkg.exports?.['.']?.import ?? pkg.module ?? pkg.main
    if (entry) return pathToFileURL(path.join(dir, entry)).href
  } catch {
    // Fall through to normal resolution.
  }
  return '@opencode-ai/sdk'
}

/**
 * Where to look for the `opencode` executable.
 *
 * Two problems to solve: we ship the binary via the opencode-ai dependency, so
 * the app's own node_modules has to be searched; and GUI apps on macOS inherit a
 * minimal PATH, so a user's own install is invisible even though it works in
 * their terminal. asar can't execute binaries, hence the .unpacked variants.
 */
function binarySearchPaths(): string[] {
  // Release builds ship the binary for their own arch here (see
  // scripts/fetch-opencode.mjs and extraResources in electron-builder.yml).
  const packaged = app.isPackaged ? [path.join(process.resourcesPath, 'opencode')] : []
  const roots = [app.getAppPath(), process.resourcesPath].filter(Boolean) as string[]
  const bundled: string[] = [...packaged]
  for (const root of roots) {
    for (const base of [root, root.replace(/\.asar$/, '.asar.unpacked')]) {
      bundled.push(
        path.join(base, 'node_modules', '.bin'),
        path.join(base, 'node_modules', 'opencode-ai', 'bin')
      )
    }
  }
  return [
    ...bundled,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    path.join(os.homedir(), '.local', 'bin'),
    path.join(os.homedir(), '.opencode', 'bin'),
    path.join(os.homedir(), '.bun', 'bin'),
  ]
}

function augmentedPath(): string {
  const current = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  const extra = binarySearchPaths().filter(p => !current.includes(p))
  return [...current, ...extra].join(path.delimiter)
}

/**
 * opencode treats `--port=0` as "use the default" and binds 4096, so concurrent
 * runs, or a developer's own opencode session, would collide. Ask the OS for a
 * free port instead.
 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo
      srv.close(() => resolve(port))
    })
  })
}

function opencodeInstalled(): boolean {
  const probe = process.platform === 'win32' ? 'where' : 'which'
  const result = spawnSync(probe, ['opencode'], { env: { ...process.env, PATH: augmentedPath() } })
  return result.status === 0
}

function buildSystemPrompt(options: OpencodeRunOptions): string {
  const { customInstructions } = options
  const base = [
    'You are building a Streamlit dashboard in the current working directory.',
    '',
    'Rules:',
    `- Write the complete dashboard to a single file named ${DASHBOARD_ENTRY}.`,
    '- Use the lumyr-data MCP tools to understand the data before writing code:',
    '  call list_tables, then get_table_schema for every table you reference.',
    '- Never invent table or column names. If a name is not in the schema, do not use it.',
    '- Use run_sql to confirm a query returns sensible rows before relying on it.',
    '- run_sql is the ONLY way to reach the database while you work. Your shell has',
    '  no database credentials: never connect to the database from bash or python',
    '  to test anything — it will hang or fail. Do not install packages.',
    `- Write ${DASHBOARD_ENTRY} directly once the queries are validated with run_sql.`,
    '- Never read st.secrets, .streamlit/secrets.toml, or gcloud credentials, and',
    '  never pass explicit credentials to a client. Use the connection pattern below.',
    '- Queries must be read-only. Never write, update, delete, or alter anything.',
    '- Prefer pandas with Streamlit native charts or plotly; keep dependencies to',
    '  streamlit, pandas, and plotly.',
    '- Call st.set_page_config at most once, as the first Streamlit call.',
    `- When ${DASHBOARD_ENTRY} is complete and consistent with the real schema,`,
    '  stop and summarize what you built in two sentences.',
  ]
  if (options.currentCode) {
    base.push(
      '',
      `${DASHBOARD_ENTRY} already exists and is the dashboard the user is looking at.`,
      'Edit it to satisfy the request; keep everything they did not ask to change.',
      'If they only asked a question, answer it and leave the file untouched.'
    )
  }
  base.push(dataAccessInstructions(options.sourceType, options.connectionMeta, options.files))
  if (customInstructions?.trim()) {
    base.push('', 'Additional instructions for this connection:', customInstructions.trim())
  }
  return base.join('\n')
}

/**
 * Build the opencode config. The SDK serializes this into
 * OPENCODE_CONFIG_CONTENT for the spawned server, so there is no config file to
 * write into the workspace.
 */
function buildConfig(mcpUrl: string, extra: ExtraMcpServer[] = []): Config {
  const mcp: NonNullable<Config['mcp']> = {
    // "remote", not "local": the bridge runs inside the Electron main process,
    // not as a stdio subprocess.
    'lumyr-data': { type: 'remote', url: mcpUrl, enabled: true },
  }

  for (const server of extra) {
    if (!server?.name || !server?.url) continue
    mcp[server.name] = {
      type: 'remote',
      url: server.url,
      enabled: true,
      ...(server.apiKey ? { headers: { Authorization: `Bearer ${server.apiKey}` } } : {}),
    }
  }

  return {
    mcp,
    // Lumyr promises the only outbound connection is to the model provider.
    // Keep opencode's own network features from quietly breaking that.
    share: 'disabled',
    autoupdate: false,
    enabled_providers: ['anthropic'],
  }
}

function resolveModel(model?: string): { providerID: string; modelID: string } {
  if (!model || model === 'auto') return DEFAULT_MODEL
  if (model.includes('/')) {
    const [providerID, ...rest] = model.split('/')
    return { providerID, modelID: rest.join('/') }
  }
  return { providerID: 'anthropic', modelID: model }
}

const BRIDGE_PREFIX = 'lumyr-data_'
const FILE_WRITE_TOOLS = new Set(['write', 'edit', 'patch', 'multiedit'])

/**
 * Translate opencode's tool names into the vocabulary the progress UI knows.
 * MCP tools arrive prefixed with their server name, and writing the dashboard
 * file is the step the UI treats as code generation.
 */
function canonicalToolName(tool: string, input: unknown): string {
  if (tool.startsWith(BRIDGE_PREFIX)) return tool.slice(BRIDGE_PREFIX.length)
  if (FILE_WRITE_TOOLS.has(tool)) {
    const file = (input as { filePath?: string; path?: string } | undefined)
    const target = file?.filePath ?? file?.path ?? ''
    if (path.basename(target) === DASHBOARD_ENTRY) return 'write_dashboard'
  }
  return tool
}

/** Bridge tools return JSON text; hand the renderer the parsed value. */
function parseToolOutput(tool: string, output: string): unknown {
  if (!tool.startsWith(BRIDGE_PREFIX)) return output
  try {
    return JSON.parse(output)
  } catch {
    return output
  }
}

let stepCounter = 0
function makeStep(type: AgentStepType, fields: Partial<AgentStep> = {}): AgentStep {
  return { id: `oc-${Date.now()}-${stepCounter++}`, type, timestamp: Date.now(), ...fields }
}

export async function runOpencodeDashboard(
  options: OpencodeRunOptions
): Promise<OpencodeRunResult> {
  const { workspaceDir, prompt, data, onStep, signal } = options
  const model = resolveModel(options.model)
  const steps: AgentStep[] = []

  const emit = (step: AgentStep) => {
    steps.push(step)
    onStep?.(step)
  }

  if (!getAnthropicApiKey()) {
    return { success: false, error: new MissingApiKeyError().message, steps }
  }
  if (!opencodeInstalled()) {
    return { success: false, error: new OpencodeNotInstalledError().message, steps }
  }

  fs.mkdirSync(workspaceDir, { recursive: true })
  const entryPath = path.join(workspaceDir, DASHBOARD_ENTRY)
  // Follow-up turns refine the existing dashboard instead of starting over.
  const seededCode = options.currentCode?.trim() ? options.currentCode : null
  if (seededCode) fs.writeFileSync(entryPath, seededCode, 'utf-8')
  // The SDK spawns `opencode` from PATH and inherits process.env.
  process.env.PATH = augmentedPath()

  let bridge: RunningBridge | null = null
  let server: { close: () => void } | null = null
  let client: OpencodeClient | null = null
  let sessionId: string | null = null

  // Every request is scoped to the workspace — createOpencodeServer does not
  // set the spawned process's cwd, so `directory` is what actually binds the
  // agent to this run's folder.
  const directory = workspaceDir

  try {
    emit(makeStep('thinking', { thinking: 'Connecting to your data…' }))

    bridge = await startMcpBridge(data)

    const { createOpencode } = (await importEsm(opencodeSdkUrl())) as {
      createOpencode: typeof CreateOpencode
    }

    const opencode = await createOpencode({
      hostname: '127.0.0.1',
      port: await freePort(),
      timeout: 30_000,
      config: buildConfig(bridge.url, options.mcpServers),
    })
    client = opencode.client
    server = opencode.server

    const apiKey = getAnthropicApiKey()
    if (!apiKey) throw new MissingApiKeyError()
    await client.auth.set({
      path: { id: model.providerID },
      body: { type: 'api', key: apiKey },
    })

    const created = await client.session.create({
      body: { title: 'Lumyr dashboard' },
      query: { directory },
    })
    sessionId = created.data?.id ?? null
    if (!sessionId) {
      throw new Error(
        created.error ? `opencode could not start a session: ${JSON.stringify(created.error)}`
                      : 'opencode did not return a session id'
      )
    }

    const parts: { type: 'text'; text: string }[] = []
    for (const turn of options.conversationHistory ?? []) {
      if (turn?.content?.trim()) {
        parts.push({ type: 'text', text: `[${turn.role}] ${turn.content}` })
      }
    }
    parts.push({ type: 'text', text: prompt })

    // Subscribe before prompting so no early events are missed.
    //
    // `directory` is load-bearing: the server scopes its event stream the same
    // way it scopes sessions. Omit it and you silently get the default scope's
    // stream — the agent runs and bills normally while this loop sees nothing
    // and never observes session.idle.
    const events = await client.event.subscribe({ query: { directory } })

    emit(makeStep('thinking', { thinking: 'Planning the dashboard…' }))

    // promptAsync returns as soon as the prompt is accepted; progress and
    // completion arrive on the event stream. The blocking `prompt` call holds one
    // HTTP request open for the whole run, and Node's fetch abandons a request
    // that sees no response headers for 300s, so long runs failed with
    // "fetch failed" even when they succeeded.
    const accepted = await client.session.promptAsync({
      path: { id: sessionId },
      query: { directory },
      body: { model, system: buildSystemPrompt(options), parts },
    })
    if (accepted.error) {
      throw new Error(`opencode rejected the prompt: ${JSON.stringify(accepted.error)}`)
    }

    const abort = () => {
      if (client && sessionId) {
        void client.session.abort({ path: { id: sessionId }, query: { directory } }).catch(() => {})
      }
    }
    signal?.addEventListener('abort', abort, { once: true })

    // message.part.updated resends the whole part each time, so track what has
    // already been surfaced and emit only the new text.
    const seenText = new Map<string, number>()
    const toolPhase = new Map<string, string>()
    let summary = ''

    // A stream that goes permanently silent is the worst failure mode: the
    // agent keeps running and billing while the UI spins forever. Bound each
    // wait so a silent stream surfaces as an error instead of a hang.
    const iterator = events.stream[Symbol.asyncIterator]()
    const STALL_MS = 180_000
    let stalled = false

    try {
      for (;;) {
        if (signal?.aborted) break

        let timer: ReturnType<typeof setTimeout> | undefined
        const next = await Promise.race([
          iterator.next(),
          new Promise<'stalled'>(resolve => {
            timer = setTimeout(() => resolve('stalled'), STALL_MS)
          }),
        ])
        if (timer) clearTimeout(timer)

        if (next === 'stalled') {
          stalled = true
          break
        }
        if (next.done) break
        const event = next.value

        if (event.type === 'message.part.updated') {
          const part = event.properties.part

          if (part.type === 'text') {
            const already = seenText.get(part.id) ?? 0
            const full = part.text ?? ''
            const delta = event.properties.delta ?? full.slice(already)
            if (delta) {
              seenText.set(part.id, full.length)
              summary = full
              emit(makeStep('thinking', { thinking: delta }))
            }
          } else if (part.type === 'tool') {
            const status = part.state.status
            // pending and running are one "call" to the user; parts are also
            // re-sent on every update, so emit once per phase transition.
            const phase = status === 'pending' || status === 'running' ? 'call' : status
            if (toolPhase.get(part.id) !== phase) {
              toolPhase.set(part.id, phase)
              const toolName = canonicalToolName(part.tool, part.state.input)
              if (phase === 'call') {
                emit(makeStep('tool_call', { toolName, toolInput: part.state.input }))
              } else if (status === 'completed') {
                emit(
                  makeStep('tool_result', {
                    toolName,
                    toolInput: part.state.input,
                    toolResult: parseToolOutput(part.tool, part.state.output),
                  })
                )
              } else if (status === 'error') {
                emit(
                  makeStep('tool_result', {
                    toolName,
                    isError: true,
                    // The renderer renders toolResult for errors, so it must be set.
                    toolResult: part.state.error,
                    errorMessage: part.state.error,
                  })
                )
              }
            }
          }
        } else if (event.type === 'session.error') {
          const err = event.properties.error
          const message =
            (err as { data?: { message?: string } } | undefined)?.data?.message ??
            (err as { name?: string } | undefined)?.name ??
            'Agent error'
          emit(makeStep('error', { isError: true, errorMessage: message }))
        } else if (event.type === 'session.idle' && event.properties.sessionID === sessionId) {
          break
        }
      }
    } finally {
      signal?.removeEventListener('abort', abort)
    }

    if (stalled) {
      // Stop the run so it cannot keep working (and billing) unobserved.
      logger.error('event stream stalled', { sessionId, directory, stallMs: STALL_MS })
      await client.session
        .abort({ path: { id: sessionId }, query: { directory } })
        .catch(() => {})
    }

    if (signal?.aborted) {
      return { success: false, error: 'Generation cancelled.', steps }
    }

    const written = fs.existsSync(entryPath) ? fs.readFileSync(entryPath, 'utf-8') : null
    const unchanged = written === null || (seededCode !== null && written === seededCode)

    // The agent replied in words without touching the dashboard: an answer,
    // not a failure.
    if (unchanged && !stalled && summary.trim()) {
      emit(makeStep('complete', { thinking: 'Answered without changing the dashboard' }))
      return { success: true, respondedDirectly: true, message: summary.trim(), steps }
    }

    if (written === null) {
      const message = stalled
        ? `The agent stopped sending progress for ${Math.round(STALL_MS / 1000)}s and was cancelled before writing ${DASHBOARD_ENTRY}.`
        : `The agent finished without writing ${DASHBOARD_ENTRY}. Try rephrasing the request.`
      emit(makeStep('error', { isError: true, errorMessage: message }))
      return { success: false, error: message, summary: summary.trim() || undefined, steps }
    }

    emit(makeStep('complete'))

    return {
      success: true,
      code: written,
      entryPath,
      summary: summary.trim() || undefined,
      steps,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('opencode run failed', { error: message })
    emit(makeStep('error', { isError: true, errorMessage: message }))
    return { success: false, error: message, steps }
  } finally {
    try { server?.close() } catch { /* already gone */ }
    await bridge?.close().catch(() => {})
  }
}
