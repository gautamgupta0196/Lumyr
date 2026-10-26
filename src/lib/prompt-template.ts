import type { Schema } from '@/stores/app-store'

/**
 * Example queries for different analysis types
 */
export const EXAMPLE_QUERIES = [
  {
    category: 'Trends',
    examples: [
      'Show me monthly revenue trends over the past year',
      'What are the daily active users over time?',
      'Display weekly order counts as a line chart'
    ]
  },
  {
    category: 'Comparisons',
    examples: [
      'Compare sales by region in a bar chart',
      'Show top 10 products by revenue',
      'Compare customer segments by purchase value'
    ]
  },
  {
    category: 'Distributions',
    examples: [
      'Show the distribution of order values',
      'Display age distribution of customers',
      'What is the breakdown of orders by status?'
    ]
  },
  {
    category: 'Aggregations',
    examples: [
      'Calculate total revenue by category',
      'Show average order value by month',
      'Count customers by country'
    ]
  }
]

/**
 * Supported analysis types for the prompt
 */
export const ANALYSIS_TYPES = [
  'time_series',
  'comparison',
  'distribution',
  'aggregation',
  'correlation',
  'ranking',
  'summary'
] as const

export type AnalysisType = (typeof ANALYSIS_TYPES)[number]

/**
 * Detect the likely analysis type from the query
 */
export function detectAnalysisType(query: string): AnalysisType {
  const lowerQuery = query.toLowerCase()

  if (
    lowerQuery.includes('over time') ||
    lowerQuery.includes('trend') ||
    lowerQuery.includes('monthly') ||
    lowerQuery.includes('weekly') ||
    lowerQuery.includes('daily') ||
    lowerQuery.includes('yearly')
  ) {
    return 'time_series'
  }

  if (
    lowerQuery.includes('compare') ||
    lowerQuery.includes('versus') ||
    lowerQuery.includes(' vs ')
  ) {
    return 'comparison'
  }

  if (
    lowerQuery.includes('distribution') ||
    lowerQuery.includes('breakdown') ||
    lowerQuery.includes('histogram')
  ) {
    return 'distribution'
  }

  if (lowerQuery.includes('top') || lowerQuery.includes('bottom') || lowerQuery.includes('rank')) {
    return 'ranking'
  }

  if (lowerQuery.includes('correlation') || lowerQuery.includes('relationship')) {
    return 'correlation'
  }

  if (
    lowerQuery.includes('total') ||
    lowerQuery.includes('sum') ||
    lowerQuery.includes('average') ||
    lowerQuery.includes('count')
  ) {
    return 'aggregation'
  }

  return 'summary'
}

/**
 * Get chart type suggestion based on analysis type
 */
export function suggestChartType(analysisType: AnalysisType): string {
  switch (analysisType) {
    case 'time_series':
      return 'line chart or area chart'
    case 'comparison':
      return 'bar chart or grouped bar chart'
    case 'distribution':
      return 'histogram or pie chart'
    case 'ranking':
      return 'horizontal bar chart'
    case 'correlation':
      return 'scatter plot'
    case 'aggregation':
      return 'bar chart or metric cards'
    case 'summary':
      return 'data table with key metrics'
  }
}

/**
 * Format the query with context for better results
 */
export function enhanceQuery(query: string, _schema: Schema): string {
  const analysisType = detectAnalysisType(query)
  const chartSuggestion = suggestChartType(analysisType)

  let enhanced = query

  // Add chart suggestion if not specified
  if (
    !query.toLowerCase().includes('chart') &&
    !query.toLowerCase().includes('graph') &&
    !query.toLowerCase().includes('table')
  ) {
    enhanced += ` (suggest using a ${chartSuggestion})`
  }

  return enhanced
}

/**
 * Generate query suggestions based on schema
 */
export function generateQuerySuggestions(schema: Schema): string[] {
  const suggestions: string[] = []

  for (const dataset of schema.datasets) {
    for (const table of dataset.tables) {
      const columns = table.columns

      // Find date columns
      const dateColumns = columns.filter(
        (c) =>
          c.type.toLowerCase().includes('date') ||
          c.type.toLowerCase().includes('timestamp') ||
          c.name.toLowerCase().includes('date') ||
          c.name.toLowerCase().includes('time')
      )

      // Find numeric columns
      const numericColumns = columns.filter(
        (c) =>
          c.type.toLowerCase().includes('int') ||
          c.type.toLowerCase().includes('float') ||
          c.type.toLowerCase().includes('numeric') ||
          c.type.toLowerCase().includes('decimal')
      )

      // Find categorical columns
      const categoricalColumns = columns.filter(
        (c) =>
          c.type.toLowerCase().includes('string') ||
          c.name.toLowerCase().includes('category') ||
          c.name.toLowerCase().includes('type') ||
          c.name.toLowerCase().includes('status')
      )

      // Generate time series suggestion
      if (dateColumns.length > 0 && numericColumns.length > 0) {
        const dateCol = dateColumns[0]
        const numCol = numericColumns[0]
        suggestions.push(
          `Show ${numCol.name} trends over ${dateCol.name} from ${table.id}`
        )
      }

      // Generate comparison suggestion
      if (categoricalColumns.length > 0 && numericColumns.length > 0) {
        const catCol = categoricalColumns[0]
        const numCol = numericColumns[0]
        suggestions.push(
          `Compare ${numCol.name} by ${catCol.name} from ${table.id}`
        )
      }

      // Generate ranking suggestion
      if (numericColumns.length > 0) {
        const numCol = numericColumns[0]
        suggestions.push(`Show top 10 records by ${numCol.name} from ${table.id}`)
      }
    }
  }

  return suggestions.slice(0, 10)
}
