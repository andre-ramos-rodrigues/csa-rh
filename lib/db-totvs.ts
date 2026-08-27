import sql from 'mssql';

// Prevent multiple connection pools during Next.js HMR in development
const globalForTotvsDb = global as unknown as {
  totvsPool: sql.ConnectionPool | undefined;
  totvsPoolPromise: Promise<sql.ConnectionPool> | undefined;
};

const config: sql.config = {
  server: process.env.TOTVS_DB_HOST || 'localhost',
  port: Number(process.env.TOTVS_DB_PORT) || 1433,
  user: process.env.TOTVS_DB_USER || 'sa',
  password: process.env.TOTVS_DB_PASSWORD || '',
  database: process.env.TOTVS_DB_NAME || 'CorporeRM',
  options: {
    // Necessário para SQL Server local/on-premise sem certificado válido (comum em ambientes TOTVS)
    encrypt: process.env.TOTVS_DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.TOTVS_DB_TRUST_CERT !== 'false',
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  connectionTimeout: 5000,
  requestTimeout: 15000,
};

function createTotvsPool(): sql.ConnectionPool {
  const pool = new sql.ConnectionPool(config);

  // CRÍTICO: sem esse listener, um erro de conexão derruba o processo Node
  // com uma exceção não tratada (mesmo problema que tínhamos com mysql2).
  pool.on('error', (err) => {
    console.error('[TOTVS SQL Server Pool] Unexpected pool error:', err.message);
  });

  return pool;
}

export const totvsPool = globalForTotvsDb.totvsPool || createTotvsPool();

// mssql exige connect() explícito antes de usar o pool — cacheamos a Promise
// de conexão para não abrir múltiplas conexões em paralelo no HMR do Next.js
export const totvsPoolConnect =
  globalForTotvsDb.totvsPoolPromise || totvsPool.connect();

if (process.env.NODE_ENV !== 'production') {
  globalForTotvsDb.totvsPool = totvsPool;
  globalForTotvsDb.totvsPoolPromise = totvsPoolConnect;
}

/**
 * Execute query against the TOTVS SQL Server Database Pool
 */
export async function queryTotvs<T = any>(
  queryText: string,
  params: Record<string, any> = {}
): Promise<T> {
  await totvsPoolConnect;
  const request = totvsPool.request();

  for (const [key, value] of Object.entries(params)) {
    request.input(key, value);
  }

  const result = await request.query(queryText);
  return result.recordset as T;
}