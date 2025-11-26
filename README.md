# Zoo Database Management System

A web-based database system for managing zoo operations including animals, staff, customers, ticket sales, events, and facilities. Built with node.js, React, and MySQL.

## Setup

### Prerequisites
- Node.js (v18+)
- npm (v8+)
- Git

### Installation

1. Clone the repo:
```bash
git clone https://github.com/DylanMiller765/Zoo-Database-Uma-Project
cd Zoo-Database-Uma-Project
```

2. Install dependencies:
```bash
npm run install:all
```

3. Configure environment variables:

**Backend** (`backend/.env`):
```bash
cd backend
cp .env.example .env
```
The default values connect to the shared Railway database and work out of the box. Note: Brevo is used to send emails, and works in the hosted version of the website. To send emails with a local build, you need to add a brevo API key to the .env

**Frontend** (`frontend/.env.local`):
```bash
cd frontend
cp .env.local.example .env.local
```
Make sure it points to `http://localhost:5000/api`

4. Run the application by starting both servers with (in the root of the project):

```bash
npm run dev
```

This starts:
- Backend: http://localhost:5000
- Frontend: http://localhost:3000

### Test Accounts

All passwords are `password`:
- **Manager**: sarah.johnson@zoo.com
- **Keeper**: mike.chen@zoo.com
- **Veterinarian**: emily.rodriguez@zoo.com or skyjones.vet@gmail.com
- **Coordinator**: david.kim@zoo.com
- **Cashier**: lisa.thompson@zoo.com
- **Customer**: maria.garcia@email.com or john.smth@email.com or create new account

## Security Features

This project implements production-grade security measures:

### Authentication & Authorization
- **Bcrypt Password Hashing**: Passwords hashed with bcrypt (10 rounds) before storage - never stored in plain text
- **JWT Authentication**: Secure token-based authentication with configurable expiration
- **Role-Based Access Control**: Granular permissions based on user roles (manager, keeper, veterinarian, etc.)
- **Rate Limiting**:
  - API endpoints: 100 requests per 15 minutes per IP
  - Login attempts: 5 attempts per 15 minutes per IP (successful logins don't count)
  - Registration: 3 accounts per hour per IP

### Database Security
- **Parameterized Queries**: All database queries use prepared statements to prevent SQL injection
- **Connection Pooling**: Secure connection management with configurable limits (10 local, 25 production)
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
- **Connection Pooling**: 25 concurrent database connections (production), 10 (development)
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
