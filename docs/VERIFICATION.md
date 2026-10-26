# Verification report

Last verified: **26 October 2026**
Environment: Windows, Node.js **24.21.0**, npm **11.19.0**, disposable SQLite databases (`data/pahadi-roots.db` for the dev server; temporary databases for tests, smoke and E2E).

This report records what was actually executed. It separates automated coverage from manual checks and from integrations that could not be exercised without external accounts. Nothing below claims a live payment, email, courier or payout success.

## Command results

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed — client, server and test TypeScript projects |
| `npm run lint` | Passed — 0 errors, 0 warnings |
| `npm test` | Passed — **131 of 131** tests across **16** files |
| `npm run build` | Passed — SPA in `dist/`, server in `dist-server/`, schema copied; Vite reports a >500 kB chunk warning |
| `npm audit` | Passed — **0 vulnerabilities** after upgrading `nodemailer` to 10.2.1 and `vitest` to 5.0.5 |
| `npm run smoke` | Passed — **28 of 28** non-admin live HTTP checks against the development API; admin checks were skipped without credentials (the full run with an administrator is 33 checks) |
| `node scripts/e2e-seller-flow.mjs` | Passed — **53 of 53** live HTTP checks of the full seller lifecycle against the same disposable API |
| `GET /api/health/ready` | `200` — `{"status":"ok","ready":true,"database":"up","schema":"current",…}` |
| `npm run db:backup` + `db:verify` | Passed — `integrity: ok`, 0 foreign-key violations, migrations `[1,2,3,4,5,6]` |

The seller-lifecycle E2E run used an explicitly labelled development payment simulation (`ALLOW_DEV_PAYMENTS=true`, `NODE_ENV` not production) against a disposable database and disposable storage directories (`DATABASE_PATH`, `UPLOAD_DIR`, `PRIVATE_DOCS_DIR`). Admin checks were enabled with a locally provisioned throwaway administrator (`E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`); the temporary database and uploaded test files were removed afterwards. The 28-check smoke run reported above ran against the development API and created ordinary test records there; it skipped the five admin checks because no smoke administrator credentials were supplied. No real money moved and no real customer data was used.

## Automated test inventory

| File | Tests | Area |
| --- | ---: | --- |
| `server/test/auth.test.ts` | 13 | Health, CSRF/origin checks, registration, login/logout, disabled accounts, RBAC |
| `server/test/google-auth.test.ts` | 24 | Google ID-token claim validation (issuer, audience, expiry, subject, verified email), new/returning/concurrent sign-in, disabled accounts, explicit one-time linking, unlink and set-password recovery, session rotation, idle/absolute expiry, logout, trusted origins, liveness/readiness |
| `server/test/checkout.test.ts` | 16 | Authentication gate, server repricing, stock reservation and races, idempotency, multi-seller split, coupons, GST snapshot, ownership, ledger creation, public payment capability, empty bag, address validation, invalid coupon, post-discount shipping, resume payment without a duplicate order |
| `server/test/seller-onboarding.test.ts` | 10 | Draft save/resume, incomplete submission reasons, category-aware FSSAI rules, duplicate submission, change requests and resubmission revision, approval/store activation/audit, self-approval refusal, invalid transitions, private documents, RBAC/isolation, product moderation and suspension |
| `server/test/storefront.test.ts` | 6 | Home payload and approved-only counts, catalogue filters, product/maker pages, 404, sitemap/robots |
| `server/test/fulfilment.test.ts` | 4 | Confirm → pack → ship → deliver, seller isolation, admin fulfilment, ledger eligibility and settlement |
| `server/test/refunds.test.ts` | 4 | Pre-dispatch cancellation, post-delivery return, commission reversal, dispatch lock, reason validation |
| `server/test/categories.test.ts` | 4 | Admin category create/edit, duplicate slugs, loops, in-use deactivation guard, admin-only access |
| `server/test/pricing.test.ts` | 4 | Commission basis, shipping thresholds, GST-inclusive arithmetic, integer-paise totals |
| `server/test/uploads.test.ts` | 3 | Seller-only image upload, magic-byte rejection, private seller documents |
| `server/test/webhook.test.ts` | 3 | Razorpay HMAC rejection, idempotent payment, amount-mismatch manual reconciliation |
| `server/test/migrations.test.ts` | 2 | Opening a pre-onboarding (v1–v2) database, preserving rows, backfilling store status, re-opening without duplicate migrations, and applying schema version 6 (provider-auth tables, `sessions.last_seen_at`, campaign tables/view, `order_items.original_unit_price_paise`) |
| `server/test/campaigns.test.ts` | 11 | Campaign pricing on eligible products only, homepage banner guard, discount-cap and price validation, draft privacy and admin RBAC, scheduled preview without selling, expiry consistency, cart/checkout repricing and client-price rejection, activation overlap guard, poster/window validation and audit trail, product removal lifecycle |
| `server/test/admin-products.test.ts` | 18 | Admin product creation and validation, publish/unpublish/archive lifecycle, stock set/adjust/reserved guard, low-stock threshold and published-only filter, PATCH validation, customer denied |
| `server/test/demo-checkout-and-orders.test.ts` | 6 | Admin-created demo product to checkout, oversell race, server repricing, demo/real GMV isolation, customer order privacy, customer denied status updates |
| `server/test/himachali-seller-order-profit.test.ts` | 3 | Seller order revenue, commission and cost-derived profit figures, and seller isolation of financial detail |
| **Total** | **131** | |

