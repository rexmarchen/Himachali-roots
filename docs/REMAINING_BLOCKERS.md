# Remaining blockers and honest status

This document separates what has been built and verified from what still requires external approvals, credentials, legal work or further engineering. It is intentionally conservative: a feature is not "done" because code exists, and an integration is not "configured" because environment variables have names.

Last reviewed: 27 October 2026.

## Verified in this build

- Storefront, customer account, seller workspace and administrator console render and call real APIs, including admin category management, the ten-step seller application and seasonal campaign management.
- Seasonal campaign eligibility, fixed promotional pricing, scheduling/expiry, admin-only management and audit logging work through real HTTP routes. Catalogue, cart and checkout read the same database view for live promotional prices, and order lines retain the original unit price.
- Registration, password login, Google Identity Services sign-in, logout, password reset, email verification token flow and session invalidation work against SQLite. Google tokens are verified server-side; an email collision requires an explicit password-confirmed link rather than an automatic merge.
- Sessions use opaque hashed tokens, rotate on sign-in, expire on both an absolute and an idle window, and are cleared server-side on logout. Disabled accounts are refused. The browser never receives an admin, seller or customer identity from a fabricated local fallback.
- Server-side RBAC and ownership checks protect customer, seller and admin routes.
- Seller applications save as drafts, resume at the saved step, enforce category-aware requirements (FSSAI for food), and cannot be submitted incomplete.
- Application decisions are server-enforced state transitions with reason requirements, self-approval refusal, seller notifications, review history and audit entries.
- Checkout reprices the cart on the server, reserves stock atomically, enforces idempotency and splits multi-seller orders.
- The redesigned checkout presents three accessible stages, real cart totals, saved-address editing, coupon revalidation, configured-payment-only cards, server-confirmed payment states and resume-payment handling. New server tests cover empty bags, invalid addresses and coupons, post-discount shipping and duplicate-safe payment resume. No browser-level visual test exists.
- Coupon redemption, shipping thresholds, GST-inclusive snapshotting and commission snapshots are tested.
- Seller fulfilment enforces confirm → pack → ship → deliver and isolates sellers.
- Payment verification creates ledger entries; duplicate webhook events do not double-apply.
- Cancellation, return and refund accounting posts proportional ledger deductions and commission reversals.
- Seller documents are private and protected by magic-byte checks, ownership authorization and `no-store` responses.
- Manual settlements accept only an explicit bank/UPI reference before marked paid.
- `npm run check` passes: typecheck, lint, the full test suite and production build.
- `npm run build` produces the production SPA (282.72 kB bootstrap chunk, no source maps, no chunk-size warning). `scripts/build-web.mjs` forces `NODE_ENV=production` before Vite reads a local `.env`, so a developer setting cannot ship React's development bundle.
- The Docker image was built and smoke-tested in an earlier pass: unprivileged user, SPA and API on one origin, readiness with the current schema, administrator login and a verified SQLite backup. This validates the deployment artifact locally, not the live host.
- `npm run smoke` passed 28/28 non-admin live HTTP checks in an earlier development run (33 with admin credentials); it was not re-run against production.
- A seller-lifecycle E2E run passed 53/53 checks against a disposable API and database in an earlier run.
- The legacy-migration test upgrades a pre-onboarding (v1–v2) database to migration 8 with rows preserved; `integrity_check` and foreign-key checks are clean in the test database.
- On 27 October 2026, `npm run typecheck`, `npm run lint`, `npm test` (154 tests / 18 files) and `npm run build` all passed. The live host returned real JSON for `/api/health`, `/api/health/ready`, `/api/config`, `/api/products` and `/api/auth/me`, with payments unconfigured and 0 products.

Evidence and exact outcomes are in [Verification](VERIFICATION.md).

## Launch blockers

### 1. Live Razorpay has not been exercised

**State:** Order creation, checkout signature verification, webhook HMAC verification, idempotency and refund API calls are implemented. Local tests sign synthetic payloads.

