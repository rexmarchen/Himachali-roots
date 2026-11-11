# Dear Hills — Live Production Readiness Audit

**Target:** `https://www.dearhills.in` (apex `https://dearhills.in` redirects to `www`)
**Audit date:** 10 November 2026
**Mode:** Read-only production audit. No accounts, orders, payments, refunds, payouts, or production records were created. No server, database, payment, secret, or deployment configuration was changed.
**Repository state reviewed:** branch `release/staging-2026-10-27`, HEAD `a8de16e` (working tree clean at audit time)
**Verdict:** **NO-GO — do not launch or take real customer money in the current state.**

---

## A. Scope, method and evidence standard

### A.1 What was examined

- Live HTTP behaviour of the public site, catalogue, policies, health endpoints, authentication endpoints, payment webhook, shipping webhook, and protected admin/seller/customer endpoints.
- DNS, TLS, HTTP security headers, cookie attributes, rate-limit behaviour, static asset sizes, and basic latency.
- Source review of authentication, onboarding, product compliance, checkout, payments, shipping, refunds, ledger, settlement, admin moderation, and uploads.
- Prior project documentation and environment defaults, where they affect live behaviour.

### A.2 Evidence labels

| Label | Meaning |
|---|---|
| **LIVE** | Directly observed from the production origin during this audit. |
| **CODE** | Verified in the repository source. The deployed build may differ; deployment provenance is itself a finding. |
| **UNVERIFIED** | Cannot be established without server, database, provider-dashboard, or authenticated access. |
| **INFERRED** | A reasoned conclusion from indirect evidence, not directly proven. |

### A.3 Limits

No production shell, database console, admin account, seller account, customer account, Razorpay dashboard, email provider dashboard, or cloud console was available. Therefore this audit does **not** prove:

- CPU, RAM, disk, filesystem permissions, SQLite integrity, WAL behaviour, backup existence, backup encryption, or restore success.
- Actual Razorpay dashboard webhook configuration, account KYC status, settlement cycle, or dispute settings.
- Actual transactional email delivery, bounce handling, or inbox monitoring.
- Authenticated seller onboarding, admin moderation, checkout, refund, or settlement workflows.
- Concurrency, failover, or load behaviour. No stress test was run.

Those items are explicitly listed as unverified rather than assumed to work.

### A.4 Safety constraints observed

- No fake accounts were registered.
- No carts were converted to orders.
- No Razorpay orders or payments were created.
- No refunds or payouts were triggered.
- No destructive penetration testing, fuzzing at scale, or load testing was performed.
- No secrets, tokens, API keys, customer data, or seller PII are reproduced in this report.

---

## B. Executive summary and launch decision

Dear Hills has a credible visual storefront and several good security foundations: valid TLS, strong HTTP security headers, HttpOnly/Secure session cookies, Argon2id password hashing, server-side authorization checks, and sensible separation between manual refunds and provider refunds. The team also describes manual payouts honestly in the seller API rather than claiming automatic bank transfers.

That is where the launch readiness ends.

The live production system currently has **multiple independent, launch-blocking failures**:

1. **Password login is broken for every well-formed login request.** Live `POST /api/auth/login` returns HTTP 500 for any email/password payload, including a non-existent account. Password reset also returns 500. A marketplace cannot onboard sellers or let customers reach checkout without working authentication.
2. **Live Razorpay is in `live` mode but has no webhook secret configured.** The payment webhook returns 503. Payment confirmation therefore depends on the customer's browser returning to the site. A customer who pays and closes the tab can leave money captured against an order that never becomes paid.
3. **The shipping webhook is unauthenticated.** Anyone who can reach `/api/webhooks/shipping` can potentially mark a shipment delivered, mark seller orders delivered, and make seller ledger entries payout-eligible. The malformed-body probe returned 500, but the code path has no signature check.
4. **Seller registration and final submission are internally inconsistent.** The registration form does not send the server-required `acceptedTerms: true`. The final review screen keeps agreement checkboxes in local state while the parent checks a different, untouched object. A new seller cannot reliably complete onboarding.
5. **The live catalogue is not a production catalogue.** Of 29 public products, 27 are demo products. A ₹1 “Fresh Banana” is marked `isDemo:false`, carries `originVerified:true`, has stock 997, and its public description says it exists “to test live payments and gateway verification.” Its seller is a demo seller. This is a live trust and misrepresentation problem, not a cosmetic one.
6. **Consumer legal pages are drafts with placeholders.** All policies return `status:"draft"` and `lastUpdated:"Draft - legal review pending"`, with `[LEGAL ENTITY NAME TO BE CONFIRMED]`, `[REGISTERED ADDRESS]`, `[NAME]`, `[GRIEVANCE EMAIL]`, and `[PHONE]`. The public `/api/config` exposes `legalReviewRequired:true`.
7. **There is no working inbound support mailbox.** The domain has no MX record. `support@dearhills.in` is advertised but cannot receive normal inbound mail. Apex SPF is absent; a delegated sending subdomain and a Resend DKIM selector exist, but inbound support and grievance handling are not configured.

A launch in this state would expose non-technical Himalayan sellers to a broken onboarding path and manual payout risk, and would expose customers to a checkout that can take money without reliable order confirmation. It would also expose the business to consumer-protection and payment-obligation risk because the legal entity, grievance officer, and refund/support channels are placeholders.

### B.1 Launch decision

**NO-GO.** Freeze public selling and marketing that implies a functioning marketplace until the P0 gates in section N are met and re-tested on production with authorised test accounts.

### B.2 What would justify a re-audit

A re-audit is justified only after:

- Login, registration, email verification, and password reset pass end-to-end on production for customer, seller, and admin roles.
- Razorpay webhook signature verification is configured and tested in test mode for `payment.captured`, `payment.failed`, `refund.processed`, and `refund.failed`.
- The shipping webhook rejects unsigned requests and has replay protection.
- A real seller application can be submitted and reviewed end-to-end.
- The public catalogue contains no demo/test listings and no unsupported origin claims.
- Legal pages are published with a real entity, address, grievance officer, and working contact channels.
- Inbound and outbound email are both tested.
- A database backup has been restored successfully in a non-production environment.

---

## C. Readiness scorecard

Scores are separate judgements, not a weighted average. A high score in one area does not compensate for a launch blocker in another.

| Dimension | Score /100 | Basis |
|---|---:|---|
| Customer storefront and catalogue presentation | **40** | Site loads, catalogue API works, but 27/29 products are demo and one live test listing is purchasable-looking. |
| Authentication and accounts | **20** | Strong primitives, but all live password logins return 500; reset also 500. |
| Seller onboarding and KYC | **15** | Registration and final submission have hard code-level blockers; payout details self-verify. |
| Product listing and regulatory compliance | **20** | Raw produce is forced into full food-compliance fields; admin edit can publish without validation; test data live. |
| Checkout and payments | **15** | Live keys but no webhook; confirmation depends on browser callback; provider amount/status not fetched. |
| Orders and shipping | **30** | Core state model exists, but unauthenticated shipping webhook can drive delivery and payout eligibility. |
| Refunds, ledger, commission, payouts | **25** | Manual payout model is honest, but holds are not enforced and refund sequencing is unsafe. |
| Admin controls and application security | **45** | RBAC, 401s, CORS rejection, headers, and hashing are good; publish bypass and unverified MFA reduce confidence. |
| Legal and consumer protection | **5** | Draft policies, placeholder entity/grievance details, no working support inbox. |
| Email and support operations | **10** | No MX; outbound delivery unverified; advertised support address cannot receive normal mail. |
| Reliability and observability | **25** | Health endpoint is shallow; auth 500 proves readiness does not cover core workflows; backups/monitoring unverified. |
| Performance and scalability | **30** | No CDN observed; ~1.34 s TTFB; 466 KB hero; 11 MB video with revalidation; single-node architecture. |
| Seller usability for non-technical farmers/artisans | **15** | Ten-step English-language form, heavy compliance vocabulary, broken submit path, no assisted KYC evidence. |
| **Overall launch readiness** | **18** | Multiple independent P0 failures in auth, payments, onboarding, catalogue, legal, and support. |

---

## D. Critical findings

### C1 — Live password authentication returns HTTP 500 for every well-formed login

**Severity:** Critical
**Evidence:** LIVE
**Affected:** all customer, seller, and admin password logins

