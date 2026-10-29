# EcoScan

EcoScan is a clothing carbon-estimate prototype. A person uploads a photo, checks the suggested clothing categories, and sees illustrative production estimates, a possible avoided-production scenario, demo points, and example offers. A photo cannot establish a garment's exact footprint or prove a purchase was avoided.

## Current state

The TypeScript/Express API has image validation, a mock recognizer and optional OpenAI recognition, review and confirmation, deterministic carbon calculations, points, demo offer redemption, and email/password accounts. PostgreSQL stores accounts, revocable login sessions, the latest confirmed estimate, balances, redemptions, and durable recognition jobs. Upload and recognition limits coordinate across API and worker copies. The React frontend provides Home, Scan, Results, Rewards, and Account pages. External private image storage remains future work.

## Run locally

Install Node.js and Docker Desktop with its engine running. From this directory:

```bash
npm install
docker compose up -d postgres
```

Copy `api/.env.example` to `api/.env`. For a local demo, set `VISION_PROVIDER=mock`; no OpenAI key is needed. Keep `DATA_STORE=postgres` and the local `DATABASE_URL` from the example. Generate a random hex value with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` for `RATE_LIMIT_HASH_KEY`, and a separate base64url value with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` for `AUTH_JWT_SECRET`. Put both in `api/.env`. Use the same secrets for every API copy. The example database credentials are for local development only. Then run:

```bash
npm run db:migrate -w api
npm run dev:api
```

In a second terminal, from the same project directory, run `npm run dev:worker`. In PostgreSQL mode, uploading an image returns HTTP `202` with `{ "analysisId": "...", "status": "queued" }`. The browser can call `GET /api/analyses/:analysisId` to see `queued`, `processing`, `ready`, `failed`, or `confirmed`. A `ready` response includes reviewable suggestions. Then confirm through `POST /api/scans/confirm` as before. A confirmation attempted before `ready` returns `409 ANALYSIS_NOT_READY`.

The API listens at `http://localhost:5000`. `GET /api/health` reports whether the API process is alive; `GET /api/ready` also checks the PostgreSQL connection when database mode is enabled, returning `503 NOT_READY` if it cannot serve database-backed requests. PostgreSQL data is kept in a Docker volume, so restarting the API does not erase it. To use live image recognition, set `VISION_PROVIDER=openai` and put a valid key in `api/.env`; see [OPENAI_SETUP.md](docs/OPENAI_SETUP.md). Never commit `.env`.

For a quick backend demo without Docker, set `VISION_PROVIDER=mock` and `DATA_STORE=memory` in `api/.env`, omit `DATABASE_URL`, and run `npm run dev:api`. This uses the in-memory store, recognizes during the upload request, returns HTTP `200`, and loses state on restart. The worker is only needed in PostgreSQL mode.

## Try the backend API

Use your own JPEG, PNG, or WebP file (at most 5 MB). These examples use `curl.exe` in PowerShell and keep the same demo session cookie for each request:

```powershell
curl.exe -c .cookies -b .cookies -F "image=@C:\path\to\shirt.jpg" http://localhost:5000/api/analyses
```

In PostgreSQL mode, copy the returned `analysisId` and check its status until it is `ready`. In memory mode, the upload response already contains the suggestions. Review and correct the categories before confirming:

```powershell
curl.exe -b .cookies http://localhost:5000/api/analyses/REPLACE_WITH_ANALYSIS_ID
curl.exe -c .cookies -b .cookies -H "Content-Type: application/json" -d '{"analysisId":"REPLACE_WITH_ANALYSIS_ID","items":[{"category":"tshirt","quantity":1}],"replacesPlannedNewPurchase":true}' http://localhost:5000/api/scans/confirm
curl.exe -b .cookies http://localhost:5000/api/scans/latest
curl.exe -b .cookies http://localhost:5000/api/offers
```

