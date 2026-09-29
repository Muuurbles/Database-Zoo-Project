import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { MutationResult } from '../types/database.types';

dotenv.config();

/**
 * SQLite access layer.
 *
 * The models and services were written against mysql2 (`query()`, `pool.getConnection()`,
 * `insertId`, `Date` objects for DATE/DATETIME columns...). This module keeps that surface
 * so they run unchanged on an embedded SQLite file:
 *
 *  - `query(sql, params)` returns rows for SELECTs and `{ insertId, affectedRows, changedRows }`
 *    for writes, exactly like mysql2 did.
 *  - `pool.getConnection()` hands out a connection with begin/commit/rollback/release.
 *  - DATE / DATETIME columns come back as `Date` objects and `Date` params are accepted.
 *  - SQLite constraint errors carry the MySQL error codes the controllers check
 *    (`ER_DUP_ENTRY`, `ER_NO_REFERENCED_ROW_2`, ...).
 *  - `NOW()` and `CURDATE()` are registered as SQL functions.
 *
 * better-sqlite3 is synchronous, so every "async" method here does its work immediately.
 */

// Where the database lives. `DB_PATH=:memory:` gives a throwaway in-memory database (handy for tests).
export const DB_PATH =
  process.env.DB_PATH === ':memory:'
    ? ':memory:'
    : path.resolve(process.env.DB_PATH || path.join(__dirname, '../../data/zoo.db'));

const SQL_DIR = path.resolve(__dirname, '../../../database');

// Enable query performance monitoring in development
const ENABLE_QUERY_LOGGING = process.env.NODE_ENV === 'development';
const SLOW_QUERY_THRESHOLD_MS = 100; // Log queries that take longer than 100ms

// ---------------------------------------------------------------------------
// Time handling
//
// The app runs on a fixed UTC-6 clock (Central Standard Time, no DST) - the same offset
// the MySQL pool was configured with. SQLite has no date types, so DATE / DATETIME values
// are stored as 'YYYY-MM-DD' / 'YYYY-MM-DD HH:MM:SS' text on that clock (zoo_schema.sql
// uses datetime('now', '-6 hours') for its defaults).
// ---------------------------------------------------------------------------

const DB_UTC_OFFSET_MS = -6 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');

const formatDbDateTime = (date: Date): string => {
  const d = new Date(date.getTime() + DB_UTC_OFFSET_MS);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
};

/**
 * Get current datetime as 'YYYY-MM-DD HH:mm:ss' in the app's UTC-6 timezone.
 * This ensures consistency across different environments regardless of the host's timezone.
 */
export const getCurrentDateTime = (): string => formatDbDateTime(new Date());

/** A Date's calendar day ('YYYY-MM-DD') on the app's UTC-6 clock. */
export const formatDbDate = (date: Date): string => formatDbDateTime(date).slice(0, 10);

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/;

/** Turn a stored 'YYYY-MM-DD[ HH:MM:SS]' string into a Date; anything else is returned untouched. */
const parseDbDate = (value: string): Date | string => {
  const m = DATE_TIME.exec(value) ?? DATE_ONLY.exec(value);
  if (!m) return value;
  const [y, mo, d, h = 0, mi = 0, s = 0] = m.slice(1).map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s) - DB_UTC_OFFSET_MS);
};

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;

/** Convert JS values that SQLite can't bind directly. */
const toBindable = (value: unknown): unknown => {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) throw new TypeError('Invalid Date passed as a query parameter');
    const formatted = formatDbDateTime(value);
    // A Date at exactly midnight is what a DATE column reads back as; keep it comparable to 'YYYY-MM-DD' text.
    return formatted.endsWith(' 00:00:00') ? formatted.slice(0, 10) : formatted;
  }
  // ISO instants (what the API itself sends for dates, e.g. '2026-09-29T06:00:00.000Z') are stored on
  // the app clock like a Date would be, so they compare and read back like every other date value.
  if (typeof value === 'string' && ISO_INSTANT.test(value)) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) return toBindable(date);
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  // better-sqlite3 binds every JS number as a double, which a text column would store as '62701.0'.
  if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value);
  return value;
};

// ---------------------------------------------------------------------------
// Errors: give SQLite constraint failures the MySQL codes the controllers look for
// ---------------------------------------------------------------------------

