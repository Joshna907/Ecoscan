# Deploy the EcoScan site on Vercel

Vercel builds and serves the React site from this repository. The root [`vercel.mjs`](../vercel.mjs) forwards `/api/*` requests to a separate HTTPS backend. This keeps the browser on one origin, so existing login and anonymous-session cookies work without a cross-origin frontend change.

## What you need

1. A Vercel account with access to this GitHub repository.
2. An already-running EcoScan API **and worker** reachable through a public HTTPS origin. Both must use the same migrated PostgreSQL database. The [production Compose guide](DEPLOYMENT.md) describes this backend stack; hosting it is a separate decision and may cost money.
3. The backend origin, for example `https://api.example.com`. It must not contain `/api` or another path.

Vercel does **not** run the existing continuous worker or PostgreSQL service from a configuration file. Deploying only the site would leave scanning and account actions unavailable. The configuration therefore requires `API_ORIGIN` at build time.

## Vercel project settings

1. Import `Joshna907/Ecoscan` into Vercel.
2. Keep **Root Directory** as the repository root (`.`), because `web` imports the sibling `shared` workspace.
3. In **Settings → Environment Variables**, add `API_ORIGIN` with the public HTTPS backend origin for Production (and Preview only when a preview backend exists).
4. Deploy. The repository's `vercel.mjs` selects Vite, runs `npm run build:web`, publishes `web/dist`, and proxies `/api/*`.
5. Open the Vercel URL and check `/api/ready`. Then sign in, scan a photo, confirm its estimate, and check Results and Rewards.

Do not add `OPENAI_API_KEY`, `DATABASE_URL`, or JWT secrets to Vercel for this frontend-only deployment. They belong on the backend host. If the backend is not available yet, keep using the local setup in the root README; a Vercel frontend deployment alone is not a functional EcoScan deployment.

The existing React app uses hash routes, so no SPA fallback rewrite is needed. The API rewrite is deliberately not cached: account, points, and scan responses are personal data.
