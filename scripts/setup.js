#!/usr/bin/env node
/**
 * One-command project setup:  npm run setup
 *
 *   1. installs dependencies (root, backend, frontend)
 *   2. creates backend/.env (with a freshly generated JWT secret) and frontend/.env.local
 *   3. creates the SQLite database with sample data
 *
 * Safe to re-run: existing env files and an existing database are never overwritten.
 * Plain Node with no dependencies, so it works straight after a clone.
 */

const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REQUIRED_NODE_MAJOR = 22; // better-sqlite3 requires Node 22+

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < REQUIRED_NODE_MAJOR) {
  console.error(
    `\n✗ Node.js ${REQUIRED_NODE_MAJOR} or newer is required (you have ${process.versions.node}).\n` +
      `  Install it from https://nodejs.org, or run "nvm install && nvm use" (the repo has an .nvmrc).\n`
  );
  process.exit(1);
}

const step = (title) => console.log(`\n▶ ${title}`);

function npm(args, cwd) {
  // On Windows npm is a .cmd shim, which needs a shell to be spawned.
  const result = spawnSync('npm', args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    console.error(`\n✗ "npm ${args.join(' ')}" failed in ${path.relative(ROOT, cwd) || '.'}`);
    process.exit(result.status || 1);
  }
}

/** Copy `example` to `target` (optionally transforming it) unless `target` already exists. */
function createEnvFile(target, example, transform = (text) => text) {
  const rel = path.relative(ROOT, target);
  if (fs.existsSync(target)) {
    console.log(`  • ${rel} already exists - kept as is`);
    return;
  }
  fs.writeFileSync(target, transform(fs.readFileSync(example, 'utf8')));
  console.log(`  • created ${rel}`);
}

step('Installing dependencies (root, backend, frontend)');
for (const dir of ['.', 'backend', 'frontend']) {
  npm(['install'], path.join(ROOT, dir));
}

step('Creating environment files');
createEnvFile(path.join(ROOT, 'backend', '.env'), path.join(ROOT, 'backend', '.env.example'), (text) =>
  text.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${crypto.randomBytes(48).toString('hex')}`)
);
createEnvFile(path.join(ROOT, 'frontend', '.env.local'), path.join(ROOT, 'frontend', '.env.local.example'));

step('Setting up the database (schema + sample data)');
npm(['run', 'db:init'], path.join(ROOT, 'backend'));

console.log(`
✅ Setup complete. Start the app with:

    npm run dev

  Frontend: http://localhost:3000
  Backend:  http://localhost:5000

  Sign in with any account from the sample data (password: "password"), e.g.
    manager   sarah.johnson@zoo.com
    customer  maria.garcia@email.com

  To reset the database to fresh sample data later: npm run db:reset
`);
