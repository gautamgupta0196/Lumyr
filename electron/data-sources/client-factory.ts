// Data Source Client Factory
// Creates the appropriate client instance based on data source type

import type {
  DataSourceType,
  DataSourceConnection,
  DataSourceCredentials,
  DataSourceClient,
  BigQueryConnection,
  PostgreSQLConnection,
  SnowflakeConnection,
  RedshiftConnection,
  NetSuiteConnection,
  ODBCConnection,
  BigQueryCredentials,
  PostgreSQLCredentials,
  SnowflakeCredentials,
  RedshiftCredentials,
  NetSuiteCredentials,
  ODBCCredentials
} from './types.js'

// Import clients (will be implemented in separate files)
import { BigQueryClient } from './bigquery-client.js'
import { PostgreSQLClient } from './postgresql-client.js'
import { SnowflakeClient } from './snowflake-client.js'
import { RedshiftClient } from './redshift-client.js'
import { NetSuiteClient } from './netsuite-client.js'
import { ODBCClient } from './odbc-client.js'

export class DataSourceClientFactory {
  private static instances: Map<string, DataSourceClient> = new Map()

  /**
   * Create a new data source client
   */
  static create(
    connection: DataSourceConnection,
    credentials: DataSourceCredentials
  ): DataSourceClient {
    switch (connection.type) {
      case 'bigquery':
        return new BigQueryClient(
          connection as BigQueryConnection,
          credentials as BigQueryCredentials
        )

      case 'postgresql':
        return new PostgreSQLClient(
          connection as PostgreSQLConnection,
          credentials as PostgreSQLCredentials
        )

      case 'snowflake':
        return new SnowflakeClient(
          connection as SnowflakeConnection,
          credentials as SnowflakeCredentials
        )

      case 'redshift':
        return new RedshiftClient(
          connection as RedshiftConnection,
          credentials as RedshiftCredentials
        )

      case 'netsuite':
        return new NetSuiteClient(
          connection as NetSuiteConnection,
          credentials as NetSuiteCredentials
        )

      case 'odbc':
        return new ODBCClient(
          connection as ODBCConnection,
          credentials as ODBCCredentials
        )

      case 'file':
        throw new Error('File data source does not use a client. Use FileManager instead.')

      default:
        throw new Error(`Unsupported data source type: ${(connection as DataSourceConnection).type}`)
    }
  }

  /**
   * Get or create a singleton client instance for a connection
   */
  static getOrCreate(
    connection: DataSourceConnection,
    credentials: DataSourceCredentials
  ): DataSourceClient {
    const existing = this.instances.get(connection.id)
    if (existing) {
      return existing
    }

    const client = this.create(connection, credentials)
    this.instances.set(connection.id, client)
    return client
  }

  /**
   * Get an existing client instance by connection ID
   */
  static get(connectionId: string): DataSourceClient | undefined {
    return this.instances.get(connectionId)
  }

  /**
   * Remove and disconnect a client instance
   */
  static async remove(connectionId: string): Promise<void> {
    const client = this.instances.get(connectionId)
    if (client) {
      client.disconnect()
      this.instances.delete(connectionId)
    }
  }

  /**
   * Clear all client instances
   */
  static async clearAll(): Promise<void> {
    for (const [id, client] of this.instances) {
      client.disconnect()
    }
    this.instances.clear()
  }

  /**
   * Check if a client exists for a connection
   */
  static has(connectionId: string): boolean {
    return this.instances.has(connectionId)
  }

  /**
   * Get all active connection IDs
   */
  static getActiveConnectionIds(): string[] {
    return Array.from(this.instances.keys())
  }
}

/**
 * Get the Python driver info for a data source type
 */
