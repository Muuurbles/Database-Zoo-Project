/**
 * Init Database Script
 *
 * Makes sure the SQLite database exists. If there is no database yet, the schema
 * and sample data are created (importing the database module does that). An existing
 * database is left untouched - use `npm run db:reset` to start over.
 *
 * Usage: npm run db:init
 */

import { DB_PATH, closeDatabase } from '../config/database';

closeDatabase();

console.log(`✅ Database ready: ${DB_PATH}`);