Observed on 10 November 2026:

- `POST /api/auth/login` with `{}` or no body → `400` validation error.
- `POST /api/auth/login` with a syntactically valid email and any password → `500` with `{"error":{"code":"internal_error","message":"Something went wrong on our side. Please try again."}}`, consistently around 1.3 s.
- The same 500 occurs for an email that almost certainly does not exist, so the failure happens before a normal “invalid credentials” decision.
- `POST /api/auth/forgot-password` with a non-existent address → `500`.
- `POST /api/auth/google` with an invalid credential → `500` rather than a controlled 400/401.
- `GET /api/auth/me` with a forged cookie → `200 {"user":null}`, which is the correct behaviour for an invalid session.

**Why it matters:** No new or returning password user can sign in. Seller onboarding cannot start, checkout cannot be reached by an unauthenticated customer, and admin operations cannot be performed through the normal login path. The fact that `/api/health/ready` reports `database:"up"` and `schema:"current"` shows the readiness check does not exercise authentication.

**Likely causes, not proven:** Deployed code and production schema may not match, or a runtime exception occurs in the user lookup / password verification path. The exact cause requires production logs. This report does not guess a root cause as fact.

**Required fix:** Reproduce with production logs, correct the deployed schema/code mismatch, and add a production smoke test that asserts: valid login → 200, invalid password → 401, unknown email → 401, malformed body → 400, and **no 500 for any well-formed credential payload**.

---

### C2 — Razorpay is live, but the payment webhook is not configured

**Severity:** Critical
**Evidence:** LIVE + CODE
**Affected:** payment confirmation, failed payments, refunds, reconciliation

Live `/api/config` reports:

```json
{
  "payments": {
    "provider": "razorpay",
    "configured": true,
    "webhookConfigured": false,
    "mode": "live",
    "devPaymentsEnabled": false
  }
}
```

Live `POST /api/webhooks/razorpay` with an empty body returns:

```http
HTTP/1.1 503 Service Unavailable
{"error":"Webhook secret not configured."}
```

**Why it matters:** The code requests `payment_capture: true` when creating Razorpay orders; the live account's capture configuration was not verifiable. If auto-capture is active, money can be captured without the webhook being present.

- A captured payment is only reflected if the customer's browser successfully calls `/api/payments/verify`.
- Closing the tab, losing connectivity, or a client-side error after payment can leave the order `pending_payment` while the customer has been charged.
- `payment.failed` events are not processed.
- `refund.processed` events are not processed, so provider refunds may never be marked complete locally.
- Reconciliation depends on manual dashboard checks.

**Required fix:** Configure the webhook secret and endpoint in the Razorpay dashboard, verify the raw-body signature, make handlers idempotent, and test `payment.captured`, `payment.failed`, `refund.created`, `refund.processed`, and `refund.failed` in test mode. Do not use live money for testing.

---

### C3 — The shipping webhook is unauthenticated and can drive delivery and payout eligibility

**Severity:** Critical
**Evidence:** LIVE endpoint reachable without auth; CODE path confirmed
**Affected:** order status, seller ledger, payout eligibility, customer notifications

Live `POST /api/webhooks/shipping` with `{}` returns `500`. That only shows the handler is reachable; it does not show authentication.

Code review confirms the route has no signature check:

- `server/routes/shop.ts:384-388` calls `processShippingWebhook(db, req.body)` with no HMAC, shared secret, timestamp, carrier allowlist, or IP restriction.
- `server/lib/shipping.ts:539-540` maps a `DELIVERED` status.
- `server/lib/shipping.ts:586-610` marks the seller order delivered, marks items delivered, and updates matching `seller_ledger_entries` from `pending` to `eligible` with an `available_at` date.
- The same path sends a customer notification.

**Why it matters:** An unauthenticated caller who can construct a valid-shaped payload can potentially fake delivery and start the payout clock for a seller order. That is a financial-integrity and fraud issue, not just a webhook-hardening issue. The idempotency guard `shipment.status !== 'delivered'` prevents duplicate effects after the first delivery, but it does not authenticate the first caller.

**Required fix:** Require a carrier-specific HMAC or shared secret, verify it against the raw body, enforce timestamp/replay protection, restrict by source where possible, and reject unsigned requests with 401. Add an audit event for every accepted delivery. Test with a signed fixture and an unsigned rejection.

---

### C4 — Seller registration cannot satisfy the server contract

**Severity:** Critical
**Evidence:** CODE
**Affected:** every new seller application

The registration UI sends only name, email, and password:

- `src/pages/onboarding/Step1Account.tsx:68-75` posts `fullName`, `email`, and `password`.

The server requires a literal `true` for `acceptedTerms`:

- `server/routes/auth.ts:38-44` defines `acceptedTerms: z.literal(true, ...)`.

The UI does have a local `agreedTerms` checkbox, but it is never included in the request body. A new seller therefore receives a validation failure from the server even when the checkbox is ticked.

**Why it matters:** Combined with C1, there is no reliable path for a new seller to create an account and begin onboarding. This is not a cosmetic mismatch; it is a hard contract violation.

**Required fix:** Send `acceptedTerms: true` only after the checkbox is checked, record the terms version and timestamp server-side, and add an end-to-end test that registers a test seller in staging.

---

### C5 — Final seller submission is blocked by stale agreement state

**Severity:** Critical
**Evidence:** CODE
**Affected:** every new seller at the final review step

`src/pages/onboarding/StepReviewSubmit.tsx:22-24` creates local state for the three agreement checkboxes. The checkboxes update that local state at lines 254-285, but the values are never propagated to the parent `form.agreements` object.

The parent submission handler checks the untouched object:

- `src/pages/BecomeAMakerPage.tsx:286-289` blocks unless `form.agreements.sellerAgreement`, `commissionDisclosure`, and `authenticityPolicy` are all true.
- `toPayload` at `src/pages/BecomeAMakerPage.tsx:79-84` then sends those stale values.

A new applicant who ticks every box can still be told to “confirm all required declarations” and cannot submit. Changing the checkbox state only affects the child component.

**Why it matters:** Even if registration were fixed, the seller cannot complete the application. This is a second independent onboarding blocker.

**Required fix:** Lift agreement state into the wizard form, or pass an `onAgreementsChange` callback and update the parent before submit. Record the exact agreement version and timestamp. Add a test that ticks all boxes, submits, and receives a submitted application.

---

### C6 — The live catalogue contains demo and test data presented as real

**Severity:** Critical
**Evidence:** LIVE
**Affected:** customer trust, origin claims, payment testing, regulatory posture

Live `GET /api/products?pageSize=100` returns:

- `total: 29`
- `isDemo:true`: 27
- `isDemo:false`: 2

The two non-demo listings are:

| ID | Name | Price | Stock | Seller | Notes |
|---|---|---:|---:|---|---|
| `prd_banana_1_rupee` | Fresh Banana | ₹1 (100 paise) | 997 | `Kullu Loom Collective (demo)` | `isDemo:false`, `originVerified:true`; description explicitly says it is a ₹1 test listing |
| `prd_58b36286-...` | Apples | ₹600 | 10 | `new-maker` | Real-looking listing, generic description |

The banana’s public product response includes:

```json
{
  "name": "Fresh Banana",
  "pricePaise": 100,
  "stock": 997,
  "isDemo": false,
  "originVerified": true,
  "sellerName": "Kullu Loom Collective (demo)",
  "categorySlug": "fruits-and-fresh-produce",
  "shortDescription": "Fresh mountain banana listed for ₹1 test transaction.",
  "description": "Fresh ripe banana listed at exactly ₹1 (100 paise) to test live payments and gateway verification."
}
```

**Why it matters:** A customer can see a ₹1 test item from a demo seller, marked as non-demo and origin-verified. This misrepresents both the seller and the origin claim. It also means the public catalogue is not a curated marketplace yet; it is a staging dataset exposed to customers.

**Required fix:** Remove every demo/test product from the public catalogue, or hard-exclude `isDemo` and known test IDs at the query layer. Never set `isDemo:false` on a demo seller’s product. Re-check all `originVerified:true` claims against evidence. Add a production data-quality gate that fails if any demo seller, test SKU, or ₹1 listing is publicly visible.

---

### C7 — Consumer legal pages are drafts with unresolved placeholders

