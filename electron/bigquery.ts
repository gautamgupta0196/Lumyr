import { BigQuery } from '@google-cloud/bigquery'
import { shell, dialog } from 'electron'
import { OAuth2Client } from 'google-auth-library'
import http from 'http'
import net from 'net'
import fs from 'fs'
import { URL } from 'url'
import crypto from 'crypto'
import {
  saveConnection,
  getConnection,
  getAllConnections,
  getActiveConnectionId,
  setActiveConnectionId,
  updateConnectionLastUsed,
  updateConnection,
  saveConnectionCredentials,
  getConnectionCredentials,
  type SavedConnection
} from './store.js'

interface TokenData {
  access_token: string
  refresh_token: string
  expiry_date: number
}

interface ServiceAccountCredentials {
  type: string
  project_id: string
  private_key_id: string
  private_key: string
  client_email: string
  client_id: string
  auth_uri: string
  token_uri: string
}

interface Schema {
  projectId: string
  datasets: Dataset[]
}

interface Dataset {
  id: string
  tables: Table[]
}

interface Table {
  id: string
  columns: Column[]
}

interface Column {
  name: string
  type: string
  description?: string
}

// OAuth configuration - read lazily to allow dotenv to load first
// Export so python-manager can use the same credentials
export function getOAuthConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID.apps.googleusercontent.com',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'YOUR_CLIENT_SECRET',
    scopes: [
      // BigQuery requires job creation to run queries, not just readonly
      'https://www.googleapis.com/auth/bigquery',
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/cloudplatformprojects.readonly'
    ]
  }
}

// Temporary storage for OAuth tokens during project selection
let pendingOAuthTokens: {
  access_token: string
  refresh_token: string
  expiry_date: number
} | null = null

let oauth2Client: OAuth2Client | null = null
let bigQueryClient: BigQuery | null = null
let cachedSchema: Schema | null = null
let activeOAuthServer: http.Server | null = null
let activeConnectionId: string | null = null

// Find an available port
async function findAvailablePort(startPort = 8085): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        findAvailablePort(startPort + 1).then(resolve).catch(reject)
      } else {
        reject(err)
      }
    })
    server.listen(startPort, () => {
      const address = server.address()
      if (address && typeof address === 'object') {
        const port = address.port
        server.close(() => resolve(port))
      } else {
        reject(new Error('Failed to get port'))
      }
    })
  })
}

export async function initBigQuery(): Promise<void> {
  // Get active connection from store
  const storedActiveId = getActiveConnectionId()
  if (!storedActiveId) return

  const connection = getConnection(storedActiveId)
  if (!connection) return

  const credentials = getConnectionCredentials(storedActiveId)
  if (!credentials) return

  try {
    if (connection.authType === 'oauth' && credentials.tokens) {
      oauth2Client = new OAuth2Client(
        getOAuthConfig().clientId,
        getOAuthConfig().clientSecret,
        'http://localhost:8085/oauth2callback'
      )
      oauth2Client.setCredentials(credentials.tokens)

      // Persist refreshed tokens
      oauth2Client.on('tokens', (newTokens) => {
        const currentCreds = getConnectionCredentials(storedActiveId)
        if (currentCreds?.tokens) {
          const updated = { ...currentCreds.tokens }
          if (newTokens.access_token) updated.access_token = newTokens.access_token
          if (newTokens.expiry_date) updated.expiry_date = newTokens.expiry_date
          if (newTokens.refresh_token) updated.refresh_token = newTokens.refresh_token
          saveConnectionCredentials(storedActiveId, { tokens: updated })
        }
      })

      bigQueryClient = new BigQuery({
        projectId: connection.projectId,
        authClient: oauth2Client as any
      })
      activeConnectionId = storedActiveId
    } else if (connection.authType === 'service_account' && credentials.serviceAccount) {
      bigQueryClient = new BigQuery({
        projectId: connection.projectId,
        credentials: credentials.serviceAccount as ServiceAccountCredentials
      })
      activeConnectionId = storedActiveId
    }
  } catch (error) {
    console.error('Failed to initialize BigQuery:', error)
  }
}

