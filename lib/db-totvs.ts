import sql from 'mssql';

const globalForTotvsDb = global as unknown as {
  totvsPool: sql.ConnectionPool | undefined;
};

const config: sql.config = {
  server: process.env.TOTVS_DB_HOST || 'localhost',
  port: Number(process.env.TOTVS_DB_PORT) || 1433,
  user: process.env.TOTVS_DB_USER || 'sa',
  password: process.env.TOTVS_DB_PASSWORD || '',
  database: process.env.TOTVS_DB_NAME || 'CorporeRM',
  options: {
    encrypt: process.env.TOTVS_DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.TOTVS_DB_TRUST_CERT !== 'false',
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  connectionTimeout: 10000,
  requestTimeout: 15000,
};

function createTotvsPool(): sql.ConnectionPool {
  const pool = new sql.ConnectionPool(config);

  pool.on('error', (err) => {
    console.error('[TOTVS SQL Server Pool] Erro inesperado no pool:', err.message);
  });

  return pool;
}

export const totvsPool = globalForTotvsDb.totvsPool || createTotvsPool();

if (process.env.NODE_ENV !== 'production') {
  globalForTotvsDb.totvsPool = totvsPool;
}

/**
 * Garante uma conexão ativa de forma preguiçosa (Lazy Connection)
 */
export async function getTotvsConnection(): Promise<sql.ConnectionPool> {
  if (totvsPool.connected) {
    return totvsPool;
  }
  if (totvsPool.connecting) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return totvsPool;
  }
  return await totvsPool.connect();
}

/**
 * Alias de retrocompatibilidade para arquivos antigos que usam `await totvsPoolConnect;`
 */
export const totvsPoolConnect: PromiseLike<sql.ConnectionPool> = {
  then(onfulfilled, onrejected) {
    return getTotvsConnection().then(onfulfilled, onrejected);
  },
};

/**
 * Helper para executar queries simples diretamente
 */
export async function queryTotvs<T = any>(
  queryText: string,
  params: Record<string, any> = {}
): Promise<T> {
  const pool = await getTotvsConnection();
  const request = pool.request();

  for (const [key, value] of Object.entries(params)) {
    request.input(key, value);
  }

  const result = await request.query(queryText);
  return result.recordset as T;
}