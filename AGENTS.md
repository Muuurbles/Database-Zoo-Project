# Repository Guidelines

## Project Structure & Module Organization
This repository is a Node.js monorepo with separate backend and frontend apps.
- `backend/src`: Express + TypeScript API (`routes/`, `controllers/`, `services/`, `models/`, `middleware/`, `config/`).
- `frontend/src`: Next.js App Router UI (`app/` pages, `components/`, `services/`, `context/`, `hooks/`, `types/`).
- `scripts/`: repo-level helper scripts (`setup.js`, the one-command setup).
- `database/`: SQLite schema (tables, indexes, triggers) and seed data (`zoo_schema.sql`, `seed_data.sql`). The database file itself (`backend/data/zoo.db`) is created automatically and git-ignored.
- `.github/workflows/build.yml`: CI build pipeline.

## Build, Test, and Development Commands
Run commands from repository root unless noted.
- `npm run setup`: one-command first-time setup (installs everything, creates env files, creates the SQLite database with sample data). Safe to re-run.
- `npm run install:all`: install root, backend, and frontend dependencies only.
- `npm run dev`: run backend (`:5000`) and frontend (`:3000`) concurrently.
- `npm run build`: compile backend TypeScript and build frontend Next.js app.
- `cd backend && npm run lint`: lint backend TypeScript with ESLint.
- `cd frontend && npm run lint`: lint frontend with Next.js ESLint rules.
- `npm run db:reset`: stop the backend, then delete and rebuild the SQLite database with fresh sample data.
- `cd backend && npm run migrate-passwords`: run the password migration script.

## Coding Style & Naming Conventions
- Language: TypeScript across backend and frontend; both `tsconfig.json` files have `strict: true`.
- Indentation: 2 spaces; keep line length readable and avoid deeply nested logic.
- Backend naming: `*.controller.ts`, `*.service.ts`, `*.model.ts`, `*.routes.ts`.
- Frontend naming: PascalCase for React components (e.g., `CartSidebar.tsx`), kebab-case route folders under `app/`.
- Use existing ESLint configs via `npm run lint` before opening a PR.

## Testing Guidelines
There is currently no formal automated test suite configured (`test` scripts are absent). Until tests are added:
- Treat lint + build as required quality gates.
- Manually verify changed flows in both apps (API endpoint behavior and affected UI pages).
- For a disposable database, run the backend with `DB_PATH=:memory:` (schema + seed data are loaded automatically).
- If you add tests, colocate by feature and use `*.test.ts`/`*.test.tsx` naming.

## Commit & Pull Request Guidelines
Recent history mixes free-form and Conventional Commit-style messages; prefer Conventional Commits for new work:
- `feat: add animal health summary endpoint`
- `fix: prevent null stats crash in admin dashboard`

For PRs:
- Keep scope focused and explain behavioral impact.
- Link related issues/tasks.
- Include screenshots or short recordings for UI changes.
- Confirm `npm run build` and both lint commands pass locally before requesting review.