**Severity:** Critical
**Evidence:** LIVE
**Affected:** consumer protection, contract formation, grievance handling, privacy notices

All live policy endpoints return draft status and placeholder legal details. For example, `GET /api/policies/shipping` returns:

```json
{
  "policy": {
    "title": "Shipping policy",
    "status": "draft",
    "lastUpdated": "Draft - legal review pending",
    "summary": "... This draft must be reviewed before launch.",
    "sections": [...]
  }
}
```

The published content includes:

- `[LEGAL ENTITY NAME TO BE CONFIRMED]`
- `[REGISTERED ADDRESS]`
- `[NAME]`
- `[GRIEVANCE EMAIL]`
- `[PHONE]`
- `[CITY, HIMACHAL PRADESH]`
- `[IF APPLICABLE]` for GSTIN

The privacy policy also says passwords are stored as “salted scrypt hashes,” while the code uses Argon2id (`server/core/security/PasswordService.ts`). That is a factual inaccuracy in a consumer-facing notice.

`/api/config` advertises `legalReviewRequired: true`. The public About page repeats the placeholder entity and address.

**Why it matters:** The marketplace is asking customers and sellers to contract with an unnamed entity, provides no functioning grievance officer, and publishes a draft privacy notice. This is a launch blocker under ordinary consumer-protection and marketplace expectations, independent of any specific legal interpretation.

**Required fix:** Complete entity registration details, registered address, GSTIN (if applicable), grievance officer name/email/phone, response timelines, jurisdiction, and all policy text; obtain legal review; correct the password-hashing statement; publish `status:"published"` with a real `lastUpdated`; and remove `legalReviewRequired` only after sign-off.

---

### C8 — The advertised support address has no inbound mail configuration

**Severity:** Critical
**Evidence:** LIVE DNS
**Affected:** customer support, seller support, grievance handling, order/refund communication

DNS observations:

- `dearhills.in` MX query returns only an SOA; **no MX records**.
- Apex TXT contains only a Google site-verification record; **no apex SPF**.
- `_dmarc.dearhills.in` is `v=DMARC1; p=quarantine; adkim=r; aspf=r; ...`.
- A Resend DKIM selector exists (`resend._domainkey`).
- A delegated sending subdomain has an SPF record for a third-party sending service.

**Why it matters:** The site advertises `support@dearhills.in`. Without MX, normal inbound mail to that address is not configured. Customers cannot ask for help, sellers cannot escalate a payout or compliance problem, and the grievance channel in the draft policies is a placeholder. Outbound transactional mail may work through the sending provider, but that is unverified and does not solve inbound support.

**Required fix:** Add MX records for a monitored mailbox provider, configure SPF and DMARC alignment for the actual sender, create and monitor `support@` and a grievance mailbox, test inbound and outbound delivery, and publish the real addresses only after tests pass.

---

## E. High-severity findings

### H1 — Admin payout holds are advisory, not enforced in settlement generation

**Severity:** High
**Evidence:** CODE
**Affected:** seller payouts, fraud/quality holds

Admin can set a hold:

- `server/routes/admin.ts:2233-2235` writes `hold_reason`, `held_at`, and `held_by` to `seller_ledger_entries`.

The payout overview even exposes `isHeld` and `holdReason` (`server/routes/admin.ts:2088-2089`). But settlement generation does not filter on `hold_reason`:

- `server/lib/orders.ts:1934-1938` selects `status = 'eligible' AND settlement_id IS NULL AND available_at <= ?` with no hold condition.

**Why it matters:** A seller with an active fraud, quality, or dispute hold can still be included in a settlement batch. The hold is a UI warning, not a financial control. For a marketplace paying non-technical sellers manually, this is a serious control gap.

**Required fix:** Exclude `hold_reason IS NOT NULL` from settlement selection and from payout-eligible totals, or require an explicit override with a second approver. Add a test proving a held entry cannot enter a batch.

---

### H2 — Seller bank details self-verify immediately

**Severity:** High
**Evidence:** CODE
**Affected:** payout fraud, misdirected funds

`server/routes/seller.ts:2645` updates seller payout details and sets:

```sql
payout_status = 'verified'
```

immediately when the seller submits bank/UPI details. There is no evidence of a penny-drop, name-match, IFSC/bank validation, or admin approval in that path.

**Why it matters:** “Verified” is a trust signal used by admins and sellers. A seller can type any account number and the system labels it verified. A typo or a fraudulent change can misdirect a manual payout. The API does say settlements are manual, which is honest, but the status is still misleading.

**Required fix:** Set `payout_status = 'pending_verification'` on submission. Require an admin or provider verification step before `verified`. Preserve an audit trail of who verified what and when. Consider a penny-drop or provider-backed verification when volume justifies it.

---

### H3 — Admin product edit can publish without compliance validation

**Severity:** High
**Evidence:** CODE
**Affected:** food/regulated listings, moderation integrity

The dedicated publish route validates compliance before approval (`server/routes/admin.ts:1126-1167`). But the generic PATCH route accepts `status` directly:

- `server/routes/admin.ts:1023` allows `status: z.enum(['draft', 'pending', 'approved', 'paused', 'archived'])`.
- `server/routes/admin.ts:1063-1117` writes the new status with no compliance check.

An admin can therefore PATCH a product to `approved` and bypass the validation that the publish endpoint performs.

**Why it matters:** The moderation model assumes “approved” means evidence was checked. The edit path breaks that invariant. For food, this could publish a listing without FSSAI, ingredients, allergens, shelf life, or storage details.

**Required fix:** Centralise the status transition in one function. Any transition to `approved` must call `validateProductCompliance`, require an authorised reviewer, and write an audit record. Remove `approved` from the generic edit schema or reject it there.

---

### H4 — Payment verification trusts the local amount and does not fetch the provider payment

**Severity:** High
**Evidence:** CODE
**Affected:** payment amount/status integrity

`server/routes/shop.ts:144-181` verifies the Razorpay checkout signature, then reads the local `payments` row and marks the order paid using `payment.amount_paise`. It does not call Razorpay to fetch the payment and compare:

- payment status (`captured` vs `authorized`/`failed`),
- amount,
- currency,
- order ID,
- payment method,
- provider account.

The webhook path does compare `entity.amount` with the local amount, but on mismatch it only writes a `payment.amount_mismatch` event (`server/routes/shop.ts:257-268`); it does not fail the order or alert operationally.

**Why it matters:** A valid signature proves the order/payment pair came from Razorpay, which limits forgery risk, but it does not prove the captured amount or final status. Partial capture, currency mismatch, or a provider-side anomaly can be recorded incorrectly locally. With no webhook, this is the only automated confirmation path.

**Required fix:** After signature verification, fetch the payment from Razorpay and require `status === 'captured'`, matching amount, currency, and order ID before marking paid. Treat mismatches as a hard failure with an operational alert and manual reconciliation.

---

### H5 — Refund creation is external-first, and `refund.failed` is not handled

**Severity:** High
**Evidence:** CODE
**Affected:** refund correctness, double-refund risk

`server/lib/orders.ts:1549-1563` calls Razorpay to create the refund **before** updating the local refund row to `processing`. If the provider call succeeds and the subsequent database update fails, the money is refunded but the local record is stale. A retry can create a second refund unless the provider deduplicates on the supplied notes.

The webhook handler processes `refund.processed` and `refund.created` (`server/routes/shop.ts:315-357`) but has no branch for `refund.failed`. A failed provider refund is therefore not reflected in the local state or surfaced to the customer/admin.

**Why it matters:** Refunds are the highest-risk money movement after payouts. External-first writes without an outbox/idempotency key create a real double-refund and reconciliation risk. Ignoring `refund.failed` leaves the customer believing a refund is processing when it has failed.

**Required fix:** Use a state machine with an idempotency key: create a local `processing` intent first, call the provider with that key, then record the provider result. Handle `refund.failed`, notify the customer, and require manual review. Add a reconciliation job for provider refunds not matched locally.

---

### H6 — Raw produce is forced into full packaged-food compliance

**Severity:** High
**Evidence:** CODE
**Affected:** core seller category, farmer onboarding, data quality

`shared/productCompliance.ts:25-77` puts `fruits-and-fresh-produce` in the same food group as tea, dry fruit, and preserves. The validator at lines 156-172 then requires:

