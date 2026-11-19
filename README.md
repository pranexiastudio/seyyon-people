# Seyyon People

Commercial multi-tenant HRMS in local development. Infrastructure and the authentication module are implemented. Company onboarding and HR modules remain future work. No production deployment is configured or performed.

## Requirements

Node 22.12+ (22.x), npm 10+, Docker Desktop with Linux containers and Compose. Local psql is optional.

## Local setup

1. Run `npm install`.
2. Run `npm run setup:env` to create .env with random local credentials. Existing .env files are preserved.
3. Start Docker Desktop, then run `docker compose up -d --wait`.
4. Run `npm run db:generate`.
5. Run `npm run db:migrate` to apply the initial schema, runtime grants, and RLS.
6. Run `npm run dev`.

Web: http://localhost:5173. API: http://localhost:4000/api/v1/health/live.
Readiness: http://localhost:4000/api/v1/health/ready returns 503 when PostgreSQL is unavailable. The login page is at http://localhost:5173/login. Use this exact hostname to match WEB_ORIGIN and the cookie/Origin boundary.

Separate terminals: `npm run dev:web` and `npm run dev:api`.
Verification: `npm run db:validate`, `npm run typecheck`, `npm test`, `npm run build`.
Database security integration tests: `npm run test:db -w @seyyon/api` after migrations. These create and remove uniquely identified test records; use a disposable local database only.
Built API: `npm run start -w @seyyon/api`. Web preview: `npm run preview -w @seyyon/web`. Production needs a reverse proxy serving the web with SPA fallback and routing /api to the API.

## Workspace

- apps/web: React, Vite, Tailwind v4, shadcn-compatible components, Router, TanStack Query.
- apps/api: Express, configuration validation, JWT verification, tenant transaction boundary, audit helpers, health routes.
- packages/shared: Zod contracts and shared types.
- packages/config: strict TypeScript base.
- prisma: schema, migrations, RLS.
- scripts: local environment generation and database role initialization.
- docs: architecture, database design, security, roadmap.

Login uses React Hook Form and shared Zod validation. Redis is configured; BullMQ and Puppeteer will be installed when job and PDF requirements are implemented.

## Database operations

DIRECT_URL is the migration owner; DATABASE_URL is the restricted runtime role. Never run the API with DIRECT_URL. Compose initializes the runtime role only on a new volume. Changing .env passwords does not rotate existing database or Redis credentials automatically; rotate them explicitly and update connection strings. Preserve volumes containing data. `docker compose stop` stops services without deleting data.

PostgreSQL binds to local port 55432 by default. To change it, set POSTGRES_PORT and update both database URLs to match. Redis uses local port 6379.

If a managed Windows network produces UNABLE_TO_VERIFY_LEAF_SIGNATURE, use `$env:NODE_OPTIONS='--use-system-ca'` in PowerShell before npm installation or Prisma engine generation. This uses the operating system certificate store; TLS verification stays enabled.

Use migrations, not db push: RLS and grants live in SQL migrations. Run `npm run db:dev -- --name descriptive_name` for schema changes; inspect SQL and add tenant policies for new tables. Client generation does not apply migrations.

No tenant, demo account, or default password is seeded. To create the first local platform administrator, set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD (at least 12 characters) in your terminal, then run `npm run auth:bootstrap`. Remove those variables from the terminal afterward. Bootstrap refuses to overwrite accounts or run after a platform administrator exists. See [authentication](docs/AUTHENTICATION.md) for endpoints, local reset delivery, session policies, and tests.

Browser verification: `npm run test:e2e -w @seyyon/web` uses installed Microsoft Edge and starts local development servers as needed. Tests create and clean up isolated accounts in the configured local database.

See [architecture](docs/ARCHITECTURE.md), [database](docs/DATABASE_DESIGN.md), [security](docs/SECURITY.md), and [roadmap](docs/DEVELOPMENT_ROADMAP.md).