Tests open a fresh in-memory SQLite database, seed deterministic fixtures and call the real Express routes through Supertest. They do not mock the database or the route layer. The migration test uses a temporary on-disk database shaped like the legacy schema.

## Seller onboarding coverage

The new suite exercises the full server-authoritative onboarding path:

- A draft saves the chosen step and content and resumes it later; store status begins as `setup_incomplete` and the payout provider is reported as unconfigured.
- An incomplete submission is rejected with field-level reasons and the application stays `draft`.
- A food producer must supply an FSSAI number and FSSAI evidence; the same submission does not demand GSTIN, incorporation or trademark evidence from an artisan, and FSSAI fields are not required for non-food categories.
- Replaying the same submission idempotency key returns `200 { deduplicated: true }` and records one submission event; a second distinct submission returns `409`.
- An administrator request for changes sets `changes_requested` (seller-facing profile status `more_info_required`), exposes the reason to the seller and accepts a resubmission as revision 2.
- Approval moves the application to `approved`, activates the store, writes a seller notification and records `seller.approve` in `audit_logs` with the acting administrator.
- An administrator cannot decide on an application they own; a decision on an unsubmitted draft is refused.
- Re-verification requires a reason and keeps an approved seller's store active, so existing orders can still be fulfilled; suspension is the action that stops trading.
- Identity documents are readable by the owning seller and administrators only; another customer or seller receives `404`, and the admin file response carries `Cache-Control: no-store`.
- A customer is denied seller and admin workspaces; a second seller receives `404` when reading or patching another seller's product.
- An unapproved product is absent from the public catalogue. Requesting changes exposes a moderation note and workflow status, resubmission returns it to review, approval publishes it, and suspending the seller pauses the live listing.

## Admin console coverage

The operations console was rebuilt and audited screen by screen. Every displayed number, badge and queue comes from an authenticated API response; there are no sample testimonials, invented trends or illustrative seller counts.

