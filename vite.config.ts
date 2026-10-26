import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['VITE_', 'SENTRY_'])

  return {
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          define: {
            'process.env.SENTRY_DSN': JSON.stringify(env.SENTRY_DSN || env.VITE_SENTRY_DSN || ''),
          },
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['electron', '@anthropic-ai/sdk', '@opencode-ai/sdk', '@modelcontextprotocol/sdk', 'express', '@google-cloud/bigquery', 'electron-store', '@sentry/electron', '@sentry/electron/main', 'electron-log', 'electron-log/main.js', 'pg', 'odbc', 'snowflake-sdk']
            }
          }
        }
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron'
          }
        }
      }
    ]),
    renderer()
  ],
  // Only the app's own entry. Otherwise Vite also crawls docs/index.html and
  // HTML files inside the bundled Python while pre-bundling dependencies.
  optimizeDeps: {
    entries: ['index.html']
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
  }
})
