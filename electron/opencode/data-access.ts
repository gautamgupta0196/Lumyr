/**
 * How a generated dashboard reaches its data at runtime.
 *
 * The agent explores data through the MCP bridge while it works, but the
 * dashboard it writes runs later, in Lumyr's Streamlit process. That process
 * receives the active connection's credentials as environment variables (see
 * the pythonManager.setExtraEnv calls in main.ts) — the agent's own shell does
 * not, deliberately, so it cannot touch the database outside read-only run_sql.
 *
 * This tells the agent which variables exist and how to connect with them.
 * The variable names must stay in sync with what main.ts injects.
 */
import type { AgentRequest } from '../agent-types.js'
import type { UploadedFile } from '../store.js'

type SourceType = NonNullable<AgentRequest['sourceType']>
type ConnectionMeta = AgentRequest['connectionMeta']

const PATTERNS: Record<Exclude<SourceType, 'file'>, string> = {
  bigquery: `from google.cloud import bigquery
client = bigquery.Client()  # project and credentials come from the environment
df = client.query("SELECT ... FROM \`project.dataset.table\`").to_dataframe()`,

  postgresql: `import os, psycopg2
conn = psycopg2.connect(
    host=os.environ["PGHOST"],
    port=int(os.environ.get("PGPORT", "5432")),
    dbname=os.environ["PGDATABASE"],
    user=os.environ["PGUSER"],
    password=os.environ["PGPASSWORD"],
)
df = pd.read_sql("SELECT ... FROM schema.table", conn)`,

  redshift: `import os, psycopg2
conn = psycopg2.connect(
    host=os.environ["REDSHIFT_HOST"],
    port=int(os.environ.get("REDSHIFT_PORT", "5439")),
    dbname=os.environ["REDSHIFT_DATABASE"],
    user=os.environ["REDSHIFT_USER"],
    password=os.environ["REDSHIFT_PASSWORD"],
)
df = pd.read_sql("SELECT ... FROM schema.table", conn)`,

  snowflake: `import os, snowflake.connector
conn = snowflake.connector.connect(
    account=os.environ["SNOWFLAKE_ACCOUNT"],
    user=os.environ["SNOWFLAKE_USER"],
    password=os.environ["SNOWFLAKE_PASSWORD"],
    warehouse=os.environ["SNOWFLAKE_WAREHOUSE"],
    database=os.environ["SNOWFLAKE_DATABASE"],
    schema=os.environ.get("SNOWFLAKE_SCHEMA", "PUBLIC"),
)
cur = conn.cursor()
cur.execute("SELECT ...")
df = cur.fetch_pandas_all()`,

  netsuite: `import os, requests, pandas as pd
from requests_oauthlib import OAuth1
auth = OAuth1(
    os.environ["NETSUITE_CONSUMER_KEY"], os.environ["NETSUITE_CONSUMER_SECRET"],
    os.environ["NETSUITE_TOKEN_ID"], os.environ["NETSUITE_TOKEN_SECRET"],
    signature_method="HMAC-SHA256", realm=os.environ["NETSUITE_ACCOUNT_ID"],
)
account = os.environ["NETSUITE_ACCOUNT_ID"].replace("_", "-").lower()
url = f"https://{account}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql"

def run_suiteql(query, limit=1000, offset=0):
    r = requests.post(url, json={"q": query}, auth=auth,
                      headers={"Prefer": "transient", "limit": str(limit), "offset": str(offset)})
    r.raise_for_status()
    data = r.json()
    return pd.DataFrame(data.get("items", [])), data.get("hasMore", False)`,

  odbc: `import os, pyodbc
conn = pyodbc.connect(os.environ["ODBC_CONNECTION_STRING"])
df = pd.read_sql("SELECT ...", conn)`,
}

const NOTES: Partial<Record<SourceType, string[]>> = {
  bigquery: [
    'Use fully qualified table names (`project.dataset.table`).',
    'Cast before comparing DATE and TIMESTAMP columns.',
  ],
  netsuite: ['SuiteQL returns at most 1000 rows per page; paginate with `offset`.'],
  odbc: ['The SQL dialect depends on the underlying database; prefer standard SQL.'],
}

function metaLines(meta: ConnectionMeta): string[] {
  if (!meta) return []
  const labels: [keyof NonNullable<ConnectionMeta>, string][] = [
    ['database', 'Database'],
    ['schema', 'Schema'],
    ['warehouse', 'Warehouse'],
    ['account', 'Account'],
    ['accountId', 'Account ID'],
    ['host', 'Host'],
    ['region', 'Region'],
    ['dsn', 'DSN'],
    ['driver', 'Driver'],
  ]
  return labels.filter(([key]) => meta[key]).map(([key, label]) => `- ${label}: \`${meta[key]}\``)
}

function fileSection(files: UploadedFile[]): string[] {
  if (!files.length) return []
  const out = [
    '',
    'Uploaded files (read them with pandas at these absolute paths):',
  ]
  for (const f of files) {
    const cols = f.columns.map(c => `${c.name} (${c.type})`).join(', ')
    out.push(`- ${f.originalName} [${f.format}] → \`${f.filePath}\``)
    if (cols) out.push(`  columns: ${cols}`)
  }
  out.push('Use pd.read_csv for csv, pd.read_excel for xlsx/xls (sheet_name=None reads every sheet).')
  return out
}

export function dataAccessInstructions(
  sourceType: SourceType | undefined,
  meta: ConnectionMeta,
  files: UploadedFile[] = []
): string {
  const source = sourceType ?? 'bigquery'
  const lines: string[] = ['', '## How the dashboard reaches its data']

  if (source !== 'file') {
    lines.push(
      `The dashboard runs inside Lumyr's Streamlit process, which is given the ${source}`,
      'credentials as environment variables. Connect exactly like this:',
      '',
      '```python',
      PATTERNS[source],
      '```',
      ...metaLines(meta),
      ...(NOTES[source] ?? []).map(n => `- ${n}`),
      '',
      'Those variables exist ONLY when Lumyr runs the dashboard. They are not set in',
      'your shell, so do not try to run app.py or open a connection yourself.'
    )
  }

  lines.push(...fileSection(files))

  lines.push(
    '',
    'Wrap data loading in a function decorated with @st.cache_data(ttl=600) so',
    'widgets do not re-query on every interaction.',
    '',
    '## Required structure (Lumyr detects success and failure from stderr)',
    '```python',
    'import sys',
    'import streamlit as st',
    '',
    'st.set_page_config(page_title="...", layout="wide")',
    '',
    'try:',
    '    ...  # load data and render everything',
    '    print("DASHBOARD_READY", file=sys.stderr)',
    'except Exception as e:',
    '    print(f"DASHBOARD_ERROR: {e}", file=sys.stderr)',
    '    st.error(f"Error: {e}")',
    '```',
    'Both prints are mandatory: DASHBOARD_READY is how Lumyr tells a working',
    'dashboard from one that merely logged warnings, and DASHBOARD_ERROR is the',
    'message the user sees when something fails.',
    '',
    'Never use subprocess, os.system, or pip in the dashboard; Lumyr installs',
    'imported packages itself.',
    '',
    'The runtime is Streamlit 1.50: size charts and tables with width="stretch";',
    'use_container_width is deprecated and floods stderr with warnings.'
  )
  return lines.join('\n')
}