- **Shell.** Burgundy editorial sidebar with grouped navigation, live queue badges from `/admin/overview`, a mobile drawer, skip link, breadcrumb-style section label, account menu, and a `Ctrl/Cmd+K` command palette that jumps only to real console destinations. The desktop sidebar is sticky beside the content column; the mobile drawer overlays it and closes on Escape with focus returned to the menu button.
- **Keyboard behaviour.** The command palette traps Tab and Shift+Tab inside its dialog, focuses the search field on open and restores focus to the trigger on close. The queue and account popovers close on Escape and restore focus to their trigger buttons. Confirmation dialogs use the shared `Modal` focus trap and scroll lock.
- **Overview.** Real GMV, paid-order count and commission for the last 30 days; all-time completed refunds; open fulfilment work; catalogue composition; queue links; service readiness; recent orders; seller review queue; low-stock listings; audit activity; operator shortcuts. A failed overview request reports that queue counts are unavailable rather than showing zero.
- **Sellers.** URL-backed status/queue filters, deferred search, live counts, application/store/category/type columns, review queue shortcut, application checklist, private document open/accept/reject with a required note, full decision set (approve, reject, request changes, suspend, re-verify), events and audit history. The server rejects an administrator deciding their own application.
- **Products.** URL-backed status and low-stock filters, seller-scoped search, approved-seller-only creation with validation, category/SKU/price/stock/threshold/copy/origin/food fields, demo flag default off, publish/unpublish/archive with confirmation, and direct navigation to the new record. The list reports available stock (on hand minus reserved), reserved units and threshold warnings from `inventory`.
- **Product detail.** Editable commerce and copy fields, category name and threshold from the API, image upload with client type/size checks (JPEG/PNG/WebP, 5 MB, 8 images), delete confirmation, stock and low-stock-threshold update, moderation history, storefront visibility explanation, featured/origin controls limited to what the schema supports, and an accessible decision dialog requiring a seller-facing reason except on approval.
- **Orders, refunds, returns, cancellations and settlements.** URL-backed filters, empty states that reflect the active filter, carrier/tracking validation before dispatch, return decisions that create refund requests rather than claiming money moved, a cancellation queue, and manual settlement payment with a bank/UPI reference. Settlement creation validates the period.
- **Support and reviews.** Support tickets link to the related order, offer a `mailto:` reply, expose status changes and a close shortcut; review removal now uses a confirmation dialog instead of a browser prompt.
- **Categories, payments, commissions, audit and settings.** Category editing keeps slug/parent rules and in-use deactivation guards. Payments, shipping and email panels report configured/unconfigured state honestly. The commission page reads the server default rate instead of a hardcoded 15%. The audit view exposes before/after values. Settings is read-only and never returns secrets.

Not implemented in the console: multi-factor authentication, server-side saved table preferences, bulk actions across records, role management beyond the existing `admin` role, and export/download of audit or settlement data.

## Seasonal campaign coverage

The campaign suite exercises the real public and admin HTTP surfaces against a fresh SQLite database:

- A validated promotional price appears on exactly the configured eligible product, in listing, detail, campaign and homepage payloads; a second eligible product outside the campaign keeps its base price.
- The homepage campaign is returned only when the campaign is live, has a poster and has at least one eligible product.
- Prices at or above the base price, and discounts above the campaign cap, are rejected by the admin API.
- Draft and archived campaigns return `404` publicly and are absent from the homepage; all campaign administration endpoints reject non-administrators.
- A scheduled campaign exposes its eligible products and real status but no purchasable promo price or discount.
- An expired campaign withdraws the promo price from the campaign page and the catalogue consistently.
- Adding an eligible product to the cart uses the promotional unit price, reports the original unit price separately, and checkout recomputes that price on the server. Client-supplied money fields are ignored.
- Activating a campaign that would share an already-live product is refused before any write; a failed status change leaves the stored campaign unchanged.
- Poster URLs and campaign windows are validated, activation is audit-logged, and product removal is refused while the campaign is live.
- `server/seed.ts --reset` was run against a temporary database and produced one live `Pahadi Festive Glow` campaign with five real demonstration products at 15–30% off, a poster, no invented dates and five rows in `active_campaign_prices`.

## Checkout redesign coverage

The `/checkout` page was rebuilt as a three-stage flow — Delivery, Payment, Review and place order — inside the existing authenticated route. No parallel cart, order or payment service was introduced.

