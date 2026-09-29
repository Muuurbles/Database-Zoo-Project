# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A full-stack Zoo Management System for managing animals, staff, customers, tickets, events, facilities, cafes, and gift shops. Built with Next.js (frontend), Express/TypeScript (backend), and SQLite (database).

**Tech Stack:**
- Frontend: Next.js 14, React 18, TypeScript, TailwindCSS, React Query
- Backend: Express, TypeScript, better-sqlite3, JWT auth, Brevo (emails), node-cron (scheduled jobs)
- Database: SQLite (embedded; a single file at `backend/data/zoo.db`, created and seeded automatically on first start)

## Development Commands

### Initial Setup
```bash
# One command after cloning: installs root/backend/frontend dependencies, creates
# backend/.env (random JWT secret) and frontend/.env.local, and creates the SQLite
# database with sample data. Safe to re-run - never overwrites existing env files or data.
npm run setup
```

`npm run install:all` only installs dependencies. The SQLite file is also created automatically the first time the backend starts, so `setup` is a convenience rather than a requirement.

### Running the Application
```bash
# Run both servers concurrently (from root)
npm run dev

# Run backend only (from backend/)
npm run dev

# Run frontend only (from frontend/)
npm run dev
```

### Building
```bash
# Build both projects
npm run build

# Build backend (TypeScript compilation to dist/)
cd backend && npm run build

# Build frontend (Next.js build)
cd frontend && npm run build
```

### Linting
```bash
# Lint backend
cd backend && npm run lint

# Lint frontend
cd frontend && npm run lint
```

### Production
```bash
# Start backend (requires build first)
cd backend && npm start

# Start frontend (requires build first)
cd frontend && npm start
```

### Utilities
```bash
# Delete the SQLite file and rebuild it from database/zoo_schema.sql + seed_data.sql
# (stop the backend first; also works as `npm run db:reset` inside backend/)
npm run db:reset

# Clean all node_modules and build artifacts
npm run clean
```

## Architecture

### Backend Structure

**Layered Architecture:**
- `routes/` - Express route definitions, grouped by resource
- `controllers/` - Request handling and response formatting
- `services/` - Business logic and database queries
- `models/` - Database query builders (not ORMs)
- `middleware/` - Auth, validation, error handling
- `types/` - TypeScript type definitions
- `utils/` - Helper functions (JWT, validation, query building)
- `config/` - Database connection, auth config
- `jobs/` - Cron jobs for scheduled tasks

**Key Patterns:**
- All routes mounted in `server.ts` with `/api` prefix
- JWT-based authentication via `protect` and `optionalAuth` middleware
- Role-based access control using `restrictTo()` middleware (checks `job_role` field)
- Database queries use raw SQL through `config/database.ts` (better-sqlite3 behind a mysql2-shaped `query()` / `pool` API; no ORM)
- Error handling centralized in `error.middleware.ts`

**User System:**
- Two user types: `employee` (with `job_role`) and `customer`
- User roles defined in `types/role.types.ts`: manager, keeper, veterinarian, coordinator, cashier, guide, maintenance, security, other
- Auth middleware attaches full user object (including employee/customer details) to `req.user`

**Email System:**
- Configured via `MAIL_SERVICE` env var: "none" (default - no emails, no network needed), "ethereal" (test inbox, needs internet), "smtp" or "api" (Brevo, production)
- Mail service initialized in `services/mailService.ts`; `isMailEnabled()` reports whether a mailer is ready
- When email is enabled, two cron jobs run every 8 seconds (they are not started when `MAIL_SERVICE=none`, because they mark notifications/alerts as handled once emailed):
  - `jobs/notification-email.job.ts` - processes pending notification emails
  - `jobs/animal-alert.job.ts` - processes animal health alerts

### Frontend Structure

**App Router (Next.js 14):**
- `app/` - File-based routing with React Server Components
  - `admin/` - Employee admin dashboard (animals, events, tickets, queries, etc.)
  - `customer/` - Customer portal (profile, purchases)
  - Public pages: home, login, register, exhibits, events, tickets, membership, cafe, gift-shop, checkout