- a 14-digit FSSAI registration/licence number,
- ingredients,
- allergen declaration,
- shelf life/best-before,
- storage guidance.

Those fields make sense for packaged food. They do not fit a farmer selling raw apples, bananas, or fresh produce, where “ingredients” and “shelf life” are not meaningful in the same way and FSSAI requirements depend on scale and activity.

**Why it matters:** The core Himalayan producer proposition is blocked by a form designed for packaged-food brands. Non-technical farmers will either be unable to list or will enter fake data to get past validation. Either outcome undermines the catalogue and the compliance posture.

**Required fix:** Split `fresh-produce` from packaged food. Use a short, plain-language declaration appropriate to raw produce, and make the FSSAI requirement conditional and explained. Provide assisted onboarding for farmers who do not know the terminology. Do not require “ingredients” for a single-ingredient raw apple.

---

### H7 — `TRUST_PROXY` is off, so all clients share one rate-limit bucket

**Severity:** High
**Evidence:** LIVE + CODE
**Affected:** availability, brute-force protection, abuse handling

Two requests with different `X-Forwarded-For` values returned the same rate-limit key:

```text
Ratelimit-Policy: "600-in-1min"; q=600; w=60; pk=:NDIxOGJjNzQwMjE2:
```

The code default is `trustProxy: false` (`server/env.ts:74`), and startup validation warns when it is disabled (`server/env.ts:169-170`).

**Why it matters:** Behind Caddy, the app sees the proxy address, not the client address. All clients therefore share a single 600-request-per-minute bucket. One abusive client can exhaust the limit for everyone. Per-IP login limiting is also weakened because the key is not the real client.

**Required fix:** Set `TRUST_PROXY` to the correct hop count or trusted proxy configuration for Caddy, verify that the rate-limit key changes with real client IPs, and add a test for spoofed `X-Forwarded-For`. Do not trust arbitrary client-supplied headers beyond the known proxy.

---

### H8 — Deployment provenance is unclear; live assets do not match the local build

**Severity:** High
**Evidence:** LIVE + CODE
**Affected:** every code-verified conclusion in this report

Live HTML references:

- `/assets/index-BcdwSgMI.js`
- `/assets/index-BkW-Y9W5.css`

The local `dist/assets` directory contains different hashed filenames, including:

- `index-DZql7f-R.js`
- `index-DRL-7b4J.css`

The repository is on `release/staging-2026-10-27` at `a8de16e`; `origin/main` is described in prior work as unrelated. There is no deployment manifest or build attestation tying the live hashes to a commit.

**Why it matters:** Code review can identify bugs in the repository, but it cannot prove those exact bugs are in production, or that fixes will reach production. The live auth 500 is itself evidence of a deployed-code/runtime mismatch. Release engineering must be fixed before relying on source-based assurances.

**Required fix:** Build once in CI, record the commit and artifact digest, deploy that artifact, expose a version/commit endpoint, and compare live asset hashes to the release manifest. Add a post-deploy smoke test.

---

### H9 — Performance is not launch-grade for India, and there is no CDN

**Severity:** High
**Evidence:** LIVE
**Affected:** conversion, mobile users, seller photo uploads

Observed:

- HTML TTFB: **~1.34 s** from the audit location.
- Hero WebP: **466,282 bytes**.
- Two JPEG editorial images: **292,446** and **312,462 bytes**.
- Product video: **11,020,654 bytes**.
- Video cache header: `Cache-Control: public, max-age=0, must-revalidate`.
- No CDN headers observed; responses come from Caddy on what appears to be a single AWS Sydney host.
- Product images are served directly from the app host; no runtime image-resizing pipeline was found (build scripts use `sharp`, but uploads are not re-encoded).

**Why it matters:** A 1.3 s TTFB before downloading a 466 KB hero and an 11 MB video is a poor first experience on Himalayan mobile networks. The video is revalidated rather than cached, so repeat visits can re-check a large object. Static assets from a single Sydney origin add latency for Indian customers.

**Required fix:** Put static assets behind a CDN, compress/responsive-size images, transcode the video to a smaller adaptive format, set long-lived immutable caching for hashed assets, and measure real-user performance from Indian mobile networks. Do not use a 11 MB autoplay video on the critical path.

---

### H10 — Upload limits are inconsistent, and images are not re-encoded

**Severity:** High
**Evidence:** CODE
**Affected:** seller photo uploads, storage, page weight

- Server image limit: **5 MB** (`server/lib/uploads.ts:46`).
- Server document limit: **5 MB** (`server/lib/uploads.ts:60`).
- Seller UI advertises **8 MB** and tells sellers “up to 8MB” (`src/pages/SellerPages.tsx:3022, 3817`).
- Admin UI correctly says 5 MB (`src/pages/AdminPages.tsx:3387, 3669`).
- `sharp` exists as a devDependency and is used by build-time image scripts, but no runtime resize/re-encode step was found in the upload path.
- Orphaned uploads are possible if a seller uploads then abandons the form.

**Why it matters:** A seller follows the UI, selects an 8 MB photo, and gets a server rejection with no clear explanation. Even accepted 5 MB originals are served as-is, inflating page weight and storage. For sellers on hill-network connections, this is a frustrating and repeated failure.

**Required fix:** Make the UI and server limits identical, re-encode/resize images server-side, strip EXIF, generate responsive variants, and clean up orphaned uploads. Show the real limit in the file picker and error message.

---

## F. Medium- and low-severity findings

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| M1 | Medium | Commission documentation says 15% in `.env.example`/docs, while code default and live FAQ say 12%. | CODE + LIVE |
| M2 | Medium | Seller `village` is loaded from the server but omitted from `toPayload`, causing data loss on save/submit. | CODE (`BecomeAMakerPage.tsx:29-88`) |
| M3 | Medium | Privacy policy says “salted scrypt hashes”; code uses Argon2id. | LIVE + CODE |
| M4 | Medium | `Permissions-Policy` header is absent. | LIVE headers |
| M5 | Medium | `/api/site` credits contain a developer instruction (“Run `node scripts/fetch-images.mjs`…”) and an empty credit list. | LIVE |
| M6 | Medium | The 11 MB product video is served with `max-age=0, must-revalidate`. | LIVE |
| M7 | Medium | Unknown paths, including `/.env`, `/.git/config`, `/package.json`, and `/private-docs/test.pdf`, return the SPA HTML with 200 rather than 404. This is not a file leak (2,333-byte HTML), but it creates scanner noise and can hide broken links. | LIVE |
| M8 | Medium | No evidence of MFA for admin accounts; admin security depends on password + session. | UNVERIFIED / CODE |
| M9 | Medium | Seller verification copy says email verification is active and SMS is not configured; no inbound mail is configured, so the practical verification/support loop is unproven. | CODE + LIVE DNS |
| M10 | Medium | The real “Apples” listing uses a generic description (“Authentic Himalayan handpicked creation”) and a seller-profile image, which is weak catalogue quality for a curated marketplace. | LIVE |
| M11 | Low | `X-Frame-Options: SAMEORIGIN` and CSP `frame-ancestors 'none'` express different policies; CSP wins in modern browsers, but the legacy header should be aligned. | LIVE |
| M12 | Low | HSTS is one year without `preload`; acceptable, but not a hardened public-site posture. | LIVE |

### Note on shipping-price consistency

Current live responses are internally consistent: `/api/config` returns `freeThresholdPaise:69900` and `flatRatePaise:2900`; the live announcement says free over ₹699; the shipping policy says ₹29 below ₹699 and free at ₹699 or above. An earlier probe in this audit series observed ₹1,699/₹129, so the commercial terms have changed at least once. Confirm the current values are the intended terms and that caches or the deployed build do not serve the old copy.

### Note on commission

The live FAQ and seller terms say **12%**, and `server/env.ts:81` defaults to `1200` basis points. `.env.example` and some docs reportedly say **15%**. The customer-facing number is consistent with the code, but the documentation is not. Reconcile every seller-facing agreement, dashboard label, and environment example before signing sellers.

---

## G. Infrastructure, DNS, TLS and deployment

### G.1 What is confirmed