const translateError = (error: any, sql: string): any => {
  if (!error || typeof error.code !== 'string') return error;
  const isDelete = /^\s*DELETE\b/i.test(sql);
  let mysqlCode: string | undefined;

  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    mysqlCode = 'ER_DUP_ENTRY';
  } else if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    // SQLite doesn't say which side of the relationship failed; the statement type tells us.
    mysqlCode = isDelete ? 'ER_ROW_IS_REFERENCED_2' : 'ER_NO_REFERENCED_ROW_2';
  } else if (error.code === 'SQLITE_CONSTRAINT_NOTNULL') {
    mysqlCode = 'ER_BAD_NULL_ERROR';
  } else if (error.code === 'SQLITE_CONSTRAINT_CHECK') {
    mysqlCode = 'ER_CHECK_CONSTRAINT_VIOLATED';
  } else if (error.code === 'SQLITE_ERROR' && /no such column/i.test(error.message)) {
    mysqlCode = 'ER_BAD_FIELD_ERROR';
  }

  if (mysqlCode) {
    error.sqliteCode = error.code;
    error.code = mysqlCode;
    error.sqlMessage = error.message;
  }
  return error;
};

// ---------------------------------------------------------------------------
// Opening + initializing the database
// ---------------------------------------------------------------------------

const readSql = (file: string) => fs.readFileSync(path.join(SQL_DIR, file), 'utf8');

/**
 * Open a SQLite database with the app's connection settings. If it has no tables yet
 * (a brand-new file, or `:memory:`), create the schema and load the seed data.
 */
export const openDatabase = (dbPath: string = DB_PATH, { quiet = false } = {}): Database.Database => {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const conn = new Database(dbPath);
  conn.pragma('foreign_keys = ON'); // off by default in SQLite, and per-connection
  conn.pragma('recursive_triggers = OFF');
  conn.pragma('busy_timeout = 5000');
  if (dbPath !== ':memory:') {
    conn.pragma('journal_mode = WAL');
    conn.pragma('synchronous = NORMAL');
  }

  // The two MySQL date functions the queries rely on (evaluated on the app's UTC-6 clock).
  conn.function('NOW', () => getCurrentDateTime());
  conn.function('CURDATE', () => getCurrentDateTime().slice(0, 10));

  const initialized = conn
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'employees'")
    .get();
  if (!initialized) {
    conn.transaction(() => {
      conn.exec(readSql('zoo_schema.sql'));
      conn.exec(readSql('seed_data.sql'));
    })();
    if (dbPath !== ':memory:' && !quiet) {
      console.log(`🗄️  Created a new SQLite database with sample data at ${dbPath}`);
    }
  }

  return conn;
};

const db = openDatabase();

process.once('exit', () => {
  if (db.open) db.close();
});

/** Close the shared connection (used by scripts that need to replace the database file). */
export const closeDatabase = (): void => {
  if (db.open) db.close();
};

// ---------------------------------------------------------------------------
// query() / pool - the mysql2-shaped API
// ---------------------------------------------------------------------------

interface PreparedQuery {
  stmt: Database.Statement;
  /** Result columns that may hold dates: declared DATE/DATETIME/TIMESTAMP, or computed (e.g. MAX(feeding_time)). */
  dateColumns: string[];
}

const statementCache = new Map<string, PreparedQuery>();
const MAX_CACHED_STATEMENTS = 500;

const prepare = (sql: string): PreparedQuery => {
  let prepared = statementCache.get(sql);
  if (!prepared) {
    const stmt = db.prepare(sql);
    const dateColumns = new Set<string>();
    if (stmt.reader) {
      for (const column of stmt.columns()) {
        // `type` is the declared type of the source column, or null for computed expressions.
        if (column.type === null || /^(DATE|DATETIME|TIMESTAMP)$/i.test(column.type)) {
          dateColumns.add(column.name);
        } else {
          dateColumns.delete(column.name);
        }
      }
    }
    prepared = { stmt, dateColumns: [...dateColumns] };
    if (statementCache.size >= MAX_CACHED_STATEMENTS) statementCache.clear();
    statementCache.set(sql, prepared);
  }
  return prepared;
};

const run = (sql: string, params: unknown[] = []): any => {
  try {
    const { stmt, dateColumns } = prepare(sql);
    const bound = params.map(toBindable);

    if (stmt.reader) {
      const rows = stmt.all(...bound) as Record<string, unknown>[];
      if (dateColumns.length > 0) {
        for (const row of rows) {
          for (const name of dateColumns) {
            const value = row[name];
            if (typeof value === 'string') row[name] = parseDbDate(value);
          }
        }
      }
      return rows;
    }

    const info = stmt.run(...bound);
    const result: MutationResult = {
      affectedRows: info.changes,
      changedRows: info.changes,
      insertId: Number(info.lastInsertRowid),
    };
    return result;
  } catch (error) {
    throw translateError(error, sql);
  }
};