// Get current auth status
export function getAuthStatus(): {
  isConnected: boolean
  authType?: 'oauth' | 'service_account'
  projectId?: string
  connectionId?: string
  connectionName?: string
} {
  if (!activeConnectionId || !bigQueryClient) {
    return { isConnected: false }
  }

  const connection = getConnection(activeConnectionId)
  if (!connection) {
    return { isConnected: false }
  }

  return {
    isConnected: true,
    authType: connection.authType,
    projectId: connection.projectId,
    connectionId: activeConnectionId,
    connectionName: connection.name
  }
}

// Get all saved connections
export function getSavedConnections(): SavedConnection[] {
  return getAllConnections()
}

// ============ OAUTH AUTHENTICATION ============

interface GCPProject {
  projectId: string
  name: string
  projectNumber: string
}

// Step 1: Start OAuth and get list of available projects
export async function startOAuthAndListProjects(): Promise<{
  success: boolean
  error?: string
  projects?: GCPProject[]
}> {
  if (activeOAuthServer) {
    activeOAuthServer.close()
    activeOAuthServer = null
  }

  // Check if OAuth is configured
  if (getOAuthConfig().clientId === 'YOUR_CLIENT_ID.apps.googleusercontent.com' ||
      getOAuthConfig().clientSecret === 'YOUR_CLIENT_SECRET') {
    return {
      success: false,
      error: 'OAuth not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables, or use a Service Account instead.'
    }
  }

  try {
    const port = await findAvailablePort(8085)
    const redirectUri = `http://localhost:${port}/oauth2callback`

    oauth2Client = new OAuth2Client(
      getOAuthConfig().clientId,
      getOAuthConfig().clientSecret,
      redirectUri
    )

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: getOAuthConfig().scopes,
      prompt: 'consent'
    })

    const authCodePromise = startOAuthServer(port)

    try {
      await shell.openExternal(authUrl)
    } catch {
      if (activeOAuthServer) {
        activeOAuthServer.close()
        activeOAuthServer = null
      }
      return {
        success: false,
        error: 'Failed to open browser for authentication. Please try again.'
      }
    }

    const authCode = await authCodePromise

    let tokens
    try {
      const tokenResponse = await oauth2Client.getToken(authCode)
      tokens = tokenResponse.tokens
    } catch (tokenError) {
      const errorMessage = tokenError instanceof Error ? tokenError.message : 'Failed to get tokens'
      if (errorMessage.includes('invalid_client')) {
        return {
          success: false,
          error: 'Invalid OAuth credentials. Please check your GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
        }
      }
      return { success: false, error: errorMessage }
    }

    oauth2Client.setCredentials(tokens)

    // Store tokens for later use
    pendingOAuthTokens = {
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token!,
      expiry_date: tokens.expiry_date!
    }

    // Fetch list of projects using Resource Manager API
    const projects = await listGCPProjects(oauth2Client)

    if (projects.length === 0) {
      pendingOAuthTokens = null
      return {
        success: false,
        error: 'No Google Cloud projects found. Please create a project in Google Cloud Console first.'
      }
    }

    return { success: true, projects }
  } catch (error) {
    pendingOAuthTokens = null
    if (activeOAuthServer) {
      (activeOAuthServer as http.Server).close()
      activeOAuthServer = null
    }
    const message = error instanceof Error ? error.message : 'OAuth failed'
    return { success: false, error: message }
  }
}

// Helper to list GCP projects
async function listGCPProjects(authClient: OAuth2Client): Promise<GCPProject[]> {
  const url = 'https://cloudresourcemanager.googleapis.com/v1/projects?filter=lifecycleState:ACTIVE'

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${(await authClient.getAccessToken()).token}`
    }
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to list projects: ${errorText}`)
  }

  const data = await response.json()
  const projects: GCPProject[] = (data.projects || []).map((p: any) => ({
    projectId: p.projectId,
    name: p.name,
    projectNumber: p.projectNumber
  }))

  // Sort by name
  return projects.sort((a, b) => a.name.localeCompare(b.name))
}

