/**
 * Reset Database Script
 *
 * Deletes the SQLite database file and rebuilds it from database/zoo_schema.sql
 * and database/seed_data.sql. Stop the backend first, otherwise it keeps using
 * the old file.
 *
 * Usage: npm run db:reset
 */

import fs from 'fs';
import { DB_PATH, closeDatabase, openDatabase } from '../config/database';

if (DB_PATH === ':memory:') {
  console.log('DB_PATH is ":memory:" - there is no database file to reset.');
  process.exit(0);
}

// Importing the database module opened the shared connection; release the file before deleting it.
closeDatabase();

for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(DB_PATH + suffix, { force: true });
}

// Opening a database with no tables creates the schema and loads the seed data.
openDatabase(DB_PATH, { quiet: true }).close();

console.log(`✅ Database reset with fresh sample data: ${DB_PATH}`);
