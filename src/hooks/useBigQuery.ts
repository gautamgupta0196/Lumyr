import { useCallback } from 'react'
import { useAppStore } from '@/stores/app-store'

export function useBigQuery() {
  const connection = useAppStore((state) => state.connection)
  const schema = useAppStore((state) => state.schema)
  const isLoadingSchema = useAppStore((state) => state.isLoadingSchema)
  const setConnection = useAppStore((state) => state.setConnection)
  const setSchema = useAppStore((state) => state.setSchema)
  const setLoadingSchema = useAppStore((state) => state.setLoadingSchema)

  const connectWithOAuth = useCallback(async (projectId: string, connectionName?: string) => {
    try {
      setConnection({ error: null })
      const result = await window.electron.bigquery.connectWithOAuth(projectId, connectionName)

      if (result.success) {
        setConnection({
          isConnected: true,
          projectId: result.projectId,
          authType: 'oauth',
          error: null
        })
        await fetchSchema()
        return { success: true }
      } else {
        setConnection({ error: result.error })
        return { success: false, error: result.error }
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Connection failed'
      setConnection({ error })
      return { success: false, error }
    }
  }, [setConnection])

  const connectWithServiceAccount = useCallback(async () => {
    try {
      setConnection({ error: null })

      // First select the file
      const fileResult = await window.electron.bigquery.selectServiceAccountFile()
      if (!fileResult.success || !fileResult.filePath) {
        return { success: false, error: 'No file selected' }
      }

      // Then connect with the file
      const result = await window.electron.bigquery.connectWithServiceAccount(fileResult.filePath)

      if (result.success) {
        setConnection({
          isConnected: true,
          projectId: result.projectId,
          authType: 'service_account',
          error: null
        })
        await fetchSchema()
        return { success: true }
      } else {
        setConnection({ error: result.error })
        return { success: false, error: result.error }
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Connection failed'
      setConnection({ error })
      return { success: false, error }
    }
  }, [setConnection])

  const disconnect = useCallback(async () => {
    try {
      await window.electron.bigquery.disconnect()
      setConnection({
        isConnected: false,
        projectId: null,
        authType: null,
        error: null
      })
      setSchema(null)
      return { success: true }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Disconnect failed'
      return { success: false, error }
    }
  }, [setConnection, setSchema])

  const fetchSchema = useCallback(async () => {
    try {
      setLoadingSchema(true)
      const tablesResult = await window.electron.bigquery.getSchema({ mode: 'tables_only' })

      if (tablesResult.success && tablesResult.schema) {
        setSchema(tablesResult.schema)
        // Save to disk cache
        const connId = useAppStore.getState().connection.connectionId
        if (connId) {
          window.electron.schema.saveCache(connId, tablesResult.schema)
        }
      }
      setLoadingSchema(false)

      return { success: tablesResult.success, error: tablesResult.error }
    } catch (err) {
      setLoadingSchema(false)
      const error = err instanceof Error ? err.message : 'Failed to fetch schema'
      return { success: false, error }
    }
  }, [setSchema, setLoadingSchema])

  const runQuery = useCallback(async (query: string) => {
    try {
      const result = await window.electron.bigquery.runQuery(query)
      return result
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Query failed'
      return { success: false, error }
    }
  }, [])

  return {
    connection,
    schema,
    isLoadingSchema,
    connectWithOAuth,
    connectWithServiceAccount,
    disconnect,
    fetchSchema,
    runQuery,
    isConnected: connection.isConnected
  }
}
