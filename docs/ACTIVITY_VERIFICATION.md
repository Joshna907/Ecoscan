# Independent qualifying activity evidence

Photo-based demo points are not evidence of ownership, reuse, or avoided purchases. This flow records an approved partner's completed transaction independently of a garment photo. It does not estimate emissions saved and does not enable real voucher redemption.

## User flow

On Rewards, select an approved partner and a supported activity. Generate a 256-bit random code, valid for 15 minutes, and share it only with that partner. The partner confirms the completed activity from its own transaction system. Refresh activity to see the evidence receipt and activity credits. A code is bound to the requesting anonymous session, partner, and activity; it can confirm one event. No browser route can self-confirm an event. The code is not saved by the browser when leaving the page. Request creation is limited to five per session per UTC day; expired codes require a new request. Ordinary API traffic limits also apply.

Confirmed activity credits are a separate ledger from demo points: repair 50, secondhand purchase 25, accepted donation 10, accepted recycling 10. These are illustrative participation weights, not CO₂ conversions, currency, or redeemable value. Photo scans cannot credit this ledger. Offer redemption cannot spend it. Reversed events contribute zero credits. Event history belongs to the anonymous session and cannot be recovered after its loss/expiry.

## Enable an approved partner

Apply migration `011_activity_evidence.sql` with `npm run db:migrate -w api` before deploying. Readiness checks require the new tables. Both server entry points use the shared PostgreSQL evidence store and monitored cleanup. Production will refuse configured verification backed by the memory store. Memory mode is available only for local development/testing and resets on restart.

Configure server-only environment variables:

```dotenv
ACTIVITY_EVIDENCE_HASH_KEY=<cryptographically random stable secret, at least 32 characters>
ACTIVITY_EVIDENCE_PARTNERS=[{"id":"repair-shop","name":"Approved Repair Shop","secret":"<cryptographically random signing secret, at least 32 characters>","activities":["repair"]}]
```

Generate secrets using `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Never put them in frontend/VITE variables, committed files, URLs, or logs. Each partner needs its own ID and secret. Only approve a partner after confirming it can independently validate completed events, use stable opaque transaction and participant identifiers, handle cancellations, and protect its signing key. No external partner has been onboarded automatically; the feature is unavailable when the list is empty. Removing a partner from configuration disables its signing authority. Rotate its signing secret when needed. The evidence hash key must remain stable: rotating it without migrating existing hashes would break duplicate detection.

## Signed partner API

All communication must use HTTPS outside localhost. Send `Content-Type: application/json`, `X-EcoScan-Partner`, `X-EcoScan-Timestamp` (Unix seconds), and `X-EcoScan-Signature` (lowercase SHA-256 HMAC hex). Sign the exact UTF-8 JSON body bytes, not a reconstructed object:

```js
import { createHmac } from 'node:crypto'
const path = '/api/activity-evidence/partner/confirm'
const timestamp = String(Math.floor(Date.now() / 1000))
const body = JSON.stringify({
  code: codeProvidedByUser,
  eventReference: 'opaque-completed-transaction-id',
  participantReference: 'stable-opaque-customer-id',
  activity: 'repair',
  occurredAt: completedAtISOString,
})
const signature = createHmac('sha256', partnerSecret)
  .update(`${timestamp}\nPOST\n${path}\n${body}`).digest('hex')
// POST body exactly as signed, with the four headers described above.
```

The timestamp must be within five minutes. The HMAC binds the method, full request path including any query, timestamp and body. Unknown partners, wrong keys, changed bytes, and stale signatures fail authorization. Keep clocks synchronized; re-sign retries with a current timestamp. A partner can confirm only its configured activity types. Completion time must be within the last 30 days and cannot be in the future. Only attest an activity once it is completed/accepted, never an intention or an unfulfilled order.

The service, not the partner or browser, chooses the credit amount. Do not send names, emails, receipts/photos, payment details, or other personal data. Send the same stable participant reference for the same participant, even if their browser changes. References are case-sensitive opaque IDs; aliases or newly generated participant IDs undermine the limit. HMAC hashes are namespaced by partner and reference kind. Raw event and participant references are not stored or returned; routine logs omit request bodies, headers and codes.

An exact confirmation retry returns the existing evidence receipt without another award, including after code expiry. The same event reference with changed fields returns 409. A previously used code cannot confirm a different event. Duplicate event hashes persist after session deletion. Four events per partner participant in a rolling 30-day window and 1,000 per partner per UTC day are allowed. Reversed events still count toward these limits. Checks and inserts are serialized in a PostgreSQL transaction across sessions and replicas.

For a returned, cancelled or invalid event, sign a POST to `/api/activity-evidence/partner/reverse` with `{ "eventReference": "original-id", "reason": "returned" }`. Reasons: `returned`, `cancelled`, `rejected`. Only the original partner can reverse its event. An identical reversal is idempotent; changed reasons conflict. Reconfirming a reversed event returns its reversed receipt and never restores credits. Corrections require an operator process; the API intentionally has no self-service re-award.

Browser endpoints: `GET /api/activity-evidence` returns this session's evidence, credit balance and public approved partner list. `POST /api/activity-evidence/requests` accepts only `{partnerId, activity}`. Responses use `Cache-Control: no-store`. Keep the original code and confirmation payload in the partner's protected transaction system until the event is acknowledged; a code is not proof of ownership and must never act as a payment voucher.

## Retention and limits of evidence

Unused requests are deleted by scheduled maintenance after a day. Confirmed request hashes and event/participant hashes, activity type, partner name, timestamps, credit policy result and reversals remain to prevent repeat awards. Session links are set null when sessions are deleted, preserving event deduplication without retaining the expired browser identifier. Current policy retains the minimal pseudonymous audit ledger without automatic expiry. Establish an appropriate retention/deletion policy and legal basis with the real partner before launch; deleting or rehashing it can permit old events to be claimed again.

This proves that the configured partner attested an event. It cannot prove the partner is honest, distinguish one person across different partners, or stop collusion/participant aliases. Repair, donation or recycling does not alone prove avoided production, and transaction confirmation is not independent proof of garment ownership. Before assigning monetary value, audit the partner's verification procedure, participant eligibility, fraud review, recovery and operational monitoring. No account has been reintroduced.

The design follows [OWASP REST security guidance](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html) on protecting sensitive business flows, keeping credentials out of URLs and adding controls beyond API keys. Signed requests are combined with request binding, durable replay protection, participant limits, and reversals.

Run `npm test -w api -- tests/activityEvidence.test.ts`; set `TEST_DATABASE_URL` to a disposable PostgreSQL database to also test concurrent claims across replicas and retention of duplicate protection after session deletion. Frontend coverage: `npm run test:web -- tests/activity-evidence.test.tsx`.