// Step 2: Complete OAuth connection with selected project
export async function completeOAuthConnection(
  projectId: string,
  connectionName?: string
): Promise<{
  success: boolean
  error?: string
  projectId?: string
  connectionId?: string
}> {
  if (!pendingOAuthTokens || !oauth2Client) {
    return { success: false, error: 'No pending OAuth session. Please start OAuth again.' }
  }

  try {
    // Verify access to the project
    const tempBq = new BigQuery({
      projectId,
      authClient: oauth2Client as any
    })

    try {
      await tempBq.getDatasets({ maxResults: 1 })
    } catch (verifyError) {
      const msg = verifyError instanceof Error ? verifyError.message : 'Unknown error'
      if (msg.includes('403') || msg.includes('permission')) {
        return { success: false, error: `Access denied to project "${projectId}". Please check your BigQuery permissions.` }
      }
      throw verifyError
    }

    // Create and save connection
    const connectionId = crypto.randomUUID()
    const connection: SavedConnection = {
      id: connectionId,
      name: connectionName || projectId,
      type: 'bigquery',
      projectId,
      authType: 'oauth',
      createdAt: Date.now(),
      lastUsed: Date.now()
    }

    saveConnection(connection)
    saveConnectionCredentials(connectionId, { tokens: pendingOAuthTokens })
    setActiveConnectionId(connectionId)

    bigQueryClient = new BigQuery({
      projectId,
      authClient: oauth2Client as any
    })
    activeConnectionId = connectionId
    cachedSchema = null
    pendingOAuthTokens = null

    return { success: true, projectId, connectionId }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to complete connection'
    return { success: false, error: message }
  }
}

// Cancel pending OAuth
export function cancelPendingOAuth(): void {
  pendingOAuthTokens = null
}

// Legacy: Direct OAuth with project ID (kept for backwards compatibility)
export async function connectWithOAuth(projectId: string, connectionName?: string): Promise<{
  success: boolean
  error?: string
  projectId?: string
  connectionId?: string
}> {
  if (activeOAuthServer) {
    activeOAuthServer.close()
    activeOAuthServer = null
  }

  // Check if OAuth is configured
  if (getOAuthConfig().clientId === 'YOUR_CLIENT_ID.apps.googleusercontent.com' ||
      getOAuthConfig().clientSecret === 'YOUR_CLIENT_SECRET') {
    return {
      success: false,
      error: 'OAuth not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables, or use a Service Account instead.'
    }
  }

  try {
    const port = await findAvailablePort(8085)
    const redirectUri = `http://localhost:${port}/oauth2callback`

    oauth2Client = new OAuth2Client(
      getOAuthConfig().clientId,
      getOAuthConfig().clientSecret,
      redirectUri
    )

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: getOAuthConfig().scopes,
      prompt: 'consent'
    })

    const authCodePromise = startOAuthServer(port)

    // Try to open the browser
    try {
      await shell.openExternal(authUrl)
    } catch (browserError) {
      if (activeOAuthServer) {
        activeOAuthServer.close()
        activeOAuthServer = null
      }
      return {
        success: false,
        error: 'Failed to open browser for authentication. Please try again.'
      }
    }

    const authCode = await authCodePromise

    let tokens
    try {
      const tokenResponse = await oauth2Client.getToken(authCode)
      tokens = tokenResponse.tokens
    } catch (tokenError) {
      const errorMessage = tokenError instanceof Error ? tokenError.message : 'Failed to get tokens'
      if (errorMessage.includes('invalid_client')) {
        return {
          success: false,
          error: 'Invalid OAuth credentials. Please check your GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or use a Service Account instead.'
        }
      }
      return { success: false, error: errorMessage }
    }

    oauth2Client.setCredentials(tokens)

    // Verify access to the project by listing datasets
    const tempBq = new BigQuery({
      projectId,
      authClient: oauth2Client as any
    })

    try {
      await tempBq.getDatasets({ maxResults: 1 })
    } catch (verifyError) {
      const msg = verifyError instanceof Error ? verifyError.message : 'Unknown error'
      if (msg.includes('404') || msg.includes('not found')) {
        return { success: false, error: `Project "${projectId}" not found. Please check the project ID.` }
      }
      if (msg.includes('403') || msg.includes('permission')) {
        return { success: false, error: `Access denied to project "${projectId}". Please check your permissions.` }
      }
      throw verifyError
    }

    // Create and save connection
    const connectionId = crypto.randomUUID()
    const connection: SavedConnection = {
      id: connectionId,
      name: connectionName || projectId,
      type: 'bigquery',
      projectId,
      authType: 'oauth',
      createdAt: Date.now(),
      lastUsed: Date.now()
    }

    saveConnection(connection)
    saveConnectionCredentials(connectionId, {
      tokens: {
        access_token: tokens.access_token!,
        refresh_token: tokens.refresh_token!,
        expiry_date: tokens.expiry_date!
      }
    })
    setActiveConnectionId(connectionId)

    bigQueryClient = new BigQuery({
      projectId,
      authClient: oauth2Client as any
    })
    activeConnectionId = connectionId
    cachedSchema = null

    return { success: true, projectId, connectionId }
  } catch (error) {
    // Clean up OAuth server if it exists
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (activeOAuthServer !== null) {
      (activeOAuthServer as http.Server).close()
      activeOAuthServer = null
    }
    const message = error instanceof Error ? error.message : 'OAuth failed'
    return { success: false, error: message }
  }
}

