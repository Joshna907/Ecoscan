# OpenAI image recognition setup

EcoScan has two recognition modes. `mock` returns a fixed T-shirt suggestion for development. `openai` sends the uploaded image to the OpenAI Responses API and asks for supported clothing categories. In either mode, the user must review the suggestions before the server calculates estimates and awards demo points.

## Enable OpenAI locally

From PowerShell:

```powershell
Set-Location C:\Users\dell\Desktop\ecoscan
Copy-Item backend\.env.example backend\.env
notepad backend\.env
```

In `backend/.env`, leave `VISION_PROVIDER=openai` and enter your own API key after `OPENAI_API_KEY=`. Save the file, then start the backend:

```powershell
npm run dev:api
```

The key belongs only on the backend. Do not paste it into chat, put it in the React app, or commit `backend/.env`; the root `.gitignore` excludes it. An OpenAI API key is separate from a ChatGPT subscription and API usage may be billed. The default model is `gpt-6-luna`; change `OPENAI_VISION_MODEL` only if your API project supports another vision and structured-output capable model.

## What happens during a scan

1. `POST /api/analyses` accepts one JPEG, PNG, or WebP file, at most 5 MB.
2. The backend checks the declared MIME type and file signature. In PostgreSQL mode it stores the image bytes privately in the job table until a worker processes or expires the job; in memory mode it calls OpenAI during the request.
3. OpenAI returns category suggestions from `tshirt`, `jeans`, `jacket`, and `shoes`. Unknown or unclear garments are omitted. The server caps the returned list at ten items.
4. In PostgreSQL mode, the upload returns `202 queued`; poll `GET /api/analyses/:analysisId` until `ready`. The ready result has `recognitionMode: "vision"` and `needsReview: true`. A later confirmation request uses the user's corrected categories for deterministic scoring.

If OpenAI is unavailable, in-memory mode returns `503 VISION_UNAVAILABLE`; PostgreSQL mode retries the job and eventually reports `failed`. Neither mode silently invents a result. Check that the key is present, the model is accessible to the API project, and the API project has available usage. Never log the key or uploaded image while debugging.

## Run local checks

```powershell
npm run typecheck
npm test
```

These checks verify local TypeScript and API behavior without making a paid OpenAI call. A real photo scan with a configured key is still needed to verify the upstream integration.
