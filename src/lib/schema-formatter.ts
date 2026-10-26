import type { Schema, Dataset, Table } from '@/stores/app-store'

/**
 * Format schema for display in the UI
 */
export function formatSchemaForDisplay(schema: Schema): string {
  const lines: string[] = []

  for (const dataset of schema.datasets) {
    lines.push(`📁 ${dataset.id}`)
    for (const table of dataset.tables) {
      lines.push(`  📊 ${table.id}`)
      for (const column of table.columns) {
        const desc = column.description ? ` - ${column.description}` : ''
        lines.push(`    • ${column.name} (${column.type})${desc}`)
      }
    }
  }

  return lines.join('\n')
}

/**
 * Get the full table name for BigQuery
 */
export function getFullTableName(projectId: string, datasetId: string, tableId: string): string {
  return `\`${projectId}.${datasetId}.${tableId}\``
}

/**
 * Get table statistics for display
 */
export function getSchemaStats(schema: Schema): {
  datasetCount: number
  tableCount: number
  columnCount: number
} {
  let tableCount = 0
  let columnCount = 0

  for (const dataset of schema.datasets) {
    tableCount += dataset.tables.length
    for (const table of dataset.tables) {
      columnCount += table.columns.length
    }
  }

  return {
    datasetCount: schema.datasets.length,
    tableCount,
    columnCount
  }
}

/**
 * Search schema for matching tables/columns
 */
export function searchSchema(
  schema: Schema,
  query: string
): { datasets: Dataset[]; matchCount: number } {
  const lowerQuery = query.toLowerCase()
  const matchingDatasets: Dataset[] = []
  let matchCount = 0

  for (const dataset of schema.datasets) {
    const matchingTables: Table[] = []

    for (const table of dataset.tables) {
      // Check if table name matches
      if (table.id.toLowerCase().includes(lowerQuery)) {
        matchingTables.push(table)
        matchCount++
        continue
      }

      // Check if any column matches
      const matchingColumns = table.columns.filter(
        (col) =>
          col.name.toLowerCase().includes(lowerQuery) ||
          col.type.toLowerCase().includes(lowerQuery) ||
          col.description?.toLowerCase().includes(lowerQuery)
      )

      if (matchingColumns.length > 0) {
        matchingTables.push({
          ...table,
          columns: matchingColumns
        })
        matchCount += matchingColumns.length
      }
    }

    if (matchingTables.length > 0) {
      matchingDatasets.push({
        ...dataset,
        tables: matchingTables
      })
    }
  }

  return { datasets: matchingDatasets, matchCount }
}

/**
 * Get suggested tables based on query keywords
 */
export function suggestTables(schema: Schema, query: string): string[] {
  const keywords = query.toLowerCase().split(/\s+/)
  const suggestions: { table: string; score: number }[] = []

  for (const dataset of schema.datasets) {
    for (const table of dataset.tables) {
      let score = 0
      const tableLower = table.id.toLowerCase()

      // Check table name
      for (const keyword of keywords) {
        if (tableLower.includes(keyword)) {
          score += 10
        }
      }

      // Check column names
      for (const column of table.columns) {
        const colLower = column.name.toLowerCase()
        for (const keyword of keywords) {
          if (colLower.includes(keyword)) {
            score += 5
          }
        }
      }

      if (score > 0) {
        suggestions.push({
          table: `${schema.projectId}.${dataset.id}.${table.id}`,
          score
        })
      }
    }
  }

  return suggestions
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => s.table)
}
