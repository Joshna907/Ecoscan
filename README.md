# EcoScan — clothing carbon screening

Upload a clothing photo, review categories, optionally read its care label, confirm fibre blends and weight, and see sourced screening ranges. Explore fictional demo rewards without signing up.

## Run locally

Node.js 22 and npm are required. Use PostgreSQL for durable anonymous sessions; memory mode is available for an offline demo.

```powershell
npm ci
Copy-Item backend/.env.example backend/.env
docker compose up -d postgres
```

Set DATA_STORE=postgres, DATABASE_URL, RATE_LIMIT_HASH_KEY (random, at least 32 characters), and VISION_PROVIDER=mock in backend/.env. For live recognition use VISION_PROVIDER=openai and OPENAI_API_KEY. Never expose secrets in frontend variables. Accounts/passwords/JWT secrets are not used.

```powershell
npm run release:prepare -w api
npm run dev:api
npm run dev:worker
npm run dev:web
```

Run API, worker and web in separate terminals. Open http://localhost:5173. API: http://localhost:5000. For memory mode set DATA_STORE=memory; no worker/database is needed. Memory state disappears on restart.

## Product behavior

- JPEG, PNG and WebP uploads up to 4 MiB, with bounded decoding, orientation normalization and metadata removal for garment and care-label images.
- Category recognition never establishes material composition. OCR suggestions require user review; the label preview can be zoomed.
- Whole-item blends or measured shell/lining/padding/upper/sole components are supported. Missing/unsupported material mass is excluded and coverage is visible.
- Review and material text drafts survive a refresh in this tab. Label photo bytes are not put in browser storage; reattach the photo after refresh if needed.
- Results show low/central/high screening scenarios with versioned provenance and separate whole-garment benchmarks and fibre-stage estimates.
- Anonymous HTTP-only browser sessions hold results, demo points and receipts. They expire after inactivity. There are no logins or passwords. A separately saved private key can recover a read-only receipt across browsers; results and balances cannot be restored.
- Common cropped/rotated/resized/recompressed reuploads are checked across sessions for 90 days. Limits reduce abuse but do not verify ownership, one person per browser, or avoided purchases.
- Fictional offers have demo partner terms, finite inventory, expiry, single-use fulfilment, idempotent redemption retries and unused-voucher refunds. See [the offer lifecycle and real-provider requirements](docs/ANONYMOUS_REWARDS.md).

## Carbon assumptions

The assignment's illustrative per-item benchmarks remain: T-shirt 5, jeans 10, jacket 15 and shoes 8 kg CO2e. Category sensitivity bounds are 60–160% of these values. They are not a measured product LCA.

The sourced fibre dataset and measured/default weights produce a separate material-stage estimate, never added to the overlapping category benchmark. See [methodology and source limitations](docs/MATERIAL_METHODOLOGY.md). Low/high values are sensitivity scenarios, not statistical confidence limits. Unknown factors remain unavailable rather than guessed.

When a planned-purchase replacement scenario is selected, the comparison is half the category benchmark. Unchanged live-recognition suggestions can earn round(comparison × 10) demo points, capped at 250 per browser session per UTC day. Material/weight entries never raise rewards. Corrected, manual, mock, duplicate and non-replacement scans receive no points. These rules do not verify real savings.

## Validation and releases

```powershell
npm run typecheck
npm test
npm run test:web
npm run build:web
npm run lint -w web
```

For integration tests, pre-migrate a disposable database and set TEST_DATABASE_URL to it. Never point tests at production. CI supplies a disposable PostgreSQL service. The release smoke test covers schema readiness, cleanup, upload, confirmation, result restoration and redemption using stubbed recognition.

`npm run release:prepare -w api` applies pending migrations and runs that smoke test. Migration 010 retires account credential tables: deploy it together with the anonymous application. Historical migrations stay for reproducible upgrades.

Vercel requires CRON_SECRET for authenticated scheduled cleanup. Partner fulfilment requires a separate PARTNER_API_SECRET. Hosting secrets and commercial provider onboarding are not created by this repository. See [deployment instructions](docs/VERCEL.md).

## Next production steps

Use private expiring object storage at scale, indexed similarity candidate lookup, independent activity verification before real rewards, contracted partner fulfilment and provider reconciliation, and real-device/accessibility/load testing. Supplier-specific lifecycle data is needed before making accurate product comparisons or verified emissions claims.
# Partner-confirmed activities

Rewards now supports an independent activity-evidence ledger for completed partner repairs, secondhand purchases, accepted donations and recycling. It uses short-lived user codes and signed partner confirmations; photos cannot credit it. Activity credits stay separate from demo points and are not redeemable. No partner is configured by default. See [setup, signing protocol, reversals and limits](docs/ACTIVITY_VERIFICATION.md). Apply migration `011` before deploying.
# Receipt recovery and fraud review

Users can save a private receipt recovery key and later retrieve a read-only receipt without logging in. Restricted operators can review suspicious attempts, apply/release holds, and inspect decision history. Apply migration `012`; see [recovery, operator setup and monitoring](docs/RECOVERY_AND_FRAUD_REVIEW.md). Scoring now identifies missing fibre/component mass explicitly; [the source review](docs/FACTOR_REVIEW_2026-11-02.md) explains why no new generic elastane factor was approved.