export function getDriverInfo(type: DataSourceType) {
  switch (type) {
    case 'bigquery':
      return {
        name: 'BigQuery',
        pythonPackage: 'google-cloud-bigquery',
        pythonImport: 'from google.cloud import bigquery',
        connectionTemplate: `client = bigquery.Client()`,
        queryTemplate: `df = client.query("""YOUR_QUERY""").to_dataframe()`
      }

    case 'postgresql':
      return {
        name: 'PostgreSQL',
        pythonPackage: 'psycopg2-binary',
        pythonImport: 'import psycopg2\nimport pandas as pd',
        connectionTemplate: `conn = psycopg2.connect(
    host=os.environ.get('PGHOST', '127.0.0.1'),
    port=os.environ.get('PGPORT', 5432),
    database=os.environ.get('PGDATABASE'),
    user=os.environ.get('PGUSER'),
    password=os.environ.get('PGPASSWORD')
)`,
        queryTemplate: `df = pd.read_sql("""YOUR_QUERY""", conn)`
      }

    case 'snowflake':
      return {
        name: 'Snowflake',
        pythonPackage: 'snowflake-connector-python',
        pythonImport: 'import snowflake.connector\nimport pandas as pd',
        connectionTemplate: `conn = snowflake.connector.connect(
    account=os.environ.get('SNOWFLAKE_ACCOUNT'),
    user=os.environ.get('SNOWFLAKE_USER'),
    password=os.environ.get('SNOWFLAKE_PASSWORD'),
    warehouse=os.environ.get('SNOWFLAKE_WAREHOUSE'),
    database=os.environ.get('SNOWFLAKE_DATABASE'),
    schema=os.environ.get('SNOWFLAKE_SCHEMA')
)`,
        queryTemplate: `cur = conn.cursor()
cur.execute("""YOUR_QUERY""")
df = cur.fetch_pandas_all()`
      }

    case 'redshift':
      return {
        name: 'Redshift',
        pythonPackage: 'redshift_connector',
        pythonImport: 'import redshift_connector\nimport pandas as pd',
        connectionTemplate: `conn = redshift_connector.connect(
    host=os.environ.get('REDSHIFT_HOST'),
    port=int(os.environ.get('REDSHIFT_PORT', 5439)),
    database=os.environ.get('REDSHIFT_DATABASE'),
    user=os.environ.get('REDSHIFT_USER'),
    password=os.environ.get('REDSHIFT_PASSWORD')
)`,
        queryTemplate: `df = pd.read_sql("""YOUR_QUERY""", conn)`
      }

    case 'netsuite':
      return {
        name: 'Oracle NetSuite',
        pythonPackage: 'requests_oauthlib',
        pythonImport: 'import requests\nfrom requests_oauthlib import OAuth1\nimport pandas as pd',
        connectionTemplate: `auth = OAuth1(
    os.environ.get('NETSUITE_CONSUMER_KEY'),
    os.environ.get('NETSUITE_CONSUMER_SECRET'),
    os.environ.get('NETSUITE_TOKEN_ID'),
    os.environ.get('NETSUITE_TOKEN_SECRET'),
    signature_method='HMAC-SHA256',
    realm=os.environ.get('NETSUITE_ACCOUNT_ID')
)
url = f"https://{os.environ.get('NETSUITE_ACCOUNT_ID', '').replace('_', '-').lower()}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql"`,
        queryTemplate: `response = requests.post(url, json={"q": """YOUR_QUERY"""}, auth=auth, headers={"Prefer": "transient"})
df = pd.DataFrame(response.json().get("items", []))`
      }

    case 'odbc':
      return {
        name: 'ODBC',
        pythonPackage: 'pyodbc',
        pythonImport: 'import pyodbc\nimport pandas as pd',
        connectionTemplate: `conn = pyodbc.connect(os.environ.get('ODBC_CONNECTION_STRING', ''))`,
        queryTemplate: `df = pd.read_sql("""YOUR_QUERY""", conn)`
      }

    case 'file':
      return {
        name: 'File',
        pythonPackage: 'pandas',
        pythonImport: 'import pandas as pd',
        connectionTemplate: '# No connection needed for files',
        queryTemplate: `df = pd.read_csv('FILE_PATH')  # or pd.read_excel() for Excel files`
      }

    default:
      throw new Error(`Unknown data source type: ${type}`)
  }
}