| Item | Observation |
|---|---|
| Apex | `dearhills.in` A record `54.79.95.128` |
| `www` | Resolves separately; live site serves `www.dearhills.in` |
| Redirect | `http://dearhills.in` → `308` → `https://dearhills.in/` → `301` → `https://www.dearhills.in/` |
| TLS | Valid certificate; HTTP/2/3 advertised via `Alt-Svc`; TLS 1.3 supported |
| Reverse proxy | `Server: Caddy` |
| Hosting | IP ownership/region is consistent with AWS `ap-southeast-2` (Sydney); console access was not available, so instance type, disk, and backups are unverified |
| Nameservers | GoDaddy (`ns65/ns66.domaincontrol.com`) |
| Health | `/api/health/ready` → `200 {"status":"ok","ready":true,"database":"up","schema":"current"}` |
| HTML cache | `Cache-Control: no-store, no-cache, must-revalidate...` on the SPA document |
| Static cache | Hashed assets long-lived; video revalidates; images 30 days |

### G.2 What the health check does not prove

`schema:"current"` is a marker, not a table-integrity check. It coexists with a total login failure. The readiness probe should exercise a real read and a real authentication query, not just a schema version.

### G.3 Architecture inferred from source/config

The repository describes a Node/Express application with SQLite on a single host, Caddy in front, and local file storage for uploads. Live behaviour is consistent with a single origin, but the database engine, disk layout, and backup mechanism were not directly observable.

**Risk:** A single node with SQLite is acceptable for a very small beta, but it has no horizontal write scaling, no built-in failover, and no evidence of point-in-time recovery. Before taking real orders, the team must prove backups and restore, or move to a managed database.

### G.4 Deployment provenance

The live asset hashes differ from the local `dist` build (see H8). There is no version endpoint, build manifest, or commit attestation visible. The branch name `release/staging-2026-10-27` and an unrelated `origin/main` increase the risk that the reviewed source is not the deployed source.

**Recommendation:** Treat live behaviour as authoritative for this audit, and treat source findings as “must verify against the deployed commit” until release engineering is fixed.

---

## H. Authentication, sessions and account security

### H.1 Live behaviour

| Probe | Result | Interpretation |
|---|---|---|
| `POST /api/auth/login` empty body | `400` | Validation works |
| `POST /api/auth/login` well-formed unknown email | `500 internal_error` | Broken before credential decision |
| `POST /api/auth/forgot-password` unknown email | `500` | Reset path also broken |
| `POST /api/auth/google` invalid credential | `500` | Provider error handling is not controlled |
| `GET /api/auth/me` forged cookie | `200 {"user":null}` | Invalid session rejected correctly |
| `POST /api/auth/logout` | Not tested with a real session | Unverified |

### H.2 What is good in code

- Argon2id hashing with 64 MB memory and 3 passes in production.
- Legacy scrypt verification support.
- Session cookie `HttpOnly; Secure; SameSite=Lax` (observed on cart; session cookie code uses the same posture).
- Session rotation on sign-in.
- Server-side role checks and seller scoping.
- Forged session returns no user rather than leaking data.
- Login uses a dummy hash to reduce email-enumeration timing differences.

### H.3 What is missing or weak

- **No working live login.** This dominates every other auth consideration.
- **Global rate-limit bucket** because `TRUST_PROXY` is off (H7). Login limiting is not truly per-client.
- **No evidence of admin MFA.** Password-only admin access is a high-value target.
- **Email verification and password reset are unverified** because the endpoints 500.
- **No evidence of breached-password checks, device/session management, or login notifications.**
- **Comment/code drift:** the comment near `DUMMY_PASSWORD_HASH` still refers to scrypt while the implementation is Argon2id. Minor, but symptomatic of stale security documentation.

### H.4 Immediate auth acceptance criteria

1. Valid customer login returns 200 and a session cookie.
2. Invalid password returns 401, not 500.
3. Unknown email returns 401 with the same shape as invalid password.
4. Malformed body returns 400.
5. Password reset sends a single-use, expiring token and works end-to-end.
6. Google sign-in returns a controlled 401/400 for an invalid credential, not 500.
7. Seller and admin logins work with the correct roles.
8. Rate limits are per real client IP behind Caddy.
9. No credentials or tokens appear in logs.

---

## I. Seller onboarding, KYC and verification

### I.1 The intended flow

The repository contains a multi-step seller application covering account creation, business identity, location, category, documents, shipping, payout details, and agreements. The server stores application data, documents, verification state, and agreement versions. Admin review is manual.

### I.2 Blockers

1. **Registration contract mismatch (C4).** The UI omits `acceptedTerms`; the server requires it.
2. **Final submission state mismatch (C5).** The review checkboxes never update the parent form; the parent blocks submission on stale `false` values.
3. **Village data loss (M2).** `village` is loaded from the server but not sent in `toPayload`.
4. **Payout self-verification (H2).** Bank details are marked `verified` immediately.
5. **Raw-produce compliance mismatch (H6).** Farmers are asked for packaged-food fields.

### I.3 KYC reality

The code and public API indicate:

- Email verification is claimed active; SMS verification is not configured (`seller.ts:229-232`).
- Document uploads are private and limited to 5 MB.
- Admin review is manual.
- Payout provider is explicitly `not_configured`; payouts are manual bank/UPI records (`seller.ts:223-227, 330-334`).
- No Aadhaar/PAN API verification, penny-drop, GSTIN lookup, or bank-name match was found in the reviewed paths.

These are not all defects; manual KYC can be appropriate for a small marketplace. The defect is claiming “verified” where no verification occurred, and designing a form that a non-technical farmer cannot complete.

### I.4 Seller UX for the target audience

The target sellers are Himalayan farmers and artisans, often on mobile, often not fluent in compliance English. The current flow is a long, English-language, ten-step wizard with terms such as FSSAI, GSTIN, IFSC, allergen declaration, shelf life, and dispatch conditions. There is no evidence of:

- Hindi or other local-language support,
- assisted onboarding or phone support,
- save-and-resume that survives the broken submit path,
- examples or tooltips written for a farmer,
- a “not sure” path that routes to human help.

This is a product risk, not just a UI issue. A seller who cannot complete onboarding cannot earn, and the marketplace cannot supply its catalogue.

### I.5 Seller acceptance criteria

- A new seller can register, verify email, complete every step, upload documents, accept agreements, and submit.
- The submitted application is visible to admin with the correct village, category, documents, and agreement version.
- Admin can approve, request changes, or reject with a reason.
- Bank details remain `pending_verification` until a real check is recorded.
- A farmer can complete the flow on a mid-range Android phone without developer assistance.
- The flow is available in at least Hindi and English before scaling beyond a pilot.

---

## J. Catalogue, product data and compliance

### J.1 Live catalogue

- 29 public products.
- 27 demo, 2 non-demo.
- Test banana at ₹1, stock 997, `isDemo:false`, `originVerified:true`, demo seller.
- Real apples listing at ₹600, stock 10, generic description.
- Product images include Unsplash URLs and local `/uploads/` files.
- `/api/site` credits are broken and expose developer instructions.
- Category pages and search/filter quality were not exhaustively tested; this audit focused on data integrity and compliance.

### J.2 Compliance model

The code has a thoughtful category-aware compliance guide, but the grouping is too coarse for fresh produce. The admin publish path validates; the generic edit path does not. That combination creates both over-blocking (farmers) and under-blocking (admin bypass).

### J.3 Data quality

- Demo data is mixed with real data.
- `originVerified` is not reliably evidence-backed.
- Descriptions are sometimes generic or placeholder-like.
- No production guard visible that prevents `isDemo` products or test SKUs from being publicly listed.
- No evidence of image rights/credit completeness.

### J.4 Catalogue acceptance criteria

- Zero demo products, demo sellers, test SKUs, or ₹1 listings in the public API.
- Every `originVerified:true` has an evidence record and reviewer.
- Every food listing has the correct category-specific declaration.
- Raw produce has a simple, valid declaration path.
- Image credits are complete and correct.
- Admin cannot publish a regulated listing without the same validation as the dedicated publish route.
- A data-quality script runs in CI/production and fails on demo/test leakage.

---

## K. Checkout, payments and webhooks

### K.1 Live configuration

```json
{
  "provider": "razorpay",
  "configured": true,
  "webhookConfigured": false,
  "mode": "live",
  "devPaymentsEnabled": false
}
```

### K.2 Payment flow as coded

