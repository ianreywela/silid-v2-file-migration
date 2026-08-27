# Silid V2 File Migration

Next.js dashboard and background worker for migrating files from AWS S3 to Huawei OBS. Schools are discovered from Firestore by class creation date range. Migration progress is stored in PostgreSQL (replacing per-school JSON ledger files).

## Stack

- Next.js (App Router)
- Drizzle ORM + PostgreSQL
- NextAuth with Google OAuth (dashboard) + Firebase Admin (Firestore reads)
- Background worker (`npm run worker`) with 5 parallel school migrations

## Prerequisites

- Node.js 20+
- PostgreSQL database (`DATABASE_URL`)
- Firebase service account credentials
- AWS S3 and Huawei OBS credentials (see `.env.example`)

## Setup

1. Copy environment variables:

```bash
cp .env.example .env
```

2. Set `DATABASE_URL` in `.env` to your Postgres connection string.

3. Push database schema:

```bash
npm run db:push
```

If you already ran migrations before, apply the latest schema update for transfer analytics (`file_size_bytes`, `transferred_bytes` columns).

4. Install dependencies and run the app:

```bash
npm install
npm run dev
```

5. Migrations run automatically on the server when you start the app (`npm run dev` or `npm start`). No separate worker terminal is required unless you set `DISABLE_EMBEDDED_WORKER=true`.

The worker continues processing after you reload the page or sign out.

## Usage

1. Sign in at `/login` with Google OAuth.
2. Open `/dashboard/migrations`.
3. Set start/end dates and search schools (matches `getSchools` in silid-functions).
4. Select schools and start migration.
5. Use Pause / Resume / Cancel to control the active batch.
6. View per-school progress and logs in the dashboard.

## Import existing JSON ledgers

To seed progress from Python `exports/obs_file_migration_data/*.json`:

```bash
npm run import:ledgers -- /path/to/obs_file_migration_data <batch-id>
```

## Production

Run two processes:

1. `npm run build && npm start` — web UI + API
2. `npm run worker` — migration processor (PM2 or systemd recommended)

## API

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/schools?startDate&endDate` | Schools in date range |
| POST | `/api/migrations` | Create migration batch |
| GET | `/api/migrations` | List batches |
| GET | `/api/migrations/[id]` | Batch detail |
| PATCH | `/api/migrations/[id]` | `{ action: "pause" \| "resume" \| "cancel" }` |
| GET | `/api/migrations/[id]/files` | Collected files with filter, sort, pagination |
| GET | `/api/migrations/[id]/analytics` | Per-school and overall transfer size stats |
| GET | `/api/migrations/[id]/logs?schoolJobId` | School logs |

All API routes require an active NextAuth session (cookie-based).

## Google OAuth setup

1. Create an OAuth client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Set **Authorized redirect URIs** to:
   - `http://localhost:3000/api/auth/callback/google` (local)
   - `https://your-domain.com/api/auth/callback/google` (production)
3. Copy the client ID and secret into `.env` as `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET`.
4. Set `AUTH_URL` to your app origin (e.g. `http://localhost:3000`).
5. Generate `AUTH_SECRET` with `openssl rand -base64 32`.

## Storage credentials

File transfers copy objects directly from AWS S3 to Huawei OBS using the S3-compatible API (same approach as `silid-file-uploader`). Set these in `.env`:

| Variable | Description |
|----------|-------------|
| `AWS_ACCESS_ID` | AWS access key |
| `AWS_SECRET_KEY_ID` | AWS secret key |
| `AWS_BUCKET` | Source bucket |
| `AWS_REGION` | AWS region (e.g. `ap-southeast-1`) |
| `HUAWEI_AWS_ACCESS_ID` | Huawei OBS access key |
| `HUAWEI_AWS_SECRET_KEY_ID` | Huawei OBS secret key |
| `HUAWEI_AWS_BUCKET` | Destination bucket |
| `HUAWEI_AWS_REGION` | Huawei region |
| `HUAWEI_AWS_ENDPOINT` | Huawei OBS S3 endpoint (virtual-hosted style) |
