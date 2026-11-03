# EcoScan - Clothing Carbon Footprint Scanner

A full-stack take-home project for Reewild. Upload a clothing photo, review the detected items, optionally confirm care-label composition and weight, and explore carbon screening ranges and demo rewards without signing up.

**[Live demo](https://ecoscann.vercel.app/) **

> Carbon results are screening estimates, not measurements of the photographed garment or verified emissions savings. Offers, points, PDFs, and voucher actions are fictional demonstrations: no real goods, money, carbon credits, or commercial vouchers are issued.

## Tech stack

| Layer | Implementation |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, React Router, responsive CSS |
| Backend | Node.js 22, TypeScript, Express 5 |
| Image recognition and label OCR | OpenAI Responses API with structured outputs; configurable vision model, default `gpt-6-luna` |
| Offline recognition | Fixed mock suggestions; no OpenAI key or paid requests |
| Image validation | Multer and Sharp: content checks, bounded decoding, orientation normalization, metadata removal |
| State | In-memory store for a local demo; PostgreSQL for durable anonymous sessions and rewards |
| Hosting | Vercel frontend and serverless API, Neon PostgreSQL |
| Tests | Vitest, Supertest, React Testing Library; disposable PostgreSQL in CI |

## Setup and run locally

### Requirements

- Node.js 22 and npm.
- Git.
- Docker with Compose only for the optional PostgreSQL setup.
- An OpenAI API key with available credits only for real recognition. Mock mode has no OpenAI API charges.

Clone and install:

```powershell
git clone https://github.com/Joshna907/Ecoscan.git
cd Ecoscan
npm ci
Copy-Item backend/.env.example backend/.env
```

Do not overwrite an existing `backend/.env` containing your own configuration. This file is ignored by Git; keep keys server-side and never use frontend `VITE_*` variables for secrets.

### Option A: no-cost local demo, no database

Edit `backend/.env`:

```dotenv
DATA_STORE=memory
VISION_PROVIDER=mock
```

Start these in **two separate terminals**, both at the repository root:

```powershell
# Terminal 1: API
npm run dev:api
```

```powershell
# Terminal 2: frontend
npm run dev:web
```

Open **http://localhost:5173**. The API runs at **http://localhost:5000**; Vite proxies `/api` requests to it. No worker or migrations are needed in memory mode. State disappears when the API restarts. Mock recognition returns a fixed T-shirt suggestion, label OCR returns no suggestions, and mock scans earn zero points. Material details can still be entered manually.

### Option B: persistent PostgreSQL demo

```powershell
docker compose up -d postgres
```

Set these values in `backend/.env`:

```dotenv
DATA_STORE=postgres
DATABASE_URL=postgresql://ecoscan:ecoscan@localhost:5433/ecoscan
VISION_PROVIDER=mock
RATE_LIMIT_HASH_KEY=<your-own-random-secret-at-least-32-characters>
```

Replace the placeholder with a fresh secret. Generate one locally with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Prepare the schema and run the release smoke test:

```powershell
npm run release:prepare -w api
```

Then run `npm run dev:api`, `npm run dev:worker`, and `npm run dev:web` in **three separate terminals**. This long-running PostgreSQL deployment queues recognition, so the worker is required. The Vercel deployment processes recognition within the request and does not need a worker.

### Enable real image recognition

In `backend/.env`, set `VISION_PROVIDER=openai`, add `OPENAI_API_KEY`, and optionally set `OPENAI_VISION_MODEL`. Restart the API and worker if running. Both garment recognition and care-label reading use this model setting. API use consumes credits; model access is determined by the API project. The AI returns suggestions only; our backend calculates carbon estimates and points. See [OpenAI setup](docs/OPENAI_SETUP.md).

## Demo walkthrough

Use the [hosted demo](https://ecoscann.vercel.app/) or your local frontend. Prepare one clear T-shirt, jeans, jacket, or shoes photo and, optionally, a close-up of its care label.

1. **Add a photo.** Open **Scan clothes**, choose or drop one JPEG, PNG, or WebP image up to 4 MiB, or use the camera. Check the preview, then select **Scan photo**. Camera use needs browser permission and HTTPS or localhost.
2. **Review the items.** Check every suggested category and quantity. Correct, add, or remove items as needed. Recognition is limited to the four supported categories; unclear items can be omitted. Corrections remain estimate-only.
3. **Optionally refine materials.** Open **Material and weight**, add and zoom the label photo, and select **Read label**. Review the OCR suggestions against the printed label. Alternatively enter composition manually. Percentages must total 100%; enter a measured weight if known, or leave it blank for a category weight range. Confirm/apply the details before continuing. Unsupported fibres are disclosed as missing coverage.
4. **Choose the comparison.** Select whether wearing the items again would replace a purchase you were already planning. This is a hypothetical comparison, not evidence of an avoided purchase. Select **Confirm and see estimate**.
5. **Inspect Results.** Check the category low/central/high range, scenario, item breakdown, and demo points. A confirmed supported blend adds a separate fibre-production result. Open the cards under **Behind your estimate** for boundaries, sources, and reward explanations. Refresh to verify the latest result is restored in the same session.
6. **Explore Rewards.** Check the server-owned balance and the example offers. Open **Offer details** for terms, inventory, and expiry. A locked button explains missing points, expiry, or stock. If eligible, select **Redeem demo offer**, inspect the confirmation, then confirm. The balance changes once and a sample receipt appears. Refreshing does not redeem again.
7. **Inspect the receipt lifecycle.** Download a sample PDF. An unused receipt can be refunded; its points return once. Simulated fulfilment needs confirmation and removes refund access. No real products or vouchers are issued.
8. **Try account-free receipt recovery.** Generate and privately save a receipt recovery key in the original session. In a private browser window, open **Rewards > Recover a receipt** and enter that key. Recovery is read-only: it does not restore the balance, results, or refund/fulfilment controls. Never share the key in a demo recording.
9. **Check the limits.** Unsupported or oversized files show an error. Repeating a reward-claimed image, including common visual variants, must not earn again. Activity verification shows unavailable until a trusted partner is connected; a user cannot confirm their own activity.

**Points during the walkthrough:** an unchanged live-AI T-shirt suggestion with a planned-purchase replacement scenario can award 25 demo points, enough for the repair-kit example. Manual, corrected, mock, duplicate, and non-replacement scans award zero; the daily cap also applies. Do not change a valid recognition to manufacture rewards. For a reproducible positive redemption without paid recognition, use the isolated local `release:prepare` smoke test: it stubs recognition and exercises upload, confirmation, redemption, retry, refund, and recovery, then removes its test records.

## Carbon scoring assumptions

| Item | Central category benchmark (kg CO2e/item) | Low-high scenario |
| --- | ---: | ---: |
| T-shirt | 5 | 3-8 |
| Jeans | 10 | 6-16 |
| Jacket | 15 | 9-24 |
| Shoes | 8 | 4.8-12.8 |

These illustrative values are stored in the in-memory domain catalogue. Category sensitivity bounds are 60-160% of the central value; they are not a measured product lifecycle assessment.

Confirmed composition and measured/default weights produce a **separate fibre-production estimate**, from raw-material inputs to the fibre factory gate. It excludes later manufacturing, transport, use, and end of life. It is never added to the overlapping whole-garment benchmark. Supported components include shell, lining, padding, upper, and sole. Missing factors or unallocated component masses remain unknown, not zero. See [material methodology and sources](docs/MATERIAL_METHODOLOGY.md) and [factor review](docs/FACTOR_REVIEW_2026-11-02.md).

Low/high values are sensitivity scenarios, not statistical confidence limits. OCR only reads label text; it does not establish material composition from appearance.

For the planned-purchase replacement scenario, the illustrative comparison is half the category benchmark. Eligible points are `round(comparison * 10)`, capped at 250 per anonymous browser session per UTC day. Material and weight entries never increase points. Reward-claimed images and common visual variants cannot earn again across sessions for 90 days. These checks reduce abuse; they do not prove ownership, one person per browser, or real emissions savings.

## Tests and release checks

```powershell
npm run typecheck
npm test
npm run test:web
npm run lint -w web
npm run build:web
```

API tests cover scoring, validation, scan/reward integrity, retries, and recovery. Frontend tests cover scan journeys, material review, receipts, navigation, and interactions. PostgreSQL integration tests additionally need `TEST_DATABASE_URL` pointing to a **disposable, pre-migrated test database**; never use production. CI supplies that database and runs all checks plus `npm run release:check -w api`.

`npm run release:prepare -w api` applies pending migrations and runs a database-backed HTTP smoke test with stubbed recognition and monitored cleanup. This validates the application flow without spending OpenAI credits; it does not validate live model accuracy. A real-provider scan is a separate manual check.

## Project structure

```text
web/                    React pages, components, API client, and frontend tests
backend/src/routes/     HTTP endpoints and validation
backend/src/services/   Scan, recognition, reward, recovery, and maintenance workflows
backend/src/domain/     Carbon factors, calculation rules, and demo-offer catalogue
backend/src/store/      In-memory and PostgreSQL adapters
backend/db/             Versioned SQL migrations
backend/tests/          API and database tests
shared/src/             Shared request/response schemas and types
api/index.ts            Vercel serverless entry point
docs/                   Architecture, methodology, deployment, and operating guides
.github/workflows/      CI and production database preparation
```

The backend is a modular monolith. PostgreSQL transactions protect balances and idempotent receipt actions. Anonymous HTTP-only sessions hold state without passwords or sign-up. Draft form text is retained in the current tab; label photos are not saved to browser storage. See [architecture and API contracts](docs/ARCHITECTURE.md) and [anonymous rewards](docs/ANONYMOUS_REWARDS.md).

## Deployment and troubleshooting

Production: **https://ecoscann.vercel.app/**. Vercel hosts the frontend and Express function; Neon stores anonymous session and reward data. Follow [the Vercel/Neon release guide](docs/VERCEL.md). A separate [Docker backend deployment](docs/DEPLOYMENT.md) is also available.

Before each production release, apply the schema migrations and run the release smoke test against the intended database. Vercel needs a private `CRON_SECRET` of at least 32 characters for authenticated daily retention cleanup; set it in Production and redeploy. Never commit it. `/api/ready` checks schema and recent retention health as well as this serverless configuration. An HTTP 200 from `/api/health` alone is insufficient. See the [readiness recovery steps](docs/VERCEL.md#readiness-recovery) if readiness returns 503.

## Product improvements and technical scaling

- **Scoring:** obtain reviewed, consistently sourced factors for unsupported fibres/components, supplier-specific production data, and broader lifecycle stages. Version factors and retain provenance so older results remain explainable.
- **User experience:** extend supported garments after accuracy evaluation, improve difficult-label review, add useful comparisons with consistent boundaries, and run real-device and accessibility checks.
- **Real rewards and offers:** onboard contracted verification and fulfilment partners. Add provider issuance, reconciliation, failed-issuance recovery, refund rules, and operational fraud monitoring before points have value. Existing activity credits are separate, non-redeemable records, not proof of avoided purchases.
- **Scale:** move queued image bytes to private expiring object storage, scale workers with measured queue demand, use indexed similarity candidate lookup, and tune database pooling and shared rate/concurrency limits. Run load and backup-restore tests before capacity claims.
- **External integrations:** import licensed material/LCA datasets through a reviewed versioned pipeline and integrate signed partner activity events and voucher-provider webhooks. Live external data still needs boundary and quality review.

Current limits are deliberate: four garment categories, broad screening uncertainty, incomplete material coverage, anonymous expiring sessions, and fictional rewards. A separately saved private key recovers a receipt only; results and balances have no cross-device recovery. This submission demonstrates the end-to-end engineering and product approach without claiming verified carbon savings or commercial fulfilment.
