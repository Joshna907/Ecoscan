# Anonymous sessions and offer lifecycle

Receipt recovery is now available separately from session recovery: save a private key while the original receipt is accessible, then retrieve its current read-only status for 180 days from issuance. This does not restore balances or activity credits. See [recovery and operational review](RECOVERY_AND_FRAUD_REVIEW.md); it supersedes the earlier receipt-recovery limitations below.

EcoScan has no user accounts, passwords, signup/login routes or JWT dependency. Browser state uses an opaque, HTTP-only session cookie. The browser cookie lasts up to 30 days; an inactive session normally expires after the configured inactivity window. Unexpired voucher receipts pin their session until voucher expiry. Results and demo balances expire with that session and cannot be recovered across devices. Migration 010 removes legacy account credential tables while preserving session balances/results until their normal expiry. Apply it only when deploying the anonymous application; old account code must not remain in service afterward.

## Reward integrity

The backend stores visual signatures across sessions for 90 days. It compares the original signature and background-trimmed 0/90/180/270-degree variants. This catches common background crops and rotations, metadata edits, recompression and resizing. It cannot identify all views of the same garment or prove ownership, reuse, purchase displacement, or one human per browser. Tight crops and materially different backgrounds can still evade it; similar products can collide. Points remain explicitly fictional. Do not exchange them for money or real benefits without independently verified partner activity and additional fraud controls.

## Working demo partner

Independent qualifying activity now has its own [signed partner confirmation flow](ACTIVITY_VERIFICATION.md), with short-lived codes, durable event deduplication, stable partner participant limits and reversals. Its activity credits are separate from the demo offer balance and cannot redeem offers. No verification partner is enabled by default. This establishes partner-attested activity, not ownership or measured avoided emissions.

The integrated partner is **EcoScan demo partner**, not a claimed partnership with an external retailer. Offers have explicit terms and catalogue expiry; issued demo vouchers expire after 30 days. Each offer starts with 100 units in the demo database. PostgreSQL reserves stock and debits points atomically. Memory mode keeps the same behavior until restart. This implements the lifecycle for a take-home demo without buying gifts or inventing commercial relationships.

- `GET /api/offers`: authoritative balance, current inventory, eligibility, terms and receipts. Refreshing this reconciles the browser with server state after uncertain responses.
- `POST /api/offers/:id/redeem`: returns the original receipt on retry with the current balance. No second debit or stock reservation. One lifetime redemption per offer/session, including after a refund.
- `POST /api/offers/:id/refund`: refunds an unused or expired demo voucher once and returns its stock. A used voucher cannot be refunded by the browser. Refund retries are idempotent.
- `POST /api/offers/:id/demo-use`: browser-owned simulation for the built-in demo partner only. UI confirmation makes clear this issues no goods. It marks a demo voucher used and disables refund.
- `POST /api/offers/vouchers/:reference/use`: trusted partner fulfilment. Requires `Authorization: Bearer <PARTNER_API_SECRET>` with a secret of at least 32 characters. Missing partner configuration returns 503 and unauthorized calls return 401. Consuming the voucher changes its status to used; the reference is the partner's idempotency identifier. Never expose the partner secret to frontend code.

Voucher statuses are issued, used, expired (derived from its expiry time), and refunded. Stock and balance changes are serialized with transactions. Receipts/PDFs are presentation records, not permission to issue real products. Expired unused receipts can be explicitly refunded. Session expiry means browser access is lost; do not promise real-value recovery in an anonymous prototype.

## Real provider onboarding

Tremendous was researched as a possible future fulfilment adapter: its [order API](https://developers.tremendous.com/reference/create-order) supports sandbox orders and idempotent `external_id` values. It requires a provider organization, credentials, funded campaigns/products and commercial decisions. None were provided, so no provider account, purchase or real voucher was created. A generic gift-card catalogue is not automatically an appropriate sustainability partnership.

Before a real integration, establish partner terms, lawful participant eligibility and evidence, a recovery mechanism compatible with no login, provider sandbox credentials, funding limits, signed event verification, an issuance outbox, failed/pending issuance reconciliation, and provider-specific cancellation/refund rules. The demo inventory/receipt state machine is not a substitute for those external arrangements.
