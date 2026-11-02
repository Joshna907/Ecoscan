# Receipt recovery and operational reward review

No end-user login or signup has been added.

## Private receipt recovery

After redeeming a demo offer, click **Generate receipt recovery key**, then download the key file and keep it private. A key is a cryptographically random 256-bit secret. The server stores its SHA-256 hash, never its plaintext. Generating another key for that receipt immediately replaces the previous key. If a response is lost, generating again is safe; it does not issue another receipt or debit points. Keys are not automatically generated on page load or embedded in sample PDFs.

On another browser, use **Rewards → Recover a receipt**. The key is sent in a POST body, never in a URL. This returns only the receipt and its current issued/used/refunded/expired status. It does not recreate the old session, restore a points balance, authorize fulfilment/refunds, or issue a replacement voucher. Anyone holding a key can read its receipt, so do not share the key. The product stores no email, password, or recovery identity. A lost key plus lost session cannot be recovered by guessing a public receipt reference.

Recovery lasts 180 days from original receipt issuance. Voucher expiry remains unchanged (30 days for current demo vouchers). The archive is independent of the anonymous session, so it survives cookie loss and session deletion. Refund/use updates the archive in the same PostgreSQL transaction as the original receipt. All recovery requests are rate-limited, responses are no-store, and invalid attempts contribute to fraud monitoring. Scheduled maintenance deletes expired archives. Existing receipts can get a key while their original session still exists; older receipts whose session was already deleted cannot be reconstructed.

Production requires PostgreSQL. Memory mode is only for local demos and loses recovery data on restart. Activity-evidence credits and their history are not restored by a demo receipt key. Real providers still need their own fulfilment and authorized recovery integration before receipts can represent monetary benefits.

API: `POST /api/offers/:offerId/recovery-key` requires the owning anonymous session and returns the private key once; `POST /api/offers/recover` accepts only `{ "recoveryKey": "..." }` and returns a read-only receipt.

## Review queue

The server records invalid partner signatures, conflicting activity claims, participant limits, duplicate-image attempts, reward limits and invalid recovery attempts. Three matching events for the same opaque subject and rule within 15 minutes create a review. Flags do not automatically declare fraud or remove credits. Replaying the same confirmed scan does not inflate its signal count. Successful activity confirmations and recoveries are counted separately. Event/participant references, recovery keys, cookies, bodies, IP addresses and credentials are not logged. Network subjects are keyed hashes using the stable server `RATE_LIMIT_HASH_KEY`; session subjects are hashes of unguessable session IDs. Partner IDs identify the configured partner, not a person.

Configure individually attributable operator credentials on the server only:

```dotenv
REWARD_REVIEW_OPERATORS=[{"id":"reviewer-one","token":"<cryptographically random secret, at least 32 characters>"}]
```

Use HTTPS except localhost. Do not put this token in the frontend or browser URL. Generate a random value using Node's `crypto.randomBytes(32).toString('hex')`. Removing an operator from the configuration revokes its access. Operators are staff/API credentials; there is no customer account or signup screen.

- `GET /api/internal/rewards-risk` with `Authorization: Bearer <operator-token>` returns 24-hour counts and the oldest 100 unresolved reviews, ordered oldest first. Work through them and refresh to reach later records.
- `GET /api/internal/rewards-risk/:id/audit` returns the append-only decision history for a review.
- `POST /api/internal/rewards-risk/:id` accepts `{ "expectedVersion": 0, "decision": "hold", "reason": "investigating" }`.
- Decisions: `dismiss` an open false positive, `hold` an open subject, `release` a held subject. Reasons: `investigating`, `confirmed_abuse`, `false_positive`, `resolved`. A stale decision version returns 409; reload instead of overwriting another operator's decision. Incoming signal counts do not invalidate that decision version, so active abuse cannot prevent review. The server records the operator ID and timestamp. No API deletes audit entries.

Session holds stop new scan confirmations and new offer redemptions. Partner holds stop activity confirmations. Network holds stop recovery and partner endpoint access from that opaque network subject. Review carefully before blocking a shared network. Receipt viewing, recovery-key generation by the owner, and refunds remain available on session holds. Partner reversals remain available unless the partner's network itself is held. Already committed awards are not silently reversed; use the partner's explicit reversal API for an invalid event. An in-flight request admitted before a hold may complete. If multiple reviews hold one subject, releasing one does not clear another review's hold.

## Monitoring and retention

Signals emit structured `reward_review_required` logs with rule, review ID and count when the matching review is in the oldest 100 unresolved cases. Scheduled cleanup emits `reward_fraud_monitor` aggregate counts, queue size (capped at 100), and oldest unresolved age; age over one hour is marked warning. `reward_monitor_failure` indicates that failure-path observation could not be persisted. Backend/platform log monitoring should alert an assigned operator on these events; no external paging service, email, or person has been configured automatically. The protected queue is also available for a monitoring system to poll.

Security events expire after 30 days. Review decisions, audits and active holds are retained without automatic expiry to preserve accountability; establish a retention policy before a real-value launch. Removing event rows never removes holds or decisions. Use access-controlled backups and an operational reviewer schedule. Holds and monitoring are not a substitute for a trustworthy activity partner or real voucher integration. The application still issues demo offers only.

Migration `012_recovery_and_review.sql` is required. Both backend entry points share PostgreSQL stores and monitored cleanup. Readiness checks inspect all new tables. Run `npm test -w api -- tests/recoverySafety.test.ts` with a disposable `TEST_DATABASE_URL` for cross-replica recovery and review tests, and `npm run test:web -- tests/receipt-recovery.test.tsx` for the account-free UI.
