# EcoScan

**See your clothes. Understand an estimate. Explore another way to wear them.** EcoScan turns a clothing photo into reviewable item suggestions, illustrative production-carbon estimates, a reuse comparison, demo points, and fictional offers.

This is a take-home prototype. A photograph cannot reveal a garment's exact material, supply chain, lifetime, or prove that a new purchase was avoided. EcoScan presents estimates and scenarios, not measured emissions savings or carbon credits.

## The experience

1. Upload a JPEG, PNG, or WebP image (up to 5 MB), or take a photo with the camera.
2. Wait for suggested T-shirts, jeans, jackets, or shoes. Correct the categories and quantities.
3. Choose whether wearing those clothes again would replace a new purchase you had already planned.
4. See the item breakdown, total estimate, optional avoided-production scenario, and demo points.
5. Explore example offers. A redemption saves a reference and downloadable **sample** PDF; it issues no real voucher.
6. Sign up to retain a demo balance and latest confirmed result across visits. Anonymous sessions expire.

```text
React browser ── /api ──► Express API ──► PostgreSQL
                             │                 ▲
                             └── scan job ──► worker ──► image recognizer
                                                  │
                                        clothing suggestions only

The API calculates the estimates and points after the user reviews the items.
```

## Run locally

**Prerequisites:** Node.js 22 and npm; Docker Desktop with its engine running for the PostgreSQL-backed journey. An OpenAI API key is optional for local setup. Mock mode accepts images but always suggests one T-shirt.

These commands use PowerShell. Run them from the repository root.

### 1. Install dependencies and start the database

```powershell
git clone https://github.com/Joshna907/Ecoscan.git
cd Ecoscan
npm ci
docker compose up -d postgres
```

PostgreSQL is available at `localhost:5433`. `compose.yaml` uses local development credentials and a named data volume.

### 2. Configure the API