function startOAuthServer(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let resolved = false

    const cleanup = () => {
      if (activeOAuthServer === server) {
        server.close()
        activeOAuthServer = null
      }
    }

    const server = http.createServer((req, res) => {
      const url = new URL(req.url!, `http://${req.headers.host}`)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      const errorDescription = url.searchParams.get('error_description')

      if (error) {
        resolved = true
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end(`
          <html>
            <body style="font-family: system-ui; padding: 40px; text-align: center;">
              <h1 style="color: #dc2626;">Authentication Failed</h1>
              <p style="color: #666;">${errorDescription || error}</p>
              <p style="color: #999; font-size: 14px;">You can close this window and try again.</p>
              <script>setTimeout(() => window.close(), 3000)</script>
            </body>
          </html>
        `)
        cleanup()
        reject(new Error(errorDescription || error))
        return
      }

      if (code) {
        resolved = true
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(`
          <html>
            <body style="font-family: system-ui; padding: 40px; text-align: center;">
              <h1 style="color: #16a34a;">Authentication Successful!</h1>
              <p style="color: #666;">You can close this window and return to Lumyr.</p>
              <script>setTimeout(() => window.close(), 2000)</script>
            </body>
          </html>
        `)
        cleanup()
        resolve(code)
      }
    })

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (!resolved) {
        resolved = true
        activeOAuthServer = null
        reject(new Error(`OAuth server error: ${err.message}`))
      }
    })

    activeOAuthServer = server

    server.listen(port, () => {
      console.log(`OAuth server listening on port ${port}`)
    })

    // 2 minute timeout (reduced from 5 minutes)
    setTimeout(() => {
      if (!resolved && activeOAuthServer === server) {
        resolved = true
        cleanup()
        reject(new Error('Authentication timed out. Please try again.'))
      }
    }, 2 * 60 * 1000)
  })
}

// ============ SERVICE ACCOUNT AUTHENTICATION ============

export async function selectServiceAccountFile(): Promise<{ success: boolean; error?: string; filePath?: string }> {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Select Service Account Key File',
      filters: [
        { name: 'JSON Files', extensions: ['json'] }
      ],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'No file selected' }
    }

    return { success: true, filePath: result.filePaths[0] }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to open file dialog'
    return { success: false, error: message }
  }
}