**Missing:** Real Razorpay test/live credentials, a public HTTPS webhook endpoint, a completed merchant account, and a real end-to-end payment + refund test.

**Risk:** Provider payload differences, onboarding restrictions, settlement behaviour and dashboard configuration remain unproven. Do not accept real money until [the payment checks](LAUNCH_CHECKLIST.md#e-payments-and-money) pass.

**Unblock:** Complete merchant onboarding, configure keys and webhook secret, run the test matrix with test keys, then repeat with a small live transaction.

### 2. Transactional email is unconfigured and unverified

**State:** Resend transactional email is implemented with per-request timeout, bounded retries, `Idempotency-Key`, atomic dedupe, provider message ids and sanitised errors; SMTP remains a fallback. Without either provider, records are marked `skipped`; failures are marked `failed`. `retryFailedNotifications` can retry failed rows manually.

**Missing:** A fresh Resend key, a verified sending domain with SPF/DKIM/DMARC, live delivery testing, bounce/complaint handling and an automatic background outbox worker.

**Risk:** Customers may not receive verification, password reset, order or refund notices. Password reset is unusable for a real customer without dev helpers. A leaked Resend key must be revoked and replaced, never reused.

**Unblock:** Create a fresh Resend key, verify the domain, send every event to a monitored inbox, check `notifications` rows, and schedule the manual retry helper until an outbox worker exists.

**Mobile verification:** No SMS provider is configured. The application reports `sms: false` and relies on email verification; a phone number collected during onboarding is not independently verified by the platform.

### 3. Shipping is manual; Shiprocket is not implemented

**State:** Sellers can record carrier, tracking number, tracking URL and shipment events. The admin can perform the same actions. Customer-facing tracking exists.

**Missing:** Courier rate calculation, label generation, pickup scheduling, webhook tracking, serviceability checks, RTO automation and a Shiprocket adapter. `SHIPROCKET_*` variables are inert.

**Risk:** Operations depend on staff copying data between carrier portals. Shipping is a flat ₹79/₹1,499 threshold, not live carrier cost.

**Unblock:** Either operate the documented manual process with a courier account, or build and test a provider adapter before promising automated logistics.

### 4. Seller payouts are manual

**State:** The ledger and settlement batches calculate eligibility after delivery + 7 days. A payout requires a bank/UPI reference. Adjustments are audited.

**Missing:** Automated payout rail (Razorpay Route, bank API, etc.), beneficiary verification, payout webhooks, reconciliation, tax withholding and retry handling.

**Risk:** Settlement operations are staff-driven. The software does not prove money reached a seller; it records that an operator says it did.

**Unblock:** Keep manual dual-control settlement or complete a payout provider integration, including failure/return handling and daily reconciliation. Do not advertise "instant payouts".

### 5. GST calculation and tax invoices are not production-ready

**State:** Prices are GST-inclusive. `tax_rate_bp` defaults to 0; the tax component is snapshotted but not added. There is no invoice document, invoice number series, HSN/SAC master or credit-note flow.

**Missing:** CA-confirmed rates/HSN mapping, place-of-supply logic, invoice generation, marketplace commission invoicing, TCS/TDS treatment and statutory retention/reporting.

**Risk:** The marketplace cannot issue compliant tax invoices from this build. Showing a tax breakdown would be misleading today.

**Unblock:** Obtain tax advice, configure rates, implement invoice/credit-note generation, test rounding and reconcile with the accountant before launch.

### 6. SQLite is single-node; Supabase/PostgreSQL is not implemented

**State:** The database is a complete relational SQLite schema with foreign keys, WAL and transactions. It is a deliberate substitution because no Supabase project or credentials existed.

**Missing:** PostgreSQL/Supabase schema, pooled Postgres data layer, RLS (if exposing a client key), managed backup/HA, and a tested migration of live data. The app currently relies entirely on server-side authorization; browser clients never receive DB credentials.

**Risk:** One Node process only; no horizontal scaling or managed failover. SQLite backups and WAL need proper operational care.

**Unblock:** For a small single-node launch, operate SQLite with the documented backups. For scale or managed HA, perform the PostgreSQL migration in [Deployment](DEPLOYMENT.md#moving-to-postgresql-or-supabase).

### 7. Legal and policy content is draft

**State:** Shipping, returns, privacy, terms, seller terms, authenticity and cookies pages exist with realistic draft copy. Business fields are bracketed placeholders. The seller application records the accepted agreement version and commission disclosure, but that text is drafted by the project, not by a lawyer. The UI does not invent certifications.

**Missing:** Lawyer review, correct legal entity/GSTIN/address, grievance officer details, DPDP notice/consent review, reviewed seller agreement and commission disclosure, and a records-retention policy.

**Risk:** Publishing draft policy text, or admitting sellers under unreviewed commission/termination terms, creates consumer-protection and privacy exposure.

**Unblock:** Complete and date every policy, remove draft banners, and publish business/grievance details. This is a gating requirement, not a wording polish.

### 8. Administrator MFA is absent

**State:** Strong scrypt passwords, session expiry, secure cookies, rate limits, RBAC and audit logs are implemented. The admin CLI enforces password complexity.

**Missing:** TOTP/WebAuthn second factor, device/session management and step-up authentication for refunds/settlements.

**Risk:** A stolen administrator password gives full marketplace control. Restrict admin access, use unique credentials and monitor sessions until MFA is added.

**Unblock:** Add MFA before handling meaningful money, or enforce compensating network/identity controls.

### 9. Observability and operational hardening are incomplete

**State:** Structured JSON logs, health endpoint, audit log and graceful shutdown exist.

**Missing:** Wired error tracking (`SENTRY_DSN` is unused), metrics, alerting, log retention, distributed rate limiting, email retry, and tested production backup restore.

**Risk:** Failures may be discovered by customers. The backup script exists, but a restore has not been performed on a production-like host in this build.

**Unblock:** Connect logs/errors to a monitored service, define alerts, test restore, and document on-call ownership.

### 10. Production content and photography are placeholders

**State:** Demonstration catalogue, sellers, reviews (none fabricated) and Wikimedia photography with recorded credits.

**Missing:** Real seller KYC, real product evidence, original photography, completed business copy, and an image-rights audit for any new assets.

**Risk:** Demo data must never look like live trading history. Wikimedia photos are illustrative and may not depict the actual product or origin.

**Unblock:** Remove the seed, onboard verified sellers, commission product photography, and update `/credits`.

### 11. Production provider refunds are unverified

**State:** Admin approval queues a refund and the refund API path exists. Local tests cover the manual refund record and ledger treatment. The real Razorpay refund call is not exercised.

**Missing:** Provider test-mode refund, webhook `refund.processed` confirmation, partial refund reconciliation and failure handling.

**Risk:** A refund could be recorded locally without the provider having completed it, or vice versa. The UI requires a reference, but operators must still reconcile with Razorpay.

**Unblock:** Run provider refund tests and establish daily reconciliation.

### 12. Customer email verification is not required at checkout

**State:** Verification tokens and links work. Accounts can check out before verifying their email.

**Missing:** A product decision and, if required, a checkout gate or risk-based restriction.

**Risk:** Order notices may go to an unverified address, complicating support and account recovery.

**Unblock:** Decide the policy. If verification is mandatory, enforce it server-side before checkout and provide a resend path that works with real SMTP.

### 13. Scale limits are known and documented

**State:** SQLite single writer, in-process rate limits, local disk uploads and manual settlements.

**Missing:** Shared cache/rate-limit store, object storage/signed URLs, background job queue, multiple app instances and load testing.

**Risk:** Traffic spikes, large catalogues or multi-instance deployment will expose these limits.

**Unblock:** Migrate to PostgreSQL, object storage and a shared rate-limit store before horizontal scaling. Load-test against the target topology, not a laptop.

### 14. Origin and sample inspection is a manual record

**State:** Administrators can mark `origin_verified` on a listing and record reasons/audit entries for decisions. Seller applications collect origin narratives, materials and category evidence.

**Missing:** An inspection workflow with assigned reviewers, sampling, visit/lab records, lot or batch evidence, expiry of verification, and scheduled re-verification. `origin_verified` is a claim backed by whatever evidence staff keep outside this build.

**Risk:** A listed "verified" origin may not be reproducible if the evidence lives in email or spreadsheets. Category evidence is reviewed but not versioned as a formal certificate.

**Unblock:** Define an inspection protocol, store evidence against the seller/product record, and re-verify on a schedule. Do not display origin claims beyond what the evidence supports.

### 15. Verification-document retention is manual

**State:** Seller documents are private, access-controlled and can have an `expires_at` value. Administrators can accept or reject each document with a note.

**Missing:** Automated retention/deletion rules, a documented lawful basis for each document type, subject-access/export tooling, and a purge job for rejected or expired identity evidence.

**Risk:** Identity documents may be kept longer than necessary or longer than the privacy notice states.

**Unblock:** Agree retention periods with counsel, document them in the privacy notice, then implement scheduled purge and an audited deletion path. Backups must follow the same policy.

### 16. Google sign-in has not been exercised against Google

**State:** The Google Identity Services button, server-side ID-token verification, account creation, returning-user sign-in, explicit linking, unlink and disabled-account refusal are implemented and covered by injected-verifier tests. CSP and config plumbing are in place.

**Missing:** A real Google Cloud OAuth Web client, authorised production JavaScript origins, a consent-screen review if Google requires one, and a browser test with real Google accounts.

**Risk:** Library, consent-screen or CSP behaviour could differ from the fake-verifier tests. A misconfigured origin hides the button or blocks the popup, and users may fall back to password login.

**Unblock:** Follow [Google sign-in go-live](DEPLOYMENT.md#google-sign-in-go-live), test new/returning/collision/disabled cases in a clean browser, then remove the "Google sign-in unavailable" fallback from the launch announcement if it cannot be completed.

### 17. Legacy static bundle and exposed credentials

**State:** On 27 October 2026, `https://www.dearhills.in` is served by the Express process behind Caddy and `/api/*` returns real JSON, so the old static bundle is no longer the live application. The old bundle had contained a hardcoded administrator email/password and a fabricated `localStorage` session; those were removed from this branch. Any cached copy, service worker, Vercel preview or shared link may still exist.

**Risk:** The former credentials must be treated as public and compromised. Anyone reusing that password elsewhere is exposed.

**Unblock:** Rotate every password that appeared in the old bundle, rotate the Google client secret, revoke any exposed Resend/Razorpay keys, confirm the Vercel project no longer claims the custom domain, and ask users/ staff to hard-refresh or clear cache. Verify `/api/health/ready` returns 200 and the browser bundle no longer contains the old strings.

## Deliberate non-goals / product decisions

- **Guest checkout is not supported.** Guest carts merge after login.
- **No fake reviews or sales statistics.** Reviews require a delivered purchase.
- **No invented certifications or origin badges.** `origin_verified` is an admin-controlled claim requiring evidence.
- **No automated payouts or live shipping claim.**
- **No payment provider other than the existing, unconfigured Razorpay adapter is integrated.** Cashfree, PhonePe and Stripe are not implemented. Payment-gateway integration is out of scope for this build.
- **No mobile apps, subscriptions, GST invoice PDFs, CMS page builder or multi-currency support.**

## Launch statement

The application can be demonstrated end to end today with development payment simulation and manual dispatch. It cannot honestly be called a live, legally compliant marketplace until at least blockers **1–7** and **14–16** are closed, the credential rotation in **17** is confirmed, with **8–11** strongly recommended before accepting material transaction volume. Payment-gateway work (blocker 1) must be separately scoped and is not claimed by this build.