1. Authenticated customer creates an order.
2. Server computes totals and creates a Razorpay order, requesting `payment_capture: true`; live capture settings are unverified.
3. Client opens Razorpay Checkout.
4. Client posts the three checkout fields to `/api/payments/verify`.
5. Server verifies the HMAC signature, reads the local payment row, and marks the order paid.
6. A Razorpay webhook is intended to provide asynchronous confirmation and refund events, but is not configured live.

### K.3 Risks

- **No asynchronous confirmation** (C2). Browser callback is a single point of failure.
- **No provider fetch** (H4). Local amount/status is trusted after signature verification.
- **No live checkout test** was possible because no account/order/payment may be created and login is broken. The flow is therefore code-verified only, not production-verified.
- **Guest cart vs auth:** the cart cookie exists, but checkout requires authentication. With login broken, a new customer cannot complete a purchase.
- **Shipping pricing:** current config, announcement, and policy agree at ₹699/₹29. This is a positive; recheck after deploys.
- **Tax:** product tax rates exist, but GST invoicing, tax-inclusive pricing, and invoice generation were not verified.
- **Currency:** INR is used in the code; multi-currency is not a launch requirement.

### K.4 Payment acceptance criteria

- Test-mode payment succeeds and the order becomes paid from the **webhook**, even if the browser callback is suppressed.
- Test-mode payment failure leaves the order recoverable and not paid.
- Amount/currency/status are fetched and checked from the provider.
- Webhook signatures are verified against the raw body.
- Duplicate webhooks are idempotent.
- Refund events update the local state.
- No live-money test is used to prove any of this.

---

## L. Orders, shipping and delivery

### L.1 What works in the model

- Orders are split into seller orders for multi-seller fulfilment.
- Shipment states include shipped, in transit, out for delivery, delivered, RTO, and failed.
- Delivery starts a seven-day return window.
- Ledger entries become eligible after delivery plus the return window.
- Customer notifications exist for delivered orders.
- Manual tracking entry is supported.

### L.2 The critical weakness

The shipping webhook is unauthenticated (C3). The code path can mark delivery and release ledger entries. This is the single most dangerous write path in the order system because it directly affects money.

### L.3 Other gaps

- No evidence of carrier signature verification, replay protection, or source allowlisting.
- No evidence of address/PIN serviceability validation.
- No evidence of automated carrier tracking; tracking may be manual.
- RTO and failed-delivery paths were not exercised.
- The malformed-body probe returned 500, which is an uncontrolled error response rather than a clean 400.
- The seven-day window is policy-configurable in code? The admin overview hardcodes `returnWindowDays: 7`; verify it matches the published policy.

### L.4 Shipping acceptance criteria

- Unsigned shipping webhook → 401.
- Signed valid webhook → accepted once, idempotent on replay.
- Invalid signature → 401 and audit event.
- Delivery cannot be set by a customer or seller without evidence.
- Ledger eligibility only moves after an authenticated delivery event.
- RTO/failure handling is tested.
- Customer notification is sent once.

---

## M. Refunds, ledger, commission and payouts

### M.1 What is good

- Refunds are modelled separately from payments and orders.
- Manual refunds are explicitly distinguished from provider refunds.
- “Approved” does not mean “completed”; a manual bank/UPI reference is required to complete.
- The seller API openly says payouts are manual and no automatic transfer is claimed.
- Commission is snapshotted per order, with a clear basis note.
- Refund ledger entries reverse product value and proportional commission.

### M.2 What is unsafe

1. **Payout holds are not enforced** (H1). A held seller can enter a settlement.
2. **Payout details self-verify** (H2). “Verified” is not a real check.
3. **Refund external-first** (H5). A provider success followed by a DB failure can leave a stale local state and invite a double refund.
4. **`refund.failed` ignored** (H5). Failed refunds are invisible.
5. **Commission docs mismatch** (M1). 12% live/code vs 15% in docs.
6. **Tax/invoice handling unverified.** No evidence of GST invoices or tax reporting.
7. **Settlement period semantics** use `created_at` and `available_at`; ensure the admin UI explains which entries are included and why.
8. **Negative ledger entries** from refunds are marked eligible immediately; verify they correctly offset future payouts and cannot create a negative payout without review.

### M.3 Payout reality

There is no automated payout provider. Settlement is an admin-reviewed manual bank/UPI transfer recorded with a reference. That is an acceptable early-stage model **if** it is described honestly (it mostly is) and **if** the controls are real (they are not yet).

### M.4 Money acceptance criteria

- A held ledger entry cannot enter a settlement batch.
- Bank details require independent verification before `verified`.
- A refund intent is persisted before the provider call and is idempotent.
- `refund.failed` is handled and visible.
- Settlement totals reconcile to ledger entries and provider records.
- A dry-run settlement with test data is reviewed by two people.
- Commission shown to sellers matches the order snapshot and the published rate.
- No payout is marked paid without a bank/UPI reference.

---

## N. Cross-cutting readiness: admin, legal, email, performance and remediation

### N.1 Admin and authorization

**What works:**

- Unauthenticated `/api/admin/sellers`, `/api/seller/products`, and `/api/account/orders` return 401.
- An evil-origin preflight returns 403.
- A forged session returns no user.
- Role and seller-scoping checks exist in code.
- Audit helpers are used for many sensitive actions.

**What is weak:**

- Admin product edit can bypass compliance (H3).
- Payout holds are advisory (H1).
- No evidence of admin MFA.
- No evidence of audit-log review, retention, or tamper resistance.
- No evidence of IP allowlisting or separate admin origin.
- Admin error paths and destructive actions were not exercised.
- The admin UI is large and complex; a usability review for destructive actions is warranted.

### N.2 Legal and consumer protection

This is a **5/100** area, not because the drafts are poorly written, but because they are drafts.

Required before launch:

- Real legal entity name, registered address, GSTIN (if applicable), and contact details.
- Grievance officer name, email, phone, and response timeline.
- Published terms, privacy, shipping, returns/refunds, seller terms, authenticity, and cookie notice.
- Correct description of password hashing and data retention.
- DPDP Act-oriented notice, consent, deletion, and grievance workflow.
- Seller agreement versioning and evidence of acceptance.
- Consumer cancellation/return rights reflected in the actual product flow.
- No placeholder text anywhere in the public site or API.

### N.3 Email and support

- No MX; `support@` cannot receive normal inbound mail.
- No apex SPF; a delegated sending subdomain has SPF; Resend DKIM exists.
- DMARC is `p=quarantine`.
- Outbound delivery is unverified.
- SMS is not configured.
- The grievance email is a placeholder.
- Admin notification email configuration is unverified.

**Minimum:** A monitored support inbox, a grievance inbox, tested inbound/outbound mail, SPF/DKIM/DMARC alignment, and a documented response SLA. For a marketplace with manual payouts, a working support channel is not optional.

### N.4 Performance and scalability

| Metric | Observation | Risk |
|---|---|---|
| HTML TTFB | ~1.34 s | Slow first impression |
| Hero WebP | 466 KB | Heavy for mobile |
| Editorial JPEGs | 292–312 KB | Heavy |
| Product video | 11 MB | Very heavy; revalidated |
| CDN | None observed | High latency for India |
| Origin | Single host, Caddy | No failover |
| Database | SQLite inferred | Serialized writes, single-node |
| Rate limiting | Global bucket | One client can exhaust |
| Static caching | Hashed assets long-lived; video not | Mixed |

**Recommendation:** A CDN and image/video optimisation are launch-blocking for a mobile-first Indian audience. A single SQLite node can support a small pilot, but only with proven backups, monitoring, and a documented migration path.

### N.5 Remediation plan

#### P0 — Launch blockers (fix before any public selling)