export const query = async <T = any>(sql: string, params?: any[]): Promise<T> => {
  const startTime = Date.now();

  try {
    const results = run(sql, params);
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
 * A connection for running several statements as one transaction. SQLite has a single
 * writer, so `pool.getConnection()` hands these out one at a time (see below).
 */
export class PoolConnection {
  private released = false;

  constructor(private readonly onRelease: () => void) {}

  async execute(sql: string, params?: any[]): Promise<[any, undefined]> {
    return [run(sql, params), undefined];
  }

  query(sql: string, params?: any[]): Promise<[any, undefined]> {
    return this.execute(sql, params);
  }

  async beginTransaction(): Promise<void> {
    db.exec('BEGIN');
  }

  async commit(): Promise<void> {
    if (db.inTransaction) db.exec('COMMIT');
  }

  async rollback(): Promise<void> {
    if (db.inTransaction) db.exec('ROLLBACK');
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    if (db.inTransaction) {
      console.warn('⚠️  Connection released with an open transaction - rolling it back');
      db.exec('ROLLBACK');
    }
    this.onRelease();
  }
}

// Transactions are serialized: the next getConnection() resolves once the previous connection is released.
let transactionQueue: Promise<void> = Promise.resolve();

export const pool = {
  execute: async (sql: string, params?: any[]): Promise<[any, undefined]> => [run(sql, params), undefined],
  query: async (sql: string, params?: any[]): Promise<[any, undefined]> => [run(sql, params), undefined],

  /**
   * Acquire the connection for a transaction. Always call `release()` (use try/finally).
   * While it is held, avoid awaiting real I/O (network, bcrypt...) inside the transaction:
   * queries made through `query()` from other requests would run inside it.
   */
  getConnection: async (): Promise<PoolConnection> => {
    const turn = transactionQueue;
    let unlock!: () => void;
    transactionQueue = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    await turn;
    return new PoolConnection(unlock);
  },
};

// ---------------------------------------------------------------------------
// Column whitelisting for models that build INSERT / UPDATE statements from request bodies
// ---------------------------------------------------------------------------

const tableColumnsCache = new Map<string, { columns: Set<string>; primaryKeys: Set<string>; notNull: Set<string> }>();

const tableColumns = (table: string) => {
  let info = tableColumnsCache.get(table);
  if (!info) {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string; pk: number; notnull: number }[];
    if (rows.length === 0) throw new Error(`Unknown table: ${table}`);
    info = {
      columns: new Set(rows.map((r) => r.name)),
      primaryKeys: new Set(rows.filter((r) => r.pk > 0).map((r) => r.name)),
      notNull: new Set(rows.filter((r) => r.notnull).map((r) => r.name)),
    };
    tableColumnsCache.set(table, info);
  }
  return info;
};

/**
 * Keep only the keys of `data` that are writable columns of `table`, so a request body can be
 * turned into `INSERT INTO t (keys...)` / `UPDATE t SET key = ?` without letting arbitrary text
 * into the SQL. Drops undefined values, the primary key, and `deleted_at` (soft deletes go
 * through the dedicated remove/restore methods).
 *
 * With `emptyToNull`, an empty string (a cleared form field) becomes NULL for nullable columns and
 * is dropped for NOT NULL ones.
 */
export const pickColumns = <T extends Record<string, any>>(
  table: string,
  data: T,
  { emptyToNull = false } = {}
): Partial<T> => {
  const { columns, primaryKeys, notNull } = tableColumns(table);
  const picked: Record<string, any> = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (value === undefined || !columns.has(key) || primaryKeys.has(key) || key === 'deleted_at') continue;
    if (emptyToNull && value === '') {
      if (!notNull.has(key)) picked[key] = null;
      continue;
    }
    picked[key] = value;
  }
  return picked as Partial<T>;
};

/**
 * Run `fn` inside a transaction on the shared connection: commit if it resolves, roll back if it
 * throws. Plain `query()` calls made by `fn` are part of the transaction. `fn` must not await real
 * I/O (bcrypt, network...) - do that before calling - or other requests' queries would run inside it.
 */
export const withTransaction = async <T>(fn: () => Promise<T>): Promise<T> => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn();
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Keep a login in step with an employee/customer email change. Usernames that were the old
 * email (every account created through the app) follow the new email too.
 */
export const syncAccountEmail = async (owner: 'employee_id' | 'customer_id', id: number, email: string): Promise<void> => {
  await query(
    `UPDATE user_accounts
     SET username = CASE WHEN username = email THEN ? ELSE username END,
         email = ?
     WHERE ${owner} = ?`,
    [email, email, id]
  );
};

export const testConnection = async (): Promise<boolean> => {
  try {
    db.prepare('SELECT 1').get();
    console.log(`✅ Database connected successfully (SQLite: ${DB_PATH})`);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
};

export default pool;