Replace `REPLACE_WITH_ANALYSIS_ID` with the returned ID and use an actual image path. Supported categories are `tshirt`, `jeans`, `jacket`, and `shoes`. After confirmation, `GET /api/scans/latest` returns the latest estimate for the same session or signed-in account, including after a browser refresh. `POST /api/offers/:offerId/redeem` spends demo points once; the offer IDs and costs come from `GET /api/offers`. See the [API contract](docs/ARCHITECTURE.md#api-contract) for responses and errors. Delete the local `.cookies` file after the demo.

## Test

```bash
npm run typecheck
npm test
```

Those commands run the backend checks with local recognizers. To also run the PostgreSQL integration tests, set `TEST_DATABASE_URL` to the local test database connection string before `npm test`. In PowerShell:

```powershell
$env:TEST_DATABASE_URL='postgresql://ecoscan:ecoscan@localhost:5433/ecoscan'
npm test
Remove-Item Env:TEST_DATABASE_URL
```

The database tests create and remove their own session and account rows. Do not point `TEST_DATABASE_URL` at a production database. A running PostgreSQL server is required; tests skip that suite when the variable is absent.

## Accounts

Open **Account** in the site header to sign up or log in. Accounts require PostgreSQL mode and migration `004_accounts.sql`; memory mode still supports anonymous scanning but account creation returns `503`. Signup uses an email address and a password of 12–128 characters. It attaches the current anonymous browser session, so existing demo points stay with the new account. Login restores the account's balance on another browser or after a restart. Logout revokes the current login token. The API provides `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`, and `POST /api/auth/logout`.

Passwords are stored as salted scrypt hashes. Signup and login issue signed HS256 JWTs with subject, issuer, audience, issue time, expiry, and a unique token ID. JWTs travel in an HTTP-only, SameSite cookie, marked Secure under HTTPS. The API verifies the signature and claims and checks a hashed token record in PostgreSQL, so logout revokes the token immediately. All API copies must share the same `AUTH_JWT_SECRET` (a base64url-encoded 32-byte random value), which must be set in `api/.env` for local PostgreSQL mode or `.env.production` for Compose deployment. Rotate the secret deliberately: rotation invalidates all current logins. Login attempts are limited per email across API copies. These are still demo rewards: verified email, password reset, additional abuse controls, and a durable reward ledger would be needed before offering real value.

## How the backend is arranged

`api/src/routes` receives HTTP requests. `api/src/services` coordinates scanning, confirmation, recognition jobs, and offers. `api/src/domain` holds the carbon and points rules. `api/src/store` has the in-memory and PostgreSQL storage adapters. `shared/src` holds the API schemas. Versioned database migrations live in `api/db` and are applied with `npm run db:migrate -w api`.

The PostgreSQL adapter stores demo balances and uses transactions with row locks for confirmation and redemption. It keeps a saved confirmation response so a retry awards no extra points. An upload reservation has a database expiry so a crashed API cannot block a session forever. Workers claim jobs with database row locks and a two-minute lease; crashed claims can be retried, up to three attempts. Image bytes are deleted after success, final failure, or one day in the queue. In this phase, images up to 5 MB are held privately in PostgreSQL while queued. The queue is capped at 100 jobs by default (at most about 500 MB of raw image bytes). This simplifies an initial deployment but increases database size and write load; move images to private object storage with automatic expiry when traffic warrants it. In PostgreSQL mode, upload rate and concurrency limits are shared across API copies. Worker copies also share a concurrent recognition cap and daily call budget. The daily count limits calls, not monetary cost or image token use.

## Carbon and reward assumptions

The versioned `demo-v1` catalogue uses **T-shirt 5, jeans 10, jacket 15, shoes 8 kg CO₂e** as rough production placeholders for comparable new clothing. If the person says wearing the item again would replace a planned new purchase, the possible avoided-production scenario is `estimated production × 0.5`; otherwise it is zero. Demo points are `round(possible avoided kg CO₂e × 10)`. These are illustrative assumptions, not measured savings, carbon credits, or redeemable real-world value. Offers are fictitious. The challenge asks for offers users could redeem; the interactive redemption here is an extra demonstration. Redeeming one deducts points and saves a record with a reference, visible on return visits. The browser can download that record as a sample PDF. No physical item or partner voucher is issued.

## Product improvements

Show a comparison with a similar new garment, an uncertainty range, and the assumptions behind each estimate. Add material, garment weight, origin, and condition only when they can be supported by reliable data or user input. Keep any “potential avoided” scenario separate from measured emissions savings. Real partner offers would require verified eligibility and abuse controls.

## Technical scaling

Keep one modular backend codebase. Use authenticated accounts before issuing real rewards. Move temporary images from PostgreSQL to private object storage as scan volume grows. Measure queue delay, provider errors and cost, database latency, and reward anomalies; increase API or worker copies in response to the measured bottleneck. External lifecycle-data and real offer-provider APIs would need explicit data quality, caching, timeout, and failure policies.

See [architecture](docs/ARCHITECTURE.md), [service layer](docs/SERVICE_LAYER.md), and [backend reliability](docs/BACKEND_RELIABILITY.md) for the present design and tradeoffs.

For containerized backend startup, migrations, HTTPS proxy requirements, scaling, backups, and release checks, see [deployment and operations](docs/DEPLOYMENT.md).


## Basic frontend

Start the API as described above, then run `npm run dev:web` in another terminal and open http://localhost:5173. The Vite development proxy sends `/api` requests to port 5000. For PostgreSQL mode, also run the worker. The interface supports image upload, camera capture, item review, estimates, and demo offer redemption.

Run `npm run build:web`, `npm run test:web`, and `npm run lint -w web` to check the frontend. See [the frontend UX guide](web/README.md) for page responsibilities, user flow, code structure, and static-host deployment requirements.