| # | Action | Acceptance evidence |
|---|---|---|
| 1 | Fix live auth 500; inspect logs/schema; add production smoke tests | Valid login 200; invalid 401; unknown 401; malformed 400; no 500 |
| 2 | Configure Razorpay webhook secret and endpoint; verify raw-body HMAC; idempotency | Test-mode captured/failed/refund events update local state without browser callback |
| 3 | Authenticate shipping webhook; add replay protection | Unsigned 401; signed accepted once; audit event |
| 4 | Fix seller registration `acceptedTerms` and review-checkbox propagation | Test seller registers and submits end-to-end in staging |
| 5 | Remove demo/test catalogue; correct `isDemo` and origin claims | Public API has zero demo/test/₹1 listings |
| 6 | Publish legal pages with real entity, address, grievance officer, contacts | All policies `published`; no placeholders; counsel sign-off |
| 7 | Configure MX, SPF, DMARC alignment, support/grievance mailboxes | Inbound and outbound test messages pass |
| 8 | Enforce payout holds in settlement selection | Held entry cannot enter a batch |
| 9 | Require real payout-detail verification | Status remains `pending_verification` until checked |
| 10 | Route all product approvals through compliance validation | PATCH to `approved` either rejected or validated |
| 11 | Make refunds idempotent and handle `refund.failed` | Provider success + DB failure cannot double-refund; failed event visible |
| 12 | Set `TRUST_PROXY` correctly; verify per-IP limits | Different client IPs produce different rate-limit keys |
| 13 | Prove database backup and restore | Restore into a clean environment; documented RTO/RPO |
| 14 | Add uptime, error, DB, and payment-webhook monitoring | Alerts reach a monitored channel; test alert |

#### P1 — Before scaling beyond a pilot

- CDN, image resizing, video compression, immutable caching.
- Load test at expected pilot concurrency; document bottlenecks.
- Admin MFA and audit-log review.
- Reconcile commission documentation (12% vs 15%).
- Fix upload limit mismatch and add re-encoding.
- Split raw-produce compliance from packaged food.
- Fix `village` data loss.
- Add `Permissions-Policy`.
- Fix image credits.
- Improve product data quality and seller copy.
- Add GST invoice/tax review.
- Add SMS OTP or a documented manual alternative.
- Hindi/local-language seller onboarding.

#### P2 — Product maturity

- Automated payouts via an approved provider.
- Carrier integration with signed tracking.
- Seller mobile app/PWA improvements.
- Analytics with consent.
- Accessibility audit.
- Returns/RTO self-service.
- Data export/deletion tooling.
- Fraud/risk scoring for payouts and refunds.

### N.6 Launch gates

Do not launch until every item is true and evidenced on production or production-like staging:

- [ ] Customer, seller, and admin login all pass end-to-end.
- [ ] Seller registration and final submission pass end-to-end.
- [ ] Product approval cannot bypass compliance.
- [ ] Public catalogue contains no demo/test data or unsupported claims.
- [ ] Razorpay webhook is configured and tested in test mode.
- [ ] Shipping webhook rejects unsigned requests.
- [ ] Refund success and failure paths are tested.
- [ ] Payout holds are enforced; bank details require verification.
- [ ] Legal pages are published with real entity/grievance details.
- [ ] Inbound and outbound support email work.
- [ ] Database backup restore has been demonstrated.
- [ ] Monitoring alerts on auth failures, payment webhook failures, and 5xx spikes.
- [ ] Per-IP rate limits work behind Caddy.
- [ ] A small pilot has completed without manual database intervention.

---

## Appendix 1 — Representative live evidence

All probes were read-only. Timestamps are UTC on 10 November 2026.

| Probe | Observed result |
|---|---|
| `GET /api/health/ready` | `200 {"status":"ok","ready":true,"database":"up","schema":"current"}` |
| `GET /api/config` | Razorpay configured, `mode:"live"`, `webhookConfigured:false`, `devPaymentsEnabled:false`; shipping `69900/2900`; `legalReviewRequired:true` |
| `POST /api/auth/login` valid-shaped body | `500 {"error":{"code":"internal_error",...}}` |
| `POST /api/auth/login` empty body | `400` |
| `POST /api/auth/forgot-password` unknown address | `500` |
| `POST /api/auth/google` invalid credential | `500` |
| `GET /api/auth/me` forged cookie | `200 {"user":null}` |
| `POST /api/webhooks/razorpay` empty body | `503 {"error":"Webhook secret not configured."}` |
| `POST /api/webhooks/shipping` empty body | `500` |
| `GET /api/products?pageSize=100` | `total:29`, 27 demo, 2 non-demo |
| `GET /api/products/fresh-banana` | ₹1, stock 997, `isDemo:false`, `originVerified:true`, demo seller, test description |
| `GET /api/policies/shipping` | `status:"draft"`, `lastUpdated:"Draft - legal review pending"` |
| `GET /api/site` | Credits error text; empty credit list; draft policies; placeholder entity |
| `GET /api/admin/sellers` unauthenticated | `401` |
| `GET /api/seller/products` unauthenticated | `401` |
| `GET /api/account/orders` unauthenticated | `401` |
| `OPTIONS /api/auth/login` from evil origin | `403` |
| `GET /` | `200`, Caddy, HSTS, CSP, COOP/CORP, nosniff; no `Permissions-Policy` |
| `GET /images/home/himalayan-cottage-sunrise-closing.webp` | `200`, 466,282 bytes |
| `HEAD /videos/winter-morning-himalayas-v2.mp4` | `200`, 11,020,654 bytes, `max-age=0, must-revalidate` |
| `GET /.env`, `/.git/config`, `/package.json`, `/private-docs/test.pdf` | `200` SPA HTML, 2,333 bytes; no file disclosure |
| `X-Forwarded-For` variation | Same `pk=:NDIxOGJjNzQwMjE2:` rate-limit key |
| DNS MX | No MX; SOA only |
| DNS TXT apex | Google site verification only; no SPF |
| DMARC | `v=DMARC1; p=quarantine; adkim=r; aspf=r; ...` |

## Appendix 2 — Read-only reproduction commands

These commands do not create accounts, orders, payments, or records. Do not run them with real credentials.

```bash
# Health and public configuration
curl -sS https://www.dearhills.in/api/health/ready
curl -sS https://www.dearhills.in/api/config

# Authentication failure (fake address, no account created)
curl -sS -i -X POST https://www.dearhills.in/api/auth/login \
  -H 'Content-Type: application/json' \
  --data '{"email":"audit-probe@example.com","password":"not-a-real-password"}'

# Webhook configuration state
curl -sS -i -X POST https://www.dearhills.in/api/webhooks/razorpay \
  -H 'Content-Type: application/json' --data '{}'

# Catalogue counts and test listing
curl -sS 'https://www.dearhills.in/api/products?pageSize=100'
curl -sS https://www.dearhills.in/api/products/fresh-banana

# Draft policy state
curl -sS https://www.dearhills.in/api/policies/shipping

# Authorization checks
curl -sS -i https://www.dearhills.in/api/admin/sellers
curl -sS -i https://www.dearhills.in/api/seller/products
curl -sS -i https://www.dearhills.in/api/account/orders

# Rate-limit key consistency behind the proxy
curl -sS -D - -o /dev/null https://www.dearhills.in/api/health/ready \
  -H 'X-Forwarded-For: 203.0.113.10' | grep -i ratelimit
curl -sS -D - -o /dev/null https://www.dearhills.in/api/health/ready \
  -H 'X-Forwarded-For: 198.51.100.77' | grep -i ratelimit
```

## Appendix 3 — Items deliberately not tested

- Real checkout, payment, refund, or payout.
- Real seller registration or application submission.
- Admin moderation, settlement, or payout actions.
- Load, stress, or destructive penetration testing.
- Email delivery to real inboxes.
- Database integrity, backup, or restore.
- Server resource usage or disk health.
- Mobile device/browser compatibility matrix.
- Accessibility and localisation testing.

These remain unverified and must be covered before launch.

---

**Final statement:** The current live site should not accept real customers or real seller applications. The fastest path to a credible launch is to fix authentication, payment webhooks, shipping-webhook authentication, seller onboarding, catalogue data, legal pages, and inbound support, then re-run this audit against a release artifact that is provably the one deployed.

---

## Appendix 4 — Code remediation status (11 November 2026)

This appendix is a **post-audit implementation record**, not a change to the live-production evidence above. The production scores and the NO-GO decision stand until the fixed build is deployed and re-tested on production with authorised test accounts.

### A4.1 Verified locally in code

All changes below are in the repository working tree and were verified by `npm run typecheck`, `npm test -- --reporter=dot` (**25 files, 232 tests passed**) and `npm run build`. `npm run lint` reports no errors and only pre-existing `no-explicit-any` warnings.