export async function connectWithServiceAccount(
  filePath: string,
  connectionName?: string
): Promise<{
  success: boolean
  error?: string
  projectId?: string
  connectionId?: string
}> {
  try {
    // Read and parse the service account file
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const credentials: ServiceAccountCredentials = JSON.parse(fileContent)

    // Validate the file structure
    if (!credentials.type || credentials.type !== 'service_account') {
      throw new Error('Invalid service account file: missing or incorrect "type" field')
    }
    if (!credentials.project_id) {
      throw new Error('Invalid service account file: missing "project_id" field')
    }
    if (!credentials.private_key) {
      throw new Error('Invalid service account file: missing "private_key" field')
    }
    if (!credentials.client_email) {
      throw new Error('Invalid service account file: missing "client_email" field')
    }

    const projectId = credentials.project_id

    // Test the connection
    const testClient = new BigQuery({
      projectId,
      credentials
    })

    // Try to list datasets to verify access
    await testClient.getDatasets({ maxResults: 1 })

    // Create and save connection
    const connectionId = crypto.randomUUID()
    const connection: SavedConnection = {
      id: connectionId,
      name: connectionName || projectId,
      type: 'bigquery',
      projectId,
      authType: 'service_account',
      createdAt: Date.now(),
      lastUsed: Date.now()
    }

    saveConnection(connection)
    saveConnectionCredentials(connectionId, {
      serviceAccount: credentials
    })
    setActiveConnectionId(connectionId)

    bigQueryClient = testClient
    activeConnectionId = connectionId
    cachedSchema = null

    return { success: true, projectId, connectionId }
  } catch (error) {
    let message = error instanceof Error ? error.message : 'Failed to connect with service account'

    // Provide more helpful error messages
    if (message.includes('Could not load the default credentials')) {
      message = 'Invalid service account credentials'
    } else if (message.includes('Permission denied') || message.includes('403')) {
      message = 'Service account does not have BigQuery access. Please check IAM permissions.'
    }

    return { success: false, error: message }
  }
}

// ============ SWITCH CONNECTION ============

export async function switchConnection(connectionId: string): Promise<{
  success: boolean
  error?: string
  projectId?: string
}> {
  const connection = getConnection(connectionId)
  if (!connection) {
    return { success: false, error: 'Connection not found' }
  }

  const credentials = getConnectionCredentials(connectionId)
  if (!credentials) {
    return { success: false, error: 'Connection credentials not found' }
  }

  try {
    if (connection.authType === 'oauth' && credentials.tokens) {
      oauth2Client = new OAuth2Client(
        getOAuthConfig().clientId,
        getOAuthConfig().clientSecret,
        'http://localhost:8085/oauth2callback'
      )
      oauth2Client.setCredentials(credentials.tokens)

      // Persist refreshed tokens
      oauth2Client.on('tokens', (newTokens) => {
        const currentCreds = getConnectionCredentials(connectionId)
        if (currentCreds?.tokens) {
          const updated = { ...currentCreds.tokens }
          if (newTokens.access_token) updated.access_token = newTokens.access_token
          if (newTokens.expiry_date) updated.expiry_date = newTokens.expiry_date
          if (newTokens.refresh_token) updated.refresh_token = newTokens.refresh_token
          saveConnectionCredentials(connectionId, { tokens: updated })
        }
      })

      bigQueryClient = new BigQuery({
        projectId: connection.projectId,
        authClient: oauth2Client as any
      })
    } else if (connection.authType === 'service_account' && credentials.serviceAccount) {
      bigQueryClient = new BigQuery({
        projectId: connection.projectId,
        credentials: credentials.serviceAccount as ServiceAccountCredentials
      })
    } else {
      return { success: false, error: 'Invalid connection credentials' }
    }

    activeConnectionId = connectionId
    cachedSchema = null
    setActiveConnectionId(connectionId)
    updateConnectionLastUsed(connectionId)

    return { success: true, projectId: connection.projectId }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to switch connection'
    return { success: false, error: message }
  }
}

// ============ LEGACY CONNECT (for backward compatibility) ============

export async function connectBigQuery(): Promise<{ success: boolean; error?: string; projectId?: string }> {
  // Default to OAuth for backward compatibility
  return connectWithOAuth()
}

// ============ SCHEMA & QUERY OPERATIONS ============

export interface SchemaFetchOptions {
  maxDatasets?: number
  maxTablesPerDataset?: number
  datasetFilter?: string[]
  searchQuery?: string
  offset?: number
  mode?: 'tables_only' | 'full'
}

export interface SchemaResult {
  schema: Schema
  totalDatasets: number
  totalTables: number
  hasMore: boolean
}

