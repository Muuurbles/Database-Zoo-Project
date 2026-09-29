# Zoo Database Management System

A web-based database system for managing zoo operations including animals, staff, customers, ticket sales, events, and facilities. Built with node.js, React, and SQLite.

## Setup

### Prerequisites
- Node.js (v22+) - the repo has an `.nvmrc`, so `nvm install && nvm use` gets the right version
- npm (v10+)
- Git

There is no database server to install: the app uses an embedded SQLite database.

### Installation

1. Clone the repo:
```bash
git clone https://github.com/DylanMiller765/Zoo-Database-Uma-Project
cd Zoo-Database-Uma-Project
```

2. Set everything up with one command:
```bash
npm run setup
```
This installs the dependencies (root, backend and frontend), creates `backend/.env` (with a freshly generated JWT secret) and `frontend/.env.local`, and creates the database with sample data. It is safe to re-run: existing env files and an existing database are never overwritten.

Emails are turned off by default (`MAIL_SERVICE="none"` in `backend/.env`), so the app needs no network access or accounts. To send emails, set `MAIL_SERVICE` to `ethereal` (fake test inbox), `smtp` or `api` (Brevo, needs a Brevo API key) in `backend/.env`.

3. Run the application by starting both servers with (in the root of the project):

```bash
npm run dev
```

This starts:
- Backend: http://localhost:5000
- Frontend: http://localhost:3000

### Database

The database is a single SQLite file, `backend/data/zoo.db`. The first time the backend starts it creates the file from `database/zoo_schema.sql` and loads the sample data in `database/seed_data.sql`, so there is nothing to set up.

- **Start over with fresh sample data:** stop the backend, then run `npm run db:reset` (from the project root or `backend/`).
- **Use a different file:** set `DB_PATH` in `backend/.env`. `DB_PATH=:memory:` gives a throwaway in-memory database, handy for tests.
- **Inspect it:** open `backend/data/zoo.db` with the `sqlite3` CLI or any SQLite viewer (e.g. DB Browser for SQLite).

### Test Accounts

All passwords are `password`:
- **Manager**: sarah.johnson@zoo.com
- **Keeper**: mike.chen@zoo.com
- **Veterinarian**: emily.rodriguez@zoo.com or skyjones.vet@gmail.com
- **Coordinator**: david.kim@zoo.com
- **Cashier**: lisa.thompson@zoo.com
- **Customer**: maria.garcia@email.com or john.smith@email.com or create new account

## Security Features

This project implements production-grade security measures:

### Authentication & Authorization
- **Bcrypt Password Hashing**: Passwords hashed with bcrypt (10 rounds) before storage - never stored in plain text
- **JWT Authentication**: Secure token-based authentication with configurable expiration
- **Role-Based Access Control**: Granular permissions based on user roles (manager, keeper, veterinarian, etc.)
- **Rate Limiting**:
  - API endpoints: 1000 requests per 15 minutes per IP
  - Login attempts: 50 attempts per 15 minutes per IP (successful logins don't count)
  - Registration: 20 accounts per hour per IP

### Database Security
- **Parameterized Queries**: All database queries use prepared statements to prevent SQL injection
- **Foreign Keys Enforced**: Referential integrity is checked by the database on every connection
- **Soft Deletes**: Sensitive data preserved for audit trails, not permanently deleted
- **Database Transactions**: Critical operations (checkout, payments) use ACID transactions for data integrity

### Payment Processing
**Note**: This student project does not store credit card information. In a production environment, payment processing would integrate with:
- **Stripe** (recommended) - PCI-compliant tokenization & processing
- **Braintree** - PayPal-backed payment gateway
- **Square** - Unified payment platform

Current implementation simulates payment flow for demonstration purposes only.

## Performance Optimizations

### Backend Performance
- **Database Indexing**: 20+ indexes on frequently queried columns
  - Soft delete columns (`deleted_at`)
  - Date range queries (`purchase_date`, `sale_timestamp`)
  - Foreign key relationships
  - Health status and active status combinations
- **Embedded Database**: SQLite in WAL mode - no network hop to a database server, and readers don't block the writer
- **Database Transactions**: Atomic operations ensure all-or-nothing guarantee for checkout
- **Optimized Queries**: Composite indexes reduce query times by up to 80%

### Frontend Performance
- **React Query**: Client-side caching and request deduplication
  - Automatic background refetching
  - Stale-while-revalidate pattern
  - 60+ lines of boilerplate code eliminated per page
  - Cached data persists across page navigation
- **Lazy Loading**: Images loaded on-demand with loading states
- **Code Splitting**: Next.js automatic route-based code splitting

### Caching Strategy
- Dashboard stats: 2 minute cache
- Animal/habitat data: 5 minute cache
- Recent activity: 1 minute cache
- User data: Cache until mutation