- **Layout and navigation.** Desktop uses a two-column layout with a sticky real-cart summary; mobile stacks the stages and carries a persistent order action showing the server-priced total. The checkout header is reduced to the wordmark, account menu and bag count; the announcement ribbon, search and category navigation are removed on this route. A compact footer links only to shipping, returns, privacy and help.
- **State and progress.** The progress indicator marks completed, current and upcoming stages, exposes `aria-current="step"` and lets the customer return to an earlier completed stage. Stage transitions preserve the entered address, delivery note, coupon and payment choice.
- **Delivery.** Saved addresses can be selected and edited in an accessible modal. A new address uses labelled fields for full name, +91 mobile, address lines, city, state, six-digit PIN, optional label and optional delivery instructions. Required markers, placeholders, input modes, autocomplete hints, inline errors and `aria-invalid` are present. Saving a new address to the account is opt-in; a failed save falls back to using the address for this order only. Server validation errors are mapped back to the corresponding fields.
- **Summary.** Items come from `/api/cart` with thumbnails, maker name, unit price, quantity and line total. Subtotal, coupon discount, post-discount shipping, GST-inclusive note, final payable and savings are derived from the server-returned cart and shipping configuration. The coupon is validated against the authenticated account and live bag, and is revalidated before Review. Editing the bag returns the customer to `/cart`.
- **Payment availability.** The Razorpay card appears only when `/api/config` reports `payments.configured`. Per-method enablement (specific cards, UPI, net banking or wallets) is deliberately not enumerated because the backend cannot verify merchant-level enablement. Razorpay test keys are labelled test mode. The development simulation appears only when Razorpay is unconfigured, the deployment is non-production and simulation is enabled; it is visually separated and labelled as a demo. If neither path exists, Review cannot proceed and the page explains the missing `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` configuration instead of creating an unpayable order. Cash on delivery is not offered.
- **Payment lifecycle.** Placing an order posts the address, optional coupon, note and idempotency key to the existing `/api/checkout`. Razorpay is opened through the existing loader; successful callbacks are sent to `/api/payments/verify`, and the confirmation screen appears only when the server response marks the payment `paid`. A browser callback, verification failure or network failure never produces a confirmation. Dismissal, verification failure, unavailable provider and manual status re-check states are shown separately. Raw card and CVV data are never collected or stored by this application.
- **Resume.** `/checkout?resume=ORDER_NUMBER` loads the order, shows the confirmation if it is already paid, reinitialises payment through `/api/orders/:orderNumber/payment` when it is pending, and explains expired, cancelled or otherwise unpayable orders. Payment initialisation is idempotent on the server.
- **Failure handling.** Empty bags, unavailable stock, expired reservations, invalid or exhausted coupons, failed address saves, session expiry (redirect to sign-in), cart fetch errors and payment/network failures have explicit states. Stock and cart conflicts invalidate the cart query so the summary refreshes.

Automated coverage added to `server/test/checkout.test.ts`:

- `/api/config` reports the same development-payment capability used by checkout.
- An empty bag cannot create an order.
- An invalid PIN is rejected with a field error and reserves no stock.
- An unknown coupon is rejected with a field error and reserves no stock.
- Shipping is recalculated after the coupon: a ₹1,500 bag discounted to ₹1,350 is charged the flat ₹79 rather than free shipping.
- A pending order can reinitialise payment without creating a second order; a paid order refuses reinitialisation.

Not executed: no browser automation or viewport-level visual test exists in this repository, and no live Razorpay, SMTP, courier or payout credentials are present. The payment UI was verified by typecheck, lint, production build and review of the server contracts; it has not been exercised against a real provider.

## Legacy database migration check

A copy of the existing development database (with its WAL files) was migrated separately; the live file was not modified.

| Check | Result |
| --- | --- |
| Before | schema versions `1, 2`; 5 seller profiles, 5 seller applications, 10 products, 1 order |
| After | schema versions `1, 2, 3`; identical row counts |
| Application table | rebuilt with `data_json`, `current_step`, `revision`, timestamps; existing `approved` rows preserved |
| Seller profile backfill | `approved` sellers received `store_status = active`; `payout_status = not_started` |
| New tables | `seller_application_events`, `seller_notifications` |
| `PRAGMA integrity_check` | `ok` |
| `PRAGMA foreign_key_check` | no violations |
| Second open | no duplicate migration rows; counts unchanged; integrity still `ok` |

This check caught a startup defect: `schema.sql` creates indexes on columns added by the onboarding migration, so running the schema script against a pre-onboarding database failed before the migration could add them. `server/db.ts` now reconciles those columns before executing the schema script, and `server/test/migrations.test.ts` guards the behaviour.

## Live HTTP smoke coverage

