# Deploy EcoScan on Vercel and Neon

Vercel serves the Vite site and runs one Express function in `api/index.ts`. The function imports the existing application from `backend/src/` and uses Neon PostgreSQL for anonymous sessions, estimates, and rewards. Photo recognition completes within the upload request on this hosting option, so no continuous worker is required. The separate Docker Compose deployment continues to use its queued worker.

## Prepare Neon

1. Create a Neon project and copy its **direct** and **pooled** connection strings from the Connect panel. Keep both private.
2. Apply the versioned schema migrations using the **direct** URL. The migration script uses a session-level advisory lock, which is incompatible with transaction pooling. In PowerShell, from the repository root:

   ```powershell
   $env:DATABASE_URL = Read-Host 'Paste the Neon direct URL'
   npm run db:migrate -w api
   Remove-Item Env:DATABASE_URL
   ```

3. The migration output should report the ten SQL files on a fresh database. It is safe to run again; applied files are skipped.

## Configure Vercel

Keep the Vercel project Root Directory at `./`. The root `vercel.json` builds `web/dist`, routes `/api/*` to the function, and allows up to 60 seconds per function invocation.

In **Settings -> Environment Variables**, add these **Production** variables before deploying:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** connection string |
| `RATE_LIMIT_HASH_KEY` | A different fresh random secret of at least 32 characters |
| `VISION_PROVIDER` | `mock` for a no-cost demo; `openai` for live recognition |
| `OPENAI_API_KEY` | Required only with `VISION_PROVIDER=openai` |
| `NODE_ENV` | `production` |


Deploy the latest `main` commit. Check `/api/ready` on the Vercel URL, then scan a supported image, confirm the suggested items, refresh Results, and inspect Rewards. The Vercel flow returns suggestions directly from the upload request; no polling worker is involved. If a vision request exceeds the function or browser timeout, retry with a smaller image or switch to `mock` for the demo.

The Neon pooled connection is for short application transactions. The direct connection is for migrations only. The Vercel function keeps a small pool per warm instance; database concurrency and function duration are bounded by the free plans.

## Required release gate and retention

Before deploying application code, run `npm run release:prepare -w api` against the **direct** database URL (or set `DATABASE_MIGRATION_URL` for migrations and `DATABASE_URL` for runtime). This applies pending migrations, runs monitored cleanup, and performs an HTTP upload → confirmation → saved result → demo redemption smoke test. Recognition is stubbed, so this does not spend provider credits or validate live model accuracy. The disposable smoke-test session and its reward claim are removed afterward. Run this step from a trusted release environment with dev dependencies installed.


Set a random **CRON_SECRET** of at least 32 characters in Vercel. Never put it in source or frontend variables. Vercel supplies it as the bearer token when calling the scheduled `GET /api/internal/cleanup` route. Missing configuration returns 503; unauthorized calls return 401. The endpoint is never publicly writable without the secret.

`vercel.json` schedules cleanup daily at 00:00 UTC, compatible with Hobby's daily cron restriction. On a plan that supports it, use an hourly schedule or an external authenticated scheduler for a tighter retention deadline. A daily schedule removes expired records on the next run, not exactly at their expiry timestamp. Serverless direct recognition does not queue photo bytes; if another entry point queues photos in the same database, physical expiry deletion can lag by the scheduler interval. Monitor your actual retention requirements.

Cleanup records last success/failure in `eco_maintenance`, emits structured success/failure events, and serializes concurrent runs using a transaction-scoped advisory lock (safe with transaction pooling). `/api/ready` returns 503 if the schema is behind, required tables/columns are absent, cleanup last failed, cleanup is over 26 hours old, or the serverless cron secret is missing. The migration creates an initial 26-hour grace period; run cleanup once during release. Attach an external uptime alert to readiness and inspect Vercel cron logs. The repository cannot configure your hosting secrets or external alerts by itself.

Expired analyses no longer consume the per-session retained-scan allowance even if cleanup is delayed. Reward claims, balances, receipts and latest-result snapshots retain their existing policies. Cleanup is idempotent; retry a failed scheduled request and check readiness afterward. Vercel scheduling/authentication details: https://vercel.com/docs/cron-jobs/manage-cron-jobs and https://vercel.com/docs/cron-jobs/usage-and-pricing.