export async function getSchema(options?: SchemaFetchOptions): Promise<{ success: boolean; error?: string; schema?: Schema; metadata?: { totalDatasets: number; totalTables: number; hasMore: boolean } }> {
  if (!bigQueryClient || !activeConnectionId) {
    return { success: false, error: 'Not connected to BigQuery' }
  }

  try {
    // Return cached schema if available, no specific filters, and mode matches
    const requestingFull = options?.mode !== 'tables_only'
    const cachedHasColumns = cachedSchema?.datasets?.some(ds => ds.tables.some(t => t.columns.length > 0))
    if (cachedSchema && !options?.datasetFilter && !options?.searchQuery && !(requestingFull && !cachedHasColumns)) {
      return { success: true, schema: cachedSchema }
    }

    const connection = getConnection(activeConnectionId)
    if (!connection) {
      return { success: false, error: 'Connection not found' }
    }

    // Configurable limits (defaults support large warehouses)
    const maxDatasets = options?.maxDatasets ?? 50
    const maxTablesPerDataset = options?.maxTablesPerDataset ?? 100
    const offset = options?.offset ?? 0

    const projectId = connection.projectId
    const [allDatasets] = await bigQueryClient.getDatasets()

    // Apply dataset filter if provided
    let datasets = allDatasets
    if (options?.datasetFilter && options.datasetFilter.length > 0) {
      datasets = allDatasets.filter(d => options.datasetFilter!.includes(d.id!))
    }

    // Track totals
    const totalDatasets = allDatasets.length
    let totalTables = 0

    const schema: Schema = {
      projectId: projectId!,
      datasets: []
    }

    // Apply offset and limit
    const datasetsToProcess = datasets.slice(offset, offset + maxDatasets)

    for (const dataset of datasetsToProcess) {
      const datasetId = dataset.id!
      const [allTables] = await dataset.getTables()

      totalTables += allTables.length

      // Apply search query if provided
      let tables = allTables
      if (options?.searchQuery) {
        const query = options.searchQuery.toLowerCase()
        tables = allTables.filter(t => t.id!.toLowerCase().includes(query))
      }

      const datasetSchema: Dataset = {
        id: datasetId,
        tables: []
      }

      for (const table of tables.slice(0, maxTablesPerDataset)) {
        if (options?.mode === 'tables_only') {
          datasetSchema.tables.push({ id: table.id!, columns: [] })
        } else {
          const [metadata] = await table.getMetadata()
          const fields = metadata.schema?.fields || []

          const tableSchema: Table = {
            id: table.id!,
            columns: fields.map((field: any) => ({
              name: field.name,
              type: field.type,
              description: field.description
            }))
          }

          datasetSchema.tables.push(tableSchema)
        }
      }

      schema.datasets.push(datasetSchema)
    }

    // Only cache if no filters applied
    if (!options?.datasetFilter && !options?.searchQuery && offset === 0) {
      cachedSchema = schema
    }

    const hasMore = datasets.length > offset + maxDatasets

    return {
      success: true,
      schema,
      metadata: { totalDatasets, totalTables, hasMore }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch schema'
    return { success: false, error: message }
  }
}

// Search tables by name pattern
export async function searchTables(query: string, limit = 50): Promise<{ success: boolean; error?: string; tables?: Array<{ datasetId: string; tableId: string; fullName: string; columns: Column[] }> }> {
  if (!bigQueryClient || !activeConnectionId) {
    return { success: false, error: 'Not connected to BigQuery' }
  }

  try {
    const connection = getConnection(activeConnectionId)
    if (!connection) {
      return { success: false, error: 'Connection not found' }
    }

    const projectId = connection.projectId
    const [datasets] = await bigQueryClient.getDatasets()

    const tables: Array<{ datasetId: string; tableId: string; fullName: string; columns: Column[] }> = []
    const queryLower = query.toLowerCase()

    for (const dataset of datasets) {
      if (tables.length >= limit) break

      const datasetId = dataset.id!
      const [allTables] = await dataset.getTables()

      for (const table of allTables) {
        if (tables.length >= limit) break

        const tableId = table.id!
        const fullName = `${projectId}.${datasetId}.${tableId}`

        // Match against table name or full name
        if (tableId.toLowerCase().includes(queryLower) ||
            fullName.toLowerCase().includes(queryLower) ||
            datasetId.toLowerCase().includes(queryLower)) {
          const [metadata] = await table.getMetadata()
          const fields = metadata.schema?.fields || []

          tables.push({
            datasetId,
            tableId,
            fullName,
            columns: fields.map((field: any) => ({
              name: field.name,
              type: field.type,
              description: field.description
            }))
          })
        }
      }
    }

    return { success: true, tables }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to search tables'
    return { success: false, error: message }
  }
}

// Get details for a specific table
export async function getTableDetails(tableName: string): Promise<{ success: boolean; error?: string; table?: { datasetId: string; tableId: string; fullName: string; columns: Column[]; rowCount?: number } }> {
  if (!bigQueryClient || !activeConnectionId) {
    return { success: false, error: 'Not connected to BigQuery' }
  }

  try {
    const connection = getConnection(activeConnectionId)
    if (!connection) {
      return { success: false, error: 'Connection not found' }
    }

    // Parse table name: project.dataset.table or dataset.table
    const parts = tableName.split('.')
    let datasetId: string
    let tableId: string

    if (parts.length === 3) {
      datasetId = parts[1]
      tableId = parts[2]
    } else if (parts.length === 2) {
      datasetId = parts[0]
      tableId = parts[1]
    } else {
      return { success: false, error: 'Invalid table name format' }
    }

    const dataset = bigQueryClient.dataset(datasetId)
    const table = dataset.table(tableId)
    const [metadata] = await table.getMetadata()
    const fields = metadata.schema?.fields || []

    return {
      success: true,
      table: {
        datasetId,
        tableId,
        fullName: `${connection.projectId}.${datasetId}.${tableId}`,
        columns: fields.map((field: any) => ({
          name: field.name,
          type: field.type,
          description: field.description
        })),
        rowCount: metadata.numRows ? parseInt(metadata.numRows, 10) : undefined
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get table details'
    return { success: false, error: message }
  }
}

// Get a preview of table data
export async function getTablePreview(tableName: string, limit = 10): Promise<{ success: boolean; error?: string; columns?: string[]; rows?: any[] }> {
  if (!bigQueryClient || !activeConnectionId) {
    return { success: false, error: 'Not connected to BigQuery' }
  }

  try {
    const query = `SELECT * FROM \`${tableName}\` LIMIT ${limit}`
    const [rows] = await bigQueryClient.query({ query, maxResults: limit })

    const columns = rows.length > 0 ? Object.keys(rows[0]) : []

    return { success: true, columns, rows }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get table preview'
    return { success: false, error: message }
  }
}

export async function runQuery(query: string): Promise<{ success: boolean; error?: string; data?: any[] }> {
  if (!bigQueryClient) {
    return { success: false, error: 'Not connected to BigQuery' }
  }

  try {
    const [rows] = await bigQueryClient.query({ query, maxResults: 1000 })
    return { success: true, data: rows }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Query failed'
    return { success: false, error: message }
  }
}

export function isConnected(): boolean {
  return bigQueryClient !== null && activeConnectionId !== null
}

export function disconnect(): void {
  oauth2Client = null
  bigQueryClient = null
  cachedSchema = null
  activeConnectionId = null
  setActiveConnectionId(null)
}

export function clearCredentials(): void {
  disconnect()
}

export function getActiveConnection(): string | null {
  return activeConnectionId
}

export function cleanup(): void {
  if (activeOAuthServer) {
    activeOAuthServer.close()
    activeOAuthServer = null
  }
}

// ============ RECONNECT OAUTH ============

export async function reconnectOAuth(connectionId: string): Promise<{
  success: boolean
  error?: string
}> {
  const connection = getConnection(connectionId)
  if (!connection) {
    return { success: false, error: 'Connection not found' }
  }

  if (connection.authType !== 'oauth') {
    return { success: false, error: 'Connection is not an OAuth connection' }
  }

  if (activeOAuthServer) {
    activeOAuthServer.close()
    activeOAuthServer = null
  }

  if (getOAuthConfig().clientId === 'YOUR_CLIENT_ID.apps.googleusercontent.com' ||
      getOAuthConfig().clientSecret === 'YOUR_CLIENT_SECRET') {
    return {
      success: false,
      error: 'OAuth not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
    }
  }

  try {
    const port = await findAvailablePort(8085)
    const redirectUri = `http://localhost:${port}/oauth2callback`

    oauth2Client = new OAuth2Client(
      getOAuthConfig().clientId,
      getOAuthConfig().clientSecret,
      redirectUri
    )

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: getOAuthConfig().scopes,
      prompt: 'consent'
    })

    const authCodePromise = startOAuthServer(port)

    try {
      await shell.openExternal(authUrl)
    } catch {
      if (activeOAuthServer) {
        activeOAuthServer.close()
        activeOAuthServer = null
      }
      return { success: false, error: 'Failed to open browser for authentication.' }
    }

    const authCode = await authCodePromise

    let tokens
    try {
      const tokenResponse = await oauth2Client.getToken(authCode)
      tokens = tokenResponse.tokens
    } catch (tokenError) {
      const errorMessage = tokenError instanceof Error ? tokenError.message : 'Failed to get tokens'
      return { success: false, error: errorMessage }
    }

    oauth2Client.setCredentials(tokens)

    // Listen for token refresh events
    oauth2Client.on('tokens', (newTokens) => {
      const updatedTokens: any = { ...tokens }
      if (newTokens.access_token) updatedTokens.access_token = newTokens.access_token
      if (newTokens.expiry_date) updatedTokens.expiry_date = newTokens.expiry_date
      if (newTokens.refresh_token) updatedTokens.refresh_token = newTokens.refresh_token
      saveConnectionCredentials(connectionId, { tokens: updatedTokens })
    })

    // Save new credentials
    saveConnectionCredentials(connectionId, {
      tokens: {
        access_token: tokens.access_token!,
        refresh_token: tokens.refresh_token!,
        expiry_date: tokens.expiry_date!
      }
    })

    // Update active client
    bigQueryClient = new BigQuery({
      projectId: connection.projectId,
      authClient: oauth2Client as any
    })
    activeConnectionId = connectionId
    cachedSchema = null
    setActiveConnectionId(connectionId)
    updateConnectionLastUsed(connectionId)

    return { success: true }
  } catch (error) {
    if (activeOAuthServer) {
      activeOAuthServer.close()
      activeOAuthServer = null
    }
    const message = error instanceof Error ? error.message : 'Reconnect failed'
    return { success: false, error: message }
  }
}

export async function updateBigQueryServiceAccount(
  connectionId: string,
  filePath: string,
  connectionName?: string
): Promise<{ success: boolean; error?: string; projectId?: string }> {
  try {
    const connection = getConnection(connectionId)
    if (!connection) {
      return { success: false, error: 'Connection not found' }
    }

    // Read and validate the service account file
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const credentials: ServiceAccountCredentials = JSON.parse(fileContent)

    if (!credentials.type || credentials.type !== 'service_account') {
      return { success: false, error: 'Invalid service account file: missing or incorrect "type" field' }
    }
    if (!credentials.project_id) {
      return { success: false, error: 'Invalid service account file: missing "project_id" field' }
    }
    if (!credentials.private_key) {
      return { success: false, error: 'Invalid service account file: missing "private_key" field' }
    }
    if (!credentials.client_email) {
      return { success: false, error: 'Invalid service account file: missing "client_email" field' }
    }

    const projectId = credentials.project_id

    // Test the connection
    const testClient = new BigQuery({ projectId, credentials })
    await testClient.getDatasets({ maxResults: 1 })

    // Update metadata
    const updates: Partial<SavedConnection> = {
      projectId,
      authType: 'service_account',
      lastUsed: Date.now()
    }
    if (connectionName) updates.name = connectionName
    updateConnection(connectionId, updates)

    // Update credentials
    saveConnectionCredentials(connectionId, { serviceAccount: credentials })

    // If this is the active connection, reconnect
    if (activeConnectionId === connectionId) {
      bigQueryClient = testClient
      cachedSchema = null
    }

    return { success: true, projectId }
  } catch (error) {
    let message = error instanceof Error ? error.message : 'Failed to update service account'
    if (message.includes('Permission denied') || message.includes('403')) {
      message = 'Service account does not have BigQuery access. Please check IAM permissions.'
    }
    return { success: false, error: message }
  }
}

export function cancelOAuth(): { success: boolean } {
  if (activeOAuthServer) {
    activeOAuthServer.close()
    activeOAuthServer = null
    return { success: true }
  }
  return { success: false }
}