`npm run smoke` against the development API passed all 28 checks available without administrator credentials. With `SMOKE_ADMIN_EMAIL` and `SMOKE_ADMIN_PASSWORD` supplied, the same script runs five additional admin checks (33 total). The run covers:

- Health and database status.
- Storefront home, categories and approved catalogue totals.
- Product listing and maker storefront.
- Customer registration, session cookie and email-verification token exchange.
- Add to cart and server checkout (`pending_payment`).
- Development payment simulation, explicitly flagged and with the order moved to paid.
- Demo seller login and retrieval of the new seller order.
- Seller state machine: confirm → pack → ship (carrier and tracking recorded) → deliver.
- Customer order reaches `fulfilled`.
- Seller earnings ledger totals.
- Admin login, overview, order search and settlement list.
- Settlement creation refused while the 7-day availability window is still open (expected `400`).

The smoke test writes real rows and reduces stock. Run it against disposable data; use `npm run reset` and recreate the administrator if a clean demonstration database is required.

## Live seller lifecycle E2E

`node scripts/e2e-seller-flow.mjs` against the same disposable API passed all 53 checks, exercising the complete maker journey through public HTTP only:

- Seller registration, session creation and email verification.
- Seller application draft save, step persistence and resume.
- Private document upload, followed by a check that the document is not publicly readable.
- Application submission, status transition to `submitted`, and an idempotent repeat submission that returns `deduplicated: true`.
- Admin login, seller review queue membership, application detail, and a refusal when the private document is requested without admin authentication.
- Admin approval; the seller profile becomes active and the maker storefront becomes publicly visible.
- Product draft creation, product image upload, stock update and submission for moderation; the draft and pending product stay out of the public catalogue.
- Admin product review and approval; a second moderation decision on the same record is refused.
- Public product detail, search and maker storefront expose the approved product and real seller logo fields, with no private seller fields.
- Buyer registration, cart add and cart retrieval for the approved product.
- Seller notifications recorded for both the seller approval and the product approval.

The script lives in `scripts/e2e-seller-flow.mjs` and requires `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` plus `ALLOW_DEV_AUTH_HELPERS=true`; it refuses to run without an administrator and is documented as creating real records, so it must be pointed at a disposable database.

## Build output

| Asset | Size |
| --- | ---: |
| `index-*.js` (router/bootstrap) | 548.44 kB |
| `AdminPages-*.js` | 465.27 kB |
| `SellerPages-*.js` | 280.90 kB |
| `PublicPages-*.js` | 198.42 kB |
| `CheckoutPage-*.js` | 124.90 kB |
| `AccountPages-*.js` | 93.05 kB |
| `HomePage-*.js` | 74.89 kB |
| `ProductPage-*.js` | 71.32 kB |
| `vendor-react-*.js` | 70.00 kB |
| `vendor-query-*.js` | 42.69 kB |
| `index-*.css` | 124.90 kB |

The SPA uses route-level lazy loading; storefront, account, seller and admin areas load as separate chunks. Vite warns that the bootstrap chunk exceeds 500 kB; this is a size warning, not a build failure.

## Defects found and fixed during verification

