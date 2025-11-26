import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Enable query performance monitoring in development
const ENABLE_QUERY_LOGGING = process.env.NODE_ENV === 'development';
const SLOW_QUERY_THRESHOLD_MS = 100; // Log queries that take longer than 100ms

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // UTC-6 (Central Standard Time) for all connections
  timezone: '-06:00',
});

export const query = async <T = any>(sql: string, params?: any[]): Promise<T> => {
  const startTime = Date.now();

  try {
    const [results] = await pool.execute(sql, params);
    const executionTime = Date.now() - startTime;

    // Log slow queries in development
    if (ENABLE_QUERY_LOGGING && executionTime > SLOW_QUERY_THRESHOLD_MS) {
      console.warn(`⚠️  SLOW QUERY (${executionTime}ms):`, sql.substring(0, 100) + '...');
      if (params) console.warn('   Parameters:', params);
    }

    return results as T;
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error(`❌ QUERY FAILED (${executionTime}ms):`, sql.substring(0, 100) + '...');
    if (params) console.error('   Parameters:', params);
    throw error;
  }
};

/**
 * Get current datetime in MySQL format (YYYY-MM-DD HH:mm:ss) in UTC-6 timezone
 * This ensures consistency across different environments
 * Must be used instead of CURRENT_TIMESTAMP since DB server may be in different timezone
 */
export const getCurrentDateTime = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

export const testConnection = async (): Promise<boolean> => {
  try {
    await pool.getConnection();
    console.log('✅ Database connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
};

export default pool;