**Key Directories:**
- `components/` - Reusable UI components
  - `components/ui/` - Base UI primitives (button, input, modal, table, etc.)
  - `components/admin/` - Admin-specific forms and widgets
  - `components/reports/` - Financial report sections
- `context/` - React Context providers
  - `AuthContext.tsx` - Authentication state, login/logout, role checking
  - `CartContext.tsx` - Shopping cart state
- `services/` - API client wrappers for backend endpoints
- `lib/` - Utilities
  - `api.ts` - Axios client with auth interceptor
  - `utils.ts` - Helper functions
- `types/` - TypeScript interfaces

**State Management:**
- React Context for global state (auth, cart)
- React Query (@tanstack/react-query) for server state
- Form state is component `useState` with hand-written validation (no form library)

**API Communication:**
- Centralized Axios instance in `lib/api.ts`
- Request interceptor adds JWT token from localStorage
- Response interceptor handles 401 (unauthorized) by redirecting to login
- All services import `apiClient` and make typed requests

**Authentication Flow:**
- JWT token stored in localStorage
- `AuthContext` provides `user`, `login`, `logout`, `hasRole` throughout app
- `hasRole()` checks both primary role (`employee`/`customer`) and employee `job_role`
- Protected routes redirect based on role (employees → `/admin`, customers → `/customer`)

### Database

**Schema Files:**
- `database/zoo_schema.sql` - Tables, indexes and triggers (SQLite)
- `database/seed_data.sql` - Initial data (dates are relative to "today")

**Connection:**
- Backend opens the database in `config/database.ts` (better-sqlite3). `DB_PATH` overrides the location; `DB_PATH=:memory:` gives a throwaway seeded database for tests
- If the file has no tables yet, the schema and seed data are applied automatically
- The app runs on a fixed UTC-6 clock (Central Standard Time, no DST): SQLite defaults use `datetime('now', '-6 hours')`, and `config/database.ts` converts DATE/DATETIME columns to `Date` objects on that clock
- Server-side logic that used to live in MySQL: the animal-health, membership-expiry and event-cancellation **triggers** are in `zoo_schema.sql`; the membership **auto-renewal** (formerly a stored procedure + EVENT) is `jobs/membership-renewal.job.ts`

## Test Accounts

All test account passwords are `password`:
- **Manager**: sarah.johnson@zoo.com
- **Keeper**: mike.chen@zoo.com
- **Veterinarian**: emily.rodriguez@zoo.com or skyjones.vet@gmail.com
- **Coordinator**: david.kim@zoo.com
- **Cashier**: lisa.thompson@zoo.com
- **Customer**: maria.garcia@email.com or john.smith@email.com

## Important Implementation Details

### Adding New Features

When adding backend endpoints:
1. Define types in `backend/src/types/`
2. Create model queries in `backend/src/models/`
3. Implement business logic in `backend/src/services/`
4. Add controller in `backend/src/controllers/`
5. Define routes in `backend/src/routes/`
6. Import and mount route in `server.ts`

When adding frontend features:
1. Define types in `frontend/src/types/`
2. Create service methods in `frontend/src/services/`
3. Build UI components in `frontend/src/components/`
4. Create page in `frontend/src/app/`

### Role-Based Access

Backend uses `restrictTo('manager', 'keeper')` middleware to limit access by `job_role`.
Frontend uses `useAuth().hasRole(['manager', 'keeper'])` to conditionally render UI.

The role check logic:
- First checks primary role (`employee` or `customer`)
- Then checks `job_role` for employees
- Example: `hasRole('keeper')` returns true for employees with `job_role: 'keeper'`

### Soft Deletes

Many entities support soft deletion (set `is_deleted = true` instead of removing records).
Admin pages typically include a "Show Deleted" toggle to view/restore deleted items.

### Image Handling

Images stored as URLs (not uploaded files). Backend accepts URLs up to 5MB in JSON payloads.
Frontend uses `ImageUpload` component for image URL input and `ImageLoader` for display.

