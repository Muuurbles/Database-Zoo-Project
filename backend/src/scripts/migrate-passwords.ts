/**
 * Password Migration Script
 *
 * This script migrates existing plain-text passwords to bcrypt hashes.
 * Run this ONCE after deploying bcrypt password hashing.
 *
 * Usage: npm run migrate-passwords
 */

import bcrypt from 'bcryptjs';
import { query } from '../config/database';
import dotenv from 'dotenv';

dotenv.config();

async function migratePasswords() {
  console.log('🔒 Starting password migration to bcrypt...\n');

  try {
    // Get all passwords from database
    const passwords = await query<any[]>('SELECT password_id, account_id, password_hash FROM passwords');

    console.log(`Found ${passwords.length} passwords to migrate\n`);

    let migrated = 0;
    let skipped = 0;

    for (const record of passwords) {
      // Check if password is already hashed (bcrypt hashes start with $2b$)
      if (record.password_hash.startsWith('$2b$')) {
        console.log(`✓ Password for account ${record.account_id} already hashed - skipping`);
        skipped++;
        continue;
      }

      // Hash the plain text password
      const hashedPassword = await bcrypt.hash(record.password_hash, 10);

      // Update the database
      await query(
        'UPDATE passwords SET password_hash = ? WHERE password_id = ?',
        [hashedPassword, record.password_id]
      );

      console.log(`✓ Migrated password for account ${record.account_id}`);
      migrated++;
    }

    console.log('\n' + '='.repeat(50));
    console.log(`✅ Migration complete!`);
    console.log(`   Migrated: ${migrated} passwords`);
    console.log(`   Skipped: ${skipped} passwords (already hashed)`);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

migratePasswords();
