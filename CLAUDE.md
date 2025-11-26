# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A full-stack Zoo Management System for managing animals, staff, customers, tickets, events, facilities, cafes, and gift shops. Built with Next.js (frontend), Express/TypeScript (backend), and MySQL (database).

**Tech Stack:**
- Frontend: Next.js 14, React 18, TypeScript, TailwindCSS, React Query, Zod
- Backend: Express, TypeScript, MySQL2, JWT auth, Brevo (emails), node-cron (scheduled jobs)
- Database: MySQL with Railway hosting

## Development Commands

### Initial Setup
```bash
# Install all dependencies (root, backend, frontend)
npm run install:all

# Configure environment variables
cd backend && cp .env.example .env
cd frontend && cp .env.local.example .env.local
```

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
- Database queries use raw SQL with `mysql2` connection pool (no ORM)
- Error handling centralized in `error.middleware.ts`

**User System:**
- Two user types: `employee` (with `job_role`) and `customer`
- User roles defined in `types/role.types.ts`: manager, keeper, veterinarian, coordinator, cashier, guide, maintenance, security, other
- Auth middleware attaches full user object (including employee/customer details) to `req.user`

**Email System:**
- Configured via `MAIL_SERVICE` env var: "ethereal" (test) or "brevo" (production)
- Mail service initialized in `services/mailService.ts`
- Two cron jobs run every 8 seconds:
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
- Form state via react-hook-form + Zod validation

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
- `database/zoo_schema.sql` - Table definitions
- `database/seed_data.sql` - Initial data

**Connection:**
- Backend connects via `config/database.ts` using `mysql2/promise`
- Shared Railway database configured in `.env.example` (works out of box)
- Central Standard Time (UTC-6) configured via `TZ=Etc/GMT+6`

## Test Accounts

All test account passwords are `password`:
- **Manager**: sarah.johnson@zoo.com
- **Keeper**: mike.chen@zoo.com
- **Veterinarian**: emily.rodriguez@zoo.com or skyjones.vet@gmail.com
- **Coordinator**: david.kim@zoo.com
- **Cashier**: lisa.thompson@zoo.com
- **Customer**: maria.garcia@email.com or john.smth@email.com

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

Customer notifications stored in `notifications` table with types: 'info', 'warning', 'success', 'error'.
Displayed via `NotificationBanner` component. Cron job sends unsent notifications via email every 8 seconds.

### Scheduled Jobs

Two cron jobs run on backend startup (every 8 seconds):
- Notification emails: processes pending customer notifications
- Animal alerts: sends health alerts to veterinarians

Jobs use `node-cron` and are started in `server.ts` via `startAnimalAlertEmailJob()` and `startNotificationEmailJob()`.

## Development Tips

### Working with the Database
- Use `backend/src/config/database.ts` `query()` function for all database operations
- Always parameterize queries to prevent SQL injection: `query('SELECT * FROM users WHERE id = ?', [userId])`
- Database timezone is UTC-6 (Central Time)

### Authentication Development
- Use test accounts for development
- Backend `/api/auth/login` returns `{ success, data: { user, token } }`
- Frontend stores token in localStorage and includes in requests via Authorization header
- `protect` middleware required on authenticated routes
- `optionalAuth` middleware for routes that work with or without auth (e.g., checkout)

### Frontend Development
- Pages in `app/admin/` automatically wrapped by `admin/layout.tsx` (includes Sidebar, TopBar)
- Use `useAuth()` hook to access current user and check roles
- API calls should use service methods (e.g., `animalService.getAll()`) not direct axios
- Forms use react-hook-form + Zod schemas for validation

### Email Testing
- Set `MAIL_SERVICE="ethereal"` in backend `.env` for test emails (logs credentials to console)
- Set `MAIL_SERVICE="brevo"` with valid API key for production emails
- Email templates in `services/mailService.ts`