```powershell
Copy-Item api/.env.example api/.env
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Edit `api/.env`: set `AUTH_JWT_SECRET` to the first generated value and `RATE_LIMIT_HASH_KEY` to the second. Keep `DATA_STORE=postgres` and the example `DATABASE_URL` for local Docker. For an offline demo, set `VISION_PROVIDER=mock`. For actual photo recognition, keep `VISION_PROVIDER=openai` and add your key as `OPENAI_API_KEY`; see [OpenAI setup](docs/OPENAI_SETUP.md). **Never commit `api/.env` or put the key in frontend code.**

### 3. Apply migrations and start the app

```powershell
npm run db:migrate -w api
```

Open three terminals in the repository root:

| Terminal | Command | Purpose |
| --- | --- | --- |
| 1 | `npm run dev:api` | API at <http://localhost:5000> |
| 2 | `npm run dev:worker` | Processes queued image jobs |
| 3 | `npm run dev:web` | Site at **<http://localhost:5173>** |

Vite proxies `/api` to the API in development, preserving same-origin cookies. In PostgreSQL mode, an upload returns a queued analysis; the worker makes it ready for review. If an analysis remains queued, check terminal 2. `GET /api/health` checks the process; `GET /api/ready` also checks its database connection.

**Without Docker:** set `DATA_STORE=memory`, `VISION_PROVIDER=mock`, and leave `DATABASE_URL` empty in `api/.env`. Run only the API and web terminals. This mode has no accounts, processes recognition during upload, and loses all state on restart.

## Run the checks

```powershell
npm run typecheck
npm test
npm run build:web
npm run test:web
npm run lint -w web
```

The default backend run skips PostgreSQL integration tests. To include them while Docker PostgreSQL is running:

```powershell
$env:TEST_DATABASE_URL='postgresql://ecoscan:ecoscan@localhost:5433/ecoscan'
npm test
Remove-Item Env:TEST_DATABASE_URL
```

Tests create and clean up their own rows. Never point `TEST_DATABASE_URL` at production. Frontend tests simulate API responses; they do not test physical camera hardware or a live OpenAI account.

## Carbon and reward assumptions

The versioned [`demo-v1` catalogue](api/src/domain/carbonCatalogue.ts) stores placeholder production values for a comparable new item:

| Item | Estimated production |
| --- | ---: |
| T-shirt | 5 kg CO₂e |
| Jeans | 10 kg CO₂e |
| Jacket | 15 kg CO₂e |
| Shoes | 8 kg CO₂e |

The [calculation](api/src/domain/calculateEstimate.ts) multiplies each value by the confirmed quantity and sums the items. When the user selects the planned-purchase comparison, `possible avoided production = total × 0.5`; otherwise it is zero. `demo points = round(possible avoided kg CO₂e × 10)`.

For example, one T-shirt gives a **5 kg CO₂e production estimate**, a **2.5 kg CO₂e hypothetical avoided-production scenario**, and **25 demo points** when that comparison is selected. The 50% factor and point rate are assumptions, not verified savings. The image model only suggests categories; it never assigns a carbon value or points. The fictional offers cost 25, 60, and 100 points. Redeeming one deducts demo points and creates a sample receipt without partner fulfilment.

## Code structure and design decisions

| Directory | Responsibility |
| --- | --- |
| `web/src/` | React pages, camera/upload journey, results, rewards, and account UI |
| `api/src/routes/` | HTTP validation and responses |
| `api/src/services/` | Scan, recognition-job, auth, and offer workflows |
| `api/src/domain/` | Carbon, points, and offer rules |
| `api/src/store/` | Memory and PostgreSQL adapters |
| `api/db/` | Versioned SQL migrations |
| `shared/src/` | Request and response schemas used by API and web |
| `api/tests/`, `web/tests/` | Backend and frontend tests |

The API is a modular application rather than a collection of microservices. PostgreSQL stores accounts, revocable JWT login sessions, balances, redemptions, the latest confirmed estimate, and recognition jobs. Confirmation and redemption use transactions to protect points from retries and concurrent requests. Workers use leases and shared limits. Photos are temporarily kept in PostgreSQL until processing or expiry; this keeps the initial deployment simple but increases database size and backup exposure. See [architecture](docs/ARCHITECTURE.md) and [backend reliability](docs/BACKEND_RELIABILITY.md).

## Deploy on Render

The root [Blueprint](render.yaml) creates a **web service, background worker, and persistent PostgreSQL** in Singapore. They use paid plans; review [Render pricing](https://render.com/pricing) before creating them. The web service builds React and serves it through Express on the same HTTPS origin as `/api`. The web and worker run idempotent migrations before starting.

1. Connect this GitHub repository to Render and choose **New → Blueprint**.
2. Select the `main` branch and `render.yaml`. Review the three resources and their costs.
3. Enter `OPENAI_API_KEY` in Render's secret prompt. Render generates the other secrets and wires the database. Do not put secret values in the YAML.
4. Apply the Blueprint. Once both services are running, open the web service's `onrender.com` URL, check `/api/ready`, and complete a scan through Results and Rewards.

The Blueprint uses live OpenAI recognition, which needs a valid key and API billing. To create an explicitly mock-only preview, set `VISION_PROVIDER=mock` on **both** Render services and redeploy. No live deployment URL is claimed until a deployment is verified. Read [Render deployment details](docs/RENDER.md) for checks and operational limits. [Compose deployment](docs/DEPLOYMENT.md) is a separate backend-only, self-hosted option.

**Vercel site option:** [Deploy the React site on Vercel](docs/VERCEL.md) using `vercel.mjs`. It requires a separately hosted HTTPS API, worker, and PostgreSQL database; Vercel alone does not run this backend.

## Improvements beyond the prototype

- **More useful estimates:** incorporate sourced material, weight, manufacturing region, and garment-condition data; show ranges, provenance, and comparisons with similar new clothing. Keep hypothetical avoided purchases separate from verified savings.
- **Scaling:** add API and worker instances when request latency or queue delay warrants it. They already coordinate through PostgreSQL. Move temporary photos to private object storage with expiry when database write load or backup size becomes a bottleneck. Monitor queue age, database latency, provider failures and spend, and unusual point activity.
- **External integrations:** a lifecycle-data API could replace placeholder values with versioned, cached estimates and explicit fallbacks. A real offer provider would need inventory, eligibility checks, redemption idempotency, fraud controls, and reconciliation. Neither integration is claimed in this demo.

## Further reading

[Frontend UX](web/README.md) · [API contract and architecture](docs/ARCHITECTURE.md) · [Service layer](docs/SERVICE_LAYER.md) · [Reliability](docs/BACKEND_RELIABILITY.md) · [OpenAI setup](docs/OPENAI_SETUP.md) · [Render deployment](docs/RENDER.md)
