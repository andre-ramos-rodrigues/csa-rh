import mysql from 'mysql2/promise';

// Prevent multiple connections in development mode due to Next.js HMR
const globalForDb = global as unknown as {
  connPool: mysql.Pool | undefined;
};

export const pool =
  globalForDb.connPool ||
  mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'totvs_rh',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 5000,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.connPool = pool;
}

/**
 * Helper function to execute SQL queries using the connection pool
 */
export async function query<T = any>(sql: string, params: any[] = []): Promise<T> {
  const [results] = await pool.execute(sql, params);
  return results as T;
}