1. **Retried application submissions returned a conflict.** The duplicate-submission guard ran after the status check, so the first retry of an already-submitted application returned `409` instead of acknowledging the original submission. The idempotency replay check now runs before status checks; a replayed key returns `200 { deduplicated: true }`, while a distinct second submission still returns `409`. Covered by `server/test/seller-onboarding.test.ts`.
2. **A pre-onboarding database could not be opened.** Schema indexes referenced `seller_profiles.store_status` / `seller_category` and `seller_applications.created_at` before migration 3 added them. Columns are now reconciled before the schema script runs, legacy application timestamps are backfilled, and the rebuild preserves rows. Covered by `server/test/migrations.test.ts` and the live migration check above.
3. **Admin image upload was rejected by CSRF protection.** The upload used raw `fetch` without the `X-Requested-With` header, so every admin photograph upload failed the CSRF guard. Uploads now go through the shared `api()` client with `FormData`, which sends the header and surfaces HTTP errors instead of silently failing.
4. **The commission page displayed a hardcoded 15% default.** `/admin/commissions` now returns the server's configured `defaultRateBp`, so the displayed fallback matches the rate actually applied when no rule matches.
5. **The desktop admin shell stacked the sidebar above the content.** The outer wrapper is now a flex row at `lg`, so the sticky 276 px sidebar and the main column sit side by side; the mobile drawer remains an overlay.
6. **The command palette and header menus lacked full keyboard handling.** Tab is trapped inside the palette, focus is restored to the trigger on close, and Escape returns focus from the queue and account popovers.
7. **Product moderation gaps.** The product list now exposes `reserved` units and the low-stock threshold, the low-stock filter is limited to published listings, and the detail page can edit category, threshold, origin, materials and food information with validation and audit records.
8. **Destructive actions used browser dialogs.** Document rejection, archive, image deletion and review removal now use in-app dialogs with required reasons where applicable; `window.confirm`, `prompt` and `alert` are gone from the admin console.
9. **The low-stock product filter could fail on its count query.** The list query joined `inventory`, but the pagination count query did not, so `?lowStock=true` could fail with a missing alias. The count query now joins inventory, the low-stock filter is limited to published listings when no status is supplied, and `/admin/products` returns `reserved` and `low_stock_threshold`. Covered by the new low-stock test in `server/test/admin-products.test.ts`.
10. **The catalogue composition omitted rejected and paused listings** while claiming to show every stored listing. `/admin/overview` now reports both counts, and the chart labels the full moderation state set.
11. **The browser API client silently fabricated authenticated state.** `src/lib/api.ts` served bundled/local JSON when an HTTP request failed and carried hardcoded administrator credentials plus fake localStorage sessions, which could present a false signed-in state. Authentication, account, cart, seller and admin calls now fail honestly. A public GET-only static catalogue fallback remains for a static preview; it cannot create a session or return private data.
12. **The seed created an administrator with a default password.** A development-only seed account used a cleartext, documented password. The seed now provisions an administrator only when `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are supplied; existing accounts can be reset with `npm run admin:create -- <email> "<name>" --reset-password`.
13. **Public pages carried unverifiable trust claims and fabricated seller metrics.** Copy such as “100% verified origin”, cash-on-delivery, fixed dispatch days and invented earnings was removed or replaced with values read from the API. Product, maker and policy pages now render only stored product, seller, review and policy data, and label estimates as estimates.
14. **Private seller documents ignored storage configuration.** `privateDocsDir` was hardcoded relative to the working directory, so automated tests wrote identity documents into the application's real private storage and deployments could not relocate the private volume independently. It now reads `PRIVATE_DOCS_DIR`, and Vitest points both public and private upload paths at a temporary directory.
15. **Stale static catalogue JSON was still shipped publicly.** The seed wrote `static-products.json`, `static-product-details.json`, `static-categories.json` and several other `static-*.json` snapshots into `public/`, even though nothing read them after the fallback client was removed. They contained demo records and stale prices and were copied into every build. The export was removed from the seed and the files were deleted; the production bundle no longer contains them.
16. **Authentication could be bypassed in the browser and lacked Google support.** Hardcoded admin credentials and localStorage identities were removed; the server now owns the session. Google Identity Services sign-in verifies signed ID tokens server-side, keys accounts on the Google `sub`, refuses invalid/expired/wrong-audience tokens, never auto-merges by email, issues a hashed single-use linking challenge, rotates sessions on sign-in, enforces idle and absolute expiry, refuses disabled accounts, and clears the session server-side on logout. Google-only accounts can set a password before unlinking. Covered by `server/test/google-auth.test.ts`.

## What this verification proves

- The application compiles, lints and builds for production.
- Public catalogue, authentication, cart, checkout, fulfilment, earnings, refunds/returns, admin category management and settlement guards work through real HTTP requests.
- Seller onboarding, document privacy and category-aware validation are enforced on the server, not only in the wizard.
- Every application decision is server-authorized, rejects self-approval, persists status and audit history, and gates store/product visibility.
- An existing development database upgrades to the new schema without losing rows or failing integrity checks.
- Money arithmetic, commission snapshots, ledger timing and refund reversals behave as specified in deterministic tests.
- The admin console reads real authenticated data, bases queue counts and catalogue metrics on server responses, and enforces server-side authorization for every decision it offers.
- The server reports unconfigured providers honestly instead of simulating them.
- The complete seller lifecycle — registration, private evidence, application approval, product moderation, public visibility, cart access and notifications — works end to end over public HTTP, as exercised by the 53-check E2E run.
- The public storefront and seller workspace display stored records and derived financial figures rather than demo fallbacks, and revenue is never labelled as profit without cost inputs.

## What remains unverified

These are **not** covered by the evidence above:

- **Live Google token verification and browser sign-in.** No real `GOOGLE_CLIENT_ID` or authorised origin was configured. Server-side claim handling, linking and session behaviour are tested with an injected verifier; the Google popup, consent screen and CSP interaction were not exercised.
- **Live Razorpay payments and refunds.** Keys, merchant approval, a public HTTPS webhook and real transactions were unavailable. Webhook tests use locally generated HMAC signatures.
- **Live email delivery.** No SMTP provider was configured. Notifications are recorded as skipped when SMTP is absent; SPF/DKIM/DMARC, bounces and retries are untested.
- **Mobile/SMS verification.** No SMS provider is configured; the API reports this explicitly and email verification is the only real channel.
- **Courier automation.** Shiprocket is not implemented; dispatch is manual. No live carrier label or tracking sync was tested.
- **Automated seller payouts.** Settlements are manual with a recorded bank/UPI reference. No payout provider is integrated, and the payout onboarding step records preferences only.
- **Legal review of seller terms, commission disclosure and privacy text.** The agreements are drafted and versioned in code, but a lawyer and a chartered accountant have not reviewed them.
- **Origin/sample inspection operations.** The console can record a product origin-verification flag, but there is no scheduling, sampling or laboratory/lot tracking workflow.
- **PostgreSQL/Supabase.** The build runs on single-node SQLite. The documented migration path has not been executed against live data.
- **Tax invoices and GST correctness.** `tax_rate_bp` defaults to `0`; rates, HSN mapping, invoices, credit notes and TCS/TDS need a chartered accountant.
- **Browser, accessibility, performance and load testing.** No Playwright/browser suite, screen-reader audit, Core Web Vitals run or load test was performed. Responsive layout and keyboard/focus behaviour were reviewed by hand only.
- **Disaster recovery in production.** The online SQLite backup command and read-only verifier pass locally (`integrity_check = ok`, 0 foreign-key violations, migrations `[1..6]`), but no timed restore drill on production infrastructure has been done.
- **Admin MFA, shared rate limiting, object storage, observability and error tracking.** Not implemented.

## Reproduce

```powershell
npm run check
npm run dev:api
# in a second terminal, with development payment simulation enabled:
$env:SMOKE_ADMIN_EMAIL = "admin@pahadiroots.test"
$env:SMOKE_ADMIN_PASSWORD = "<your local admin password>"
npm run smoke
```

For an isolated run that does not touch development data:

```powershell
$env:DATABASE_PATH = "data/verify-temp.db"
$env:UPLOAD_DIR = "storage/verify-temp"
$env:PRIVATE_DOCS_DIR = "storage/verify-temp/private"
$env:SEED_ADMIN_EMAIL = "verify-admin@pahadiroots.test"
$env:SEED_ADMIN_PASSWORD = "<a local throwaway password>"
npx tsx server/seed.ts --reset
# start the API with the same paths plus PORT=8790, ALLOW_DEV_PAYMENTS=true,
# SIMULATED_CHECKOUT_ENABLED=true and ALLOW_DEV_AUTH_HELPERS=true, then:
$env:SMOKE_BASE_URL = "http://localhost:8790"
$env:E2E_ADMIN_EMAIL = $env:SEED_ADMIN_EMAIL
$env:E2E_ADMIN_PASSWORD = $env:SEED_ADMIN_PASSWORD
npm run smoke
node scripts/e2e-seller-flow.mjs
```

Delete the temporary database, its `-wal`/`-shm` files and the temporary storage directory afterwards.

To return to clean demonstration data afterwards:

```powershell
npm run reset
npm run admin:create -- admin@pahadiroots.test "Marketplace Admin"
```
