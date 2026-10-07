# LIVIA deployment guide

This document covers the local and production deployment flow for the intelligence service that monitors public and official sources.

## 1. Prerequisites

- Node.js 20 or later
- Docker Desktop or a compatible PostgreSQL runtime
- A secure `INTELLIGENCE_API_TOKEN` value with at least 32 characters
- A trusted browser origin list for the intelligence API

## 2. Local database setup

From the repository root:

```bash
npm install
npm run db:up
npm run migrate:intelligence
```

The compose file creates a local PostgreSQL instance with the pgvector extension enabled.

If you need to reset the local database:

```bash
npm run db:down
```

Then start it again with `npm run db:up` and rerun migrations.

## 3. Local intelligence service

Create a `.env` file in the repository root with the following entries:

```env
DATABASE_URL=postgresql://livia:livia-local-dev-only@127.0.0.1:5432/livia
INTELLIGENCE_API_TOKEN=replace-with-a-strong-32-character-token
INTELLIGENCE_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
INTELLIGENCE_PORT=4320
```

Start the service:

```bash
npm run dev:intelligence
```

Health check:

```bash
curl http://127.0.0.1:4320/api/health
```

Expected response:

```json
{ "ok": true, "service": "livia-intelligence", "database": "connected" }
```

## 4. Required security settings

Production deployments must not use the local dev password. Replace it with a strong secret and keep the following values explicit:

- `DATABASE_URL`
- `INTELLIGENCE_API_TOKEN`
- `INTELLIGENCE_ALLOWED_ORIGINS`
- `POSTGRES_PASSWORD` when using Docker

Only trusted browser origins should be configured in `INTELLIGENCE_ALLOWED_ORIGINS`.

## 5. Web dashboard integration

The dashboard lives in the Next.js app under `apps/web` and communicates with the local intelligence service at `http://127.0.0.1:4320` when a valid bearer token is present.

The intelligence page is available at:

- `/intelligence`

Use the same token configured in the service env file.

## 6. Production deployment checklist

Before deployment:

- set `INTELLIGENCE_API_TOKEN` to a strong secret
- set `DATABASE_URL` to the production database endpoint
- restrict `INTELLIGENCE_ALLOWED_ORIGINS`
- enable PostgreSQL backups and access logging
- confirm the service can reach the database over private networking
- verify `npm run test:intelligence` passes reliably

## 7. Recommended deployment pattern

For a first production deployment, prefer:

- PostgreSQL managed service with pgvector enabled
- one dedicated node process for the intelligence service
- optional reverse proxy in front of the service
- standard monitoring for process uptime and database connectivity
- route-based origin restrictions for browser requests

## 8. Operational notes

The intelligence service intentionally avoids claiming semantic impact. It only exposes evidence-backed changes and version comparisons until later milestones add stronger impact reasoning.

For the full operational process, see [runbook.md](runbook.md).
