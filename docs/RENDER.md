# Render deployment

The root [`render.yaml`](../render.yaml) deploys EcoScan as a **single-origin web app** plus a recognition worker and managed PostgreSQL. Express serves the built React files and all `/api` routes from one HTTPS host. The worker processes queued images using the same database. This avoids cross-origin cookie and proxy configuration.

## Create the Blueprint

1. Connect the [EcoScan GitHub repository](https://github.com/Joshna907/Ecoscan) to Render.
2. Choose **New → Blueprint**, select `main`, and review the web service, background worker, and PostgreSQL database before applying.
3. Enter `OPENAI_API_KEY` in Render's secret prompt. It is not committed. Render generates `AUTH_JWT_SECRET` and `RATE_LIMIT_HASH_KEY`; the worker receives the image-model key through a service reference.
4. Apply the Blueprint and wait for both services to deploy. Migrations run before each service starts; an advisory lock makes concurrent migration attempts safe.

The Blueprint selects paid compute plans and a paid persistent database. A background worker has no free plan; free PostgreSQL expires after 30 days and lacks backups, so the Blueprint does not use it. Check [Render's current pricing](https://render.com/pricing) before creating resources. OpenAI usage is billed separately.

Render sets the web service's `PORT`. `SERVE_WEB=true` requires `web/dist`, built by the web service's build command. `/api/ready` checks database access but does not assert that the worker or OpenAI is healthy. Both services use Node 22 and connect to the same database in Singapore. The database accepts only internal connections.

## Verify after deployment

1. Open the web service's `onrender.com` URL and confirm the home page and its video load.
2. Open `https://YOUR-WEB-SERVICE.onrender.com/api/ready` and expect `{"status":"ready"}`.
3. Upload a supported image. Check that the analysis progresses from queued to ready. A queue that stays pending usually means the worker is stopped, has no key, or cannot connect to the database.
4. Correct the suggested items, confirm the scan, then refresh Results. The latest result should remain. Sign up, then verify the balance survives a new visit.
5. Redeem a fictional offer and download its sample receipt. Confirm that a repeated redemption does not spend points twice.

Do not put `OPENAI_API_KEY` into a `VITE_` variable or the frontend build. The production UI, API, and cookies share one origin. `TRUST_PROXY_HOPS=1` assumes Render is the only public proxy; review this setting if you add another proxy or CDN.

## Operations and limits

- The web and worker can scale independently. PostgreSQL row locks and job leases coordinate copies. Observe queue delay, job failures, database load, and model costs before increasing capacity.
- Uploaded bytes wait temporarily in PostgreSQL, up to the configured queue cap. Database backups may retain image bytes beyond the live-row expiry. Private object storage with expiry is the next change when traffic grows.
- The web readiness check covers the API and database only. Monitor the worker process and scan completion separately.
- Existing Blueprint `sync: false` secrets are not prompted again on later syncs. Change the OpenAI key in Render's environment settings if you rotate it.
- This is a **demo**: carbon figures are assumptions; offers are fictional; a photo does not verify a purchase or emissions savings. Do not attach monetary value to the points without stronger identity, abuse controls, an auditable ledger, and partner fulfilment.

The [Compose guide](DEPLOYMENT.md) remains a separate backend-only self-hosted option.
