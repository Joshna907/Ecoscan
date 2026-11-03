# Backend deployment and operations

This Compose setup runs the EcoScan **backend demo** as four containers: PostgreSQL, a one-time migration, the HTTP API, and a recognition worker. The browser UI is not part of this Compose deployment. For the full-stack Vercel and Neon deployment, use [VERCEL.md](VERCEL.md). Points and offers remain illustrative; do not attach real monetary value to them without verified eligibility and abuse controls.

## Before starting

- Install Docker Engine with the Compose plugin and make sure the engine is running.
- Put a TLS reverse proxy in front of the API before public use. The Compose file binds the API to `127.0.0.1` on the host and does not publish PostgreSQL.
- Provide persistent storage and a backup/restore plan for the PostgreSQL volume. Containers can be replaced; the volume must not be discarded.
- Use a private, access-controlled deployment machine. Uploaded image bytes temporarily live in PostgreSQL and are deleted after processing, final failure, or queue expiry. Database backups may retain those bytes for the backup retention period.

Copy `.env.production.example` to `.env.production`. Generate **different** 32-byte random hexadecimal values for `POSTGRES_PASSWORD` and `RATE_LIMIT_HASH_KEY`, for example with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```


If an HTTPS reverse proxy is the only way clients can reach the API, set `TRUST_PROXY_HOPS=1` for one proxy hop. The proxy must replace incoming `X-Forwarded-For` and set `X-Forwarded-Proto`; otherwise a caller can manipulate the IP used for scan limits. Leave the value at `0` when there is no trusted proxy. Set it to the actual number of trusted hops (maximum 3) only when the network path is controlled. Production cookies have the `Secure` flag and require HTTPS for normal browser use.

## Start and verify

From the project root:

```powershell
docker compose --env-file .env.production -f compose.prod.yaml config --quiet
docker compose --env-file .env.production -f compose.prod.yaml up --build -d
docker compose --env-file .env.production -f compose.prod.yaml ps
curl.exe http://127.0.0.1:5000/api/ready
```

The migration container must finish successfully before the API and worker start. `/api/health` checks that the HTTP process responds; `/api/ready` checks the expected schema and recent retention maintenance. The API's container health check uses `/api/ready`. The long-running API schedules cleanup; on a fresh deployment run the release preparation before starting services, or allow the first cleanup interval before checking readiness. A ready response does not prove that the worker or OpenAI is currently available. Check both processes with:

```powershell
docker compose --env-file .env.production -f compose.prod.yaml logs --tail=100 api worker migrate
```

Try the [complete demo walkthrough](../README.md#demo-walkthrough) over the **HTTPS proxy**. In this long-running PostgreSQL deployment, upload returns `202 queued`; the worker later makes the scan `ready`. Confirm the same analysis twice and verify that points are awarded once. Restart the API and verify the demo balance persists while the session remains valid. Mock scans do not earn points; the isolated release smoke test stubs a live-recognition response to exercise the positive reward path without paid provider calls.

## Operating the service

- Scale workers when queue delay and provider capacity show a need: `docker compose --env-file .env.production -f compose.prod.yaml up -d --scale worker=2`. Worker copies claim jobs with PostgreSQL row locks and share the recognition concurrency/call budget.
- Run migrations as a separate release step. They use an advisory lock and track applied files. Use backward-compatible migrations during rolling upgrades; do not assume all API copies change version simultaneously.
- Monitor API readiness, request status/error codes and duration, queue delay, failed analyses, worker restarts, PostgreSQL availability/storage, and OpenAI usage and spend. `X-Request-ID` links a response to its structured request log without logging image contents or keys.
- Back up PostgreSQL on a schedule and test a restore. Deleting the named Compose volume deletes the stored sessions, balances, jobs, and redemptions. Protect backups because they may contain temporarily queued images.
- Keep image and session retention appropriate for the demo's privacy policy. The current worker uses the database for short-lived image bytes; move to private object storage with expiry when database write load or backup size becomes a bottleneck.

## Deployment boundary

The backend is a **demo service**, not a verified rewards platform. There are no accounts, passwords, or sign-up. Anonymous sessions expire; results and balances cannot be recovered across browsers. A separately saved private key can retrieve a read-only receipt. Reward-claimed images and common cropped, rotated, resized, or recompressed variants cannot earn again across sessions for 90 days. Daily earnings are capped at 250 points per browser session (UTC); manual, corrected, mock, duplicate, and non-replacement scans earn zero. These checks do not establish ownership, one person per browser, or avoided purchases.

Offers are fictional, with demo inventory, terms, expiry, idempotent redemption, and unused-voucher refunds. Before offering real benefits, onboard verification and fulfilment partners, implement provider issuance/reconciliation and recovery/refund rules, and operate fraud review and monitoring. Partner-confirmed activity credits remain separate and non-redeemable. Before claiming production reliability, run the PostgreSQL integration suite, a real-provider scan, a restore drill, and a load test in the target environment.
