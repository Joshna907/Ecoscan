# Service layer: a beginner's guide

Service-layer separation means giving the steps of a user action their own home in the code. A service here is a TypeScript class inside our existing backend, not another server.

Previously, route handlers coordinated workflows and changed session data. Now routes receive HTTP requests and call services. Services coordinate the work, domain functions calculate the numbers, and the store protects and updates state.

```text
Browser -> Route -> Service -> Domain rules / Store / Recognizer
Browser <- JSON  <- Result
```

## What each part does

| File under backend/src | Job |
| --- | --- |
| routes/analysisRoutes.ts | Receive and validate the uploaded file; enforce admission controls and release reservations |
| routes/scanRoutes.ts | Pass a confirmation request to ScanService and send its response |
| routes/offerRoutes.ts | Pass offer requests to OfferService and send responses |
| services/analysisService.ts | Submit an image for immediate or queued recognition, retrieve job status, and save immediate suggestions for review |
| services/scanService.ts | Validate reviewed items, identify equivalent retries, and coordinate calculation and confirmation |
| services/offerService.ts | Build the offer list and redeem using the catalogue's actual price |
| services/ports.ts | Describe the storage operations the services need |
| services/applicationError.ts | Name application failures without assigning HTTP status codes |
| domain/calculateEstimate.ts | Apply the carbon scenario and demo-points formulas |
| store/demoSessions.ts and store/postgresSessions.ts | Two implementations of session state and indivisible confirmation/redemption updates |
| middleware/sessionContext.ts | Read and set the browser session cookie |
| app.ts | Create and connect these objects; translate failures into HTTP responses |

## Example: confirming a T-shirt

1. The browser sends an analysis ID, one T-shirt, and its purchase-replacement choice.
2. The route resolves the browser session and calls ScanService.confirm.
3. ScanService checks the input and builds a fingerprint representing the category totals and choice.
4. The store checks that this session owns the analysis and that it is still valid. An equivalent completed request returns its saved result immediately.
5. For a new confirmation, the supplied calculation calls the domain function. With replacement selected, the demo rules return 5 kg estimated production, 2.5 kg potential avoided production, and 25 points.
6. The store validates and saves the result and adds points as one atomic operation. PostgreSQL mode commits these changes together in a transaction. Repeating the request cannot add another 25 points.
7. The route sends the result as JSON.

Services do not import Express or manipulate cookies. Storage does not expose its mutable session maps. Returned results and reward snapshots cannot be used to change stored balances.

## Why this helps

We can test a workflow by calling its service directly, without running an HTTP server. Changing HTTP handling does not require rewriting carbon calculations. Recognition uses an adapter, and storage has an explicit contract. These boundaries make later changes easier to locate and review.

The tradeoff is more files and some wiring for a small application. Keeping three workflow services avoids introducing a separate class for every tiny function.

## What this does not solve yet

This remains one backend codebase. In-memory mode clears state on restart. PostgreSQL mode persists balances, scans, and redemptions and coordinates those updates across app copies with transactions. Recognition jobs run in a separate worker, and PostgreSQL coordinates upload, IP, and recognition limits across copies. The Compose example still runs one API copy; a multi-copy deployment needs a load balancer and measurement.

The existing HTTP tests remain, and backend/tests/services.test.ts tests workflows directly, including retries, ownership, failed calculations, returned-data isolation, competing redemptions, and cancellation. Run npm test and npm run typecheck from the project root. These checks use local recognizers and do not verify live OpenAI recognition.