| Finding | Fix | Where |
|---|---|---|
| C3 — shipping webhook unauthenticated | `SHIPPING_WEBHOOK_SECRET` added. Callback requires an HMAC-SHA256 signature or constant-time token; production fails closed (`503`) when the secret is unset. Dev/test stay open when unset. | `server/lib/payments.ts`, `server/routes/shop.ts`, `server/env.ts` |
| C4 — seller registration missing `acceptedTerms` | Registration sends `acceptedTerms: true`; password hint/minimum aligned to the server's 10-character rule. | `src/pages/onboarding/Step1Account.tsx` |
| C5 — stale agreement state blocks submission | Review checkboxes now propagate into the parent `form.agreements`; the seller-terms checkbox also sets `commissionDisclosure`. | `src/pages/onboarding/StepReviewSubmit.tsx`, `src/pages/BecomeAMakerPage.tsx` |
| H1 — payout holds advisory | Settlement generation and `markSettlementPaid()` require the seller's `payout_status` to be `verified` and refuse `blocked` sellers; held ledger entries are excluded at both steps. Placing a hold stores the prior status, and releasing it restores that status rather than approving details. | `server/lib/orders.ts`, `server/routes/admin.ts`, `server/schema.sql`, `server/db.ts` |
| H2 — payout details self-verify | Seller-entered bank details now set `payout_status = 'pending_verification'`. A new admin endpoint (`POST /api/admin/sellers/:id/payouts/verify`) records a mandatory note and audit event before `verified`. | `server/routes/seller.ts`, `server/routes/admin.ts` |
| H2 — payout controls unreachable in the UI | Sellers can view and update masked payout details from Earnings & settlements; administrators can verify details, place a payout hold, or release a hold from the seller file, each with an audit note and no money movement. | `src/pages/SellerPages.tsx`, `src/pages/AdminPages.tsx` |
| H3 — admin product PATCH bypass | `PATCH /api/admin/products/:id` runs `validateProductCompliance` when approving or changing compliance-relevant fields. | `server/routes/admin.ts` |
| H4 — checkout trusts local amount | Checkout verification fetches the authoritative provider payment and checks id, order, currency, amount, and captured status. Mismatches and non-captured attempts are recorded in `payment_events` and do not mark the order paid. Provider access is injectable for tests. | `server/lib/payments.ts`, `server/routes/shop.ts`, `server/test/helpers.ts` |
| H5 — refunds external-first; `refund.failed` missing | Refund is claimed as `processing` before the provider call; submission failure reverts to `failed` and records `refund.submission_failed`; `refund.failed` webhooks mark the refund failed. Webhook now ignores non-captured payment entities. | `server/lib/orders.ts`, `server/routes/shop.ts` |
| H6 — raw produce forced into packaged-food rules | New `raw_produce` compliance group requires variety/grade, harvest timing, dispatch conditions, and net weight instead of FSSAI/ingredients/shelf-life. Seller UI and admin/seller queries updated. | `shared/productCompliance.ts`, `src/pages/SellerPages.tsx`, `server/routes/seller.ts`, `server/routes/admin.ts` |
| H7 — `TRUST_PROXY` off | Production defaults to one trusted proxy hop when unset; operators can set `0`, a hop count, or a subnet list. | `server/env.ts`, `server/app.ts` |
| H10 — upload limit mismatch | Seller image UI limit aligned to the server's 5 MB. | `src/pages/SellerPages.tsx` |
| — | Added a restrictive `Permissions-Policy` header (camera, microphone, geolocation and USB disabled). | `server/app.ts` |
| G.2 — shallow readiness check | `/api/health/ready` now verifies the auth-critical `users`/`profiles`/`sessions` schema and native `crypto.argon2Sync`, and reports `auth: "ok"` or `"mismatch"`. | `server/routes/public.ts` |
| — | Runtime requirement raised to Node.js `>=24.7.0` for native Argon2. | `package.json`, `.env.example`, `docs/ENVIRONMENT.md` |
| M1 — commission docs mismatch | Templates and docs reconciled to the code/live 12% (`1200` bp). | `.env.example`, `README.md`, `docs/ENVIRONMENT.md`, `docs/SELLER_GUIDE.md` |
| — | Environment templates document `SHIPPING_WEBHOOK_SECRET`, production `TRUST_PROXY`, and Node 24.7. | `.env.example`, `deploy/production.env.example`, `docs/ENVIRONMENT.md` |
| P1 — admin accounts had password-only sign-in | RFC 6238 TOTP enrolment is available to every user and shown as recommended for administrators. When enabled, password and Google sign-in return a single-use, expiring, five-attempt database challenge before a session is issued. Administrator recovery is a shell command (`npm run mfa:reset -- email`), not a web endpoint. | `server/routes/auth.ts`, `server/core/security/MfaService.ts`, `server/schema.sql`, `server/db.ts`, `server/scripts/reset-mfa.ts`, `src/pages/AuthPages.tsx`, `src/pages/AccountPages.tsx` |
| P1 — uploaded images stored as received | All image routes pass through `sharp`: camera orientation is applied, EXIF/GPS metadata is stripped, the longest edge is bounded to 2000 px, format is preserved, and inputs over 40 megapixels are rejected. `sharp` moved from dev to production dependencies. | `server/lib/uploads.ts`, `package.json`, `package-lock.json` |

Additional P1 fixes included above: seller `village` is now sent in the onboarding payload, and raw-produce products appear correctly in seller/admin compliance queries.

### A4.2 New regression coverage

- Provider order/currency/amount mismatch and non-captured checkout responses.
- Shipping webhook rejection without credentials, with a wrong token, and acceptance with a token or HMAC signature.
- Admin product PATCH approval rejected without required category evidence.
- Seller payout details remain `pending_verification` until an administrator verifies them.
- Settlement batches cannot be created, and an existing batch cannot be marked paid, while the seller's payout details are unverified.
- Releasing a payout hold restores the pre-hold status (`pending_verification` stays pending) instead of approving details.
- Held/blocked ledger entries excluded from settlements.
- Raw-produce classification and validation separate from packaged food.
- MFA enrolment, challenge issuance, wrong-code rejection, single-use challenge replay, administrator recommendation, password-plus-code disable, and attempt limiting.
- Uploaded images are re-encoded, metadata is stripped, and dimensions are bounded.
- Legacy-schema migration to MFA columns and the challenge table.

### A4.3 Still open — production-only or data/operations work

These cannot be closed by repository code alone and keep the launch decision at **NO-GO**:

1. **C1 — live auth 500.** Reproduce with production logs and confirm the deployed artifact and database schema. The fixed build must be deployed, then tested for login, reset, Google sign-in, MFA challenge, and session behaviour.
2. **C2 — Razorpay webhook.** Register the live endpoint and `RAZORPAY_WEBHOOK_SECRET`, subscribe to payment and refund events, and exercise them in test mode. Code verification now exists; configuration and real provider testing do not.
3. **C6 — catalogue.** Remove demo/test listings and the ₹1 live-test product from production data. This is a data operation, not a code change.
4. **C7 — legal pages.** Replace placeholders with the real legal entity, registered address, grievance officer, contacts, and counsel-reviewed terms, then publish.
5. **C8 — email/DNS.** Configure MX, SPF, DMARC alignment, and working support/grievance mailboxes; send and receive real test messages.
6. **H8 — deployment provenance.** Deploy a single identified artifact and record its commit/build hash; live assets currently do not match the local build.
7. **Backups and monitoring.** Demonstrate a restore into a clean environment and add alerts for auth failures, MFA failures, payment-webhook failures, 5xx spikes, and database health.
8. **H9 — performance/CDN.** Measure from India, add caching/CDN, and load test at pilot concurrency. Server-side re-encoding bounds stored image size but does not replace a CDN.
9. **Remaining code/operations backlog:** GST tax invoices and credit notes, browser-level E2E in CI, a shared rate-limit store if more than one instance runs, Hindi/local-language onboarding, assisted KYC, accessibility, and the seller pilot.

### A4.4 Honest status

- **Code-level readiness:** materially improved; the P0 findings that were code defects now have fixes and regression tests, and payout administration, administrator MFA and upload hardening are implemented locally.
- **Live production readiness:** unchanged at **NO-GO** until the fixed artifact is deployed and the production-only gates in N.6 are evidenced.
- **Verified vs unverified:** the local test suite is code-verified behaviour in an in-memory database, not proof about the live server, live database, real payments, real email, or real seller/customer accounts. The MFA flow has not been exercised against the production database, and no live account was created or modified.