### Notifications

Customer notifications stored in `notifications` table with types: 'info', 'warning', 'alert' (a CHECK constraint rejects anything else).
Displayed via `NotificationBanner` component. Cron job sends unsent notifications via email every 8 seconds.

### Scheduled Jobs

Two cron jobs run on backend startup (every 8 seconds):
- Notification emails: processes pending customer notifications
- Animal alerts: sends health alerts to veterinarians

A third job, `jobs/membership-renewal.job.ts`, auto-renews memberships that expire today (daily at midnight on the app's UTC-6 clock, plus once at startup to catch up). It replaces the MySQL stored procedure + EVENT of the same purpose.

Jobs use `node-cron` and are started in `server.ts` via `startAnimalAlertEmailJob()`, `startNotificationEmailJob()` and `startMembershipRenewalJob()`.

## Development Tips

### Working with the Database
- Use `backend/src/config/database.ts` `query()` function for all database operations
- Always parameterize queries to prevent SQL injection: `query('SELECT * FROM users WHERE id = ?', [userId])`
- Database timezone is a fixed UTC-6 (Central Time)
- Write SQLite SQL: `||` instead of `CONCAT()`, `date(x, '+1 year')` / `datetime(x, '-24 hours')` instead of `DATE_ADD` / `DATE_SUB`, `strftime('%Y', x)` instead of `YEAR(x)`, and single quotes for string literals (double-quoted strings are errors). `NOW()` and `CURDATE()` are registered as SQL functions and available in queries
- Money columns are `REAL` and integer columns divide as integers - write `x * 100.0 / y`, not `x / y * 100`
- Text columns are `COLLATE NOCASE`, so `=` comparisons and UNIQUE constraints are case-insensitive like MySQL was
- Insert with explicit column lists (`INSERT INTO t (a, b) VALUES (?, ?)`); MySQL's `INSERT ... SET ?` shorthand is not supported
- Constraint errors carry MySQL-style codes (`ER_DUP_ENTRY`, `ER_NO_REFERENCED_ROW_2`, ...) so controllers can keep checking `error.code`
- Models that build `INSERT`/`UPDATE` column lists from a request body must pass it through `pickColumns(table, data)` first (`config/database.ts`): it keeps only real, writable columns so body keys never reach the SQL text
- Multi-statement writes go in `withTransaction(async () => { ... })` (or `pool.getConnection()`); hash passwords or do other real I/O *before* opening the transaction
- ISO timestamps with a `Z`/offset passed as query parameters are converted to the app's UTC-6 clock, like `Date` objects are
- Checkout prices every item on the server (item rows, or `config/pricing.ts` for tickets and memberships); only the donation amount comes from the cart. Keep `config/pricing.ts` in step with the prices shown in `frontend/src/app/tickets/page.tsx` and `membership/page.tsx`
- Event cancellation = soft-deleting the event; the `/api/event-cancellations` logs are derived from cancelled events (there is no log table), and cancelled events can't be restored

### Authentication Development
- Use test accounts for development
- Backend `/api/auth/login` returns `{ success, data: { user, token } }`
- Frontend stores token in localStorage and includes in requests via Authorization header
- `protect` middleware required on authenticated routes
- `optionalAuth` middleware exists for routes that work with or without auth (no route uses it today; checkout requires `protect`)

### Frontend Development
- Pages in `app/admin/` automatically wrapped by `admin/layout.tsx` (includes Sidebar, TopBar)
- Use `useAuth()` hook to access current user and check roles
- API calls should use service methods (e.g., `animalService.getAll()`) not direct axios
- Forms keep their state in `useState` and validate by hand before submitting

### Email Testing
- Emails are off by default (`MAIL_SERVICE="none"`)
- Set `MAIL_SERVICE="ethereal"` in backend `.env` for test emails (needs internet; the server still starts if it is unreachable, with emails disabled)
- Set `MAIL_SERVICE="api"` (or `"smtp"`) with valid Brevo credentials for production emails
- Email templates in `services/mailService.ts`
