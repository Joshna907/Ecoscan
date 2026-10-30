# Deploy EcoScan on Vercel and Neon

Vercel serves the Vite site and runs one Express function in `api/index.ts`. The function imports the existing application from `backend/src/` and uses Neon PostgreSQL for accounts, sessions, estimates, and rewards. Photo recognition completes within the upload request on this hosting option, so no continuous worker is required. The separate Docker/Render deployment continues to use its queued worker.

## Prepare Neon

1. Create a Neon project and copy its **direct** and **pooled** connection strings from the Connect panel. Keep both private.
2. Apply the versioned schema migrations using the **direct** URL. The migration script uses a session-level advisory lock, which is incompatible with transaction pooling. In PowerShell, from the repository root:

   ```powershell
   $env:DATABASE_URL = Read-Host 'Paste the Neon direct URL'
   npm run db:migrate -w api
   Remove-Item Env:DATABASE_URL
   ```

3. The migration output should report the six SQL files on a fresh database. It is safe to run again; applied files are skipped.

## Configure Vercel

Keep the Vercel project Root Directory at `./`. The root `vercel.json` builds `web/dist`, routes `/api/*` to the function, and allows up to 60 seconds per function invocation.

In **Settings -> Environment Variables**, add these **Production** variables before deploying:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** connection string |
| `AUTH_JWT_SECRET` | A base64url-encoded 32-byte random value |
| `RATE_LIMIT_HASH_KEY` | A different fresh random secret of at least 32 characters |
| `VISION_PROVIDER` | `mock` for a no-cost demo; `openai` for live recognition |
| `OPENAI_API_KEY` | Required only with `VISION_PROVIDER=openai` |
| `NODE_ENV` | `production` |

Generate the JWT secret locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`. Generate the rate-limit key separately with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Do not place database URLs or secrets in Git, frontend variables, or chat.

Deploy the latest `main` commit. Check `/api/ready` on the Vercel URL, then sign up, scan a supported image, confirm the suggested items, refresh Results, and inspect Rewards. The Vercel flow returns suggestions directly from the upload request; no polling worker is involved. If a vision request exceeds the function or browser timeout, retry with a smaller image or switch to `mock` for the demo.

The Neon pooled connection is for short application transactions. The direct connection is for migrations only. The Vercel function keeps a small pool per warm instance; database concurrency and function duration are bounded by the free plans.
