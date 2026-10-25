# Verification report

Last verified: **25 October 2026**  
Environment: Windows, Node.js **24.21.0**, npm **11.19.0**, local SQLite development database (`data/pahadi-roots.db`, WAL).

This report records what was actually executed. It separates automated coverage from manual checks and from integrations that could not be exercised without external accounts. Nothing below claims a live payment, email, courier or payout success.

## Command results

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed — client, server and test TypeScript projects |
| `npm run lint` | Passed — ESLint with no warnings or errors |
| `npm test` | Passed — **87 of 87** tests across **13** files |
| `npm run build` | Passed — SPA in `dist/`, server in `dist-server/`, schema copied; Vite reports a >500 kB chunk warning |
| `npm run smoke` | Passed — **33 of 33** live HTTP checks against a running development API |
| `GET /api/health` | `200` — `{"status":"ok","database":"up","payments":"unconfigured","shipping":"manual-only","email":"unconfigured",…}` |

The smoke run used an explicitly labelled development payment simulation (`ALLOW_DEV_PAYMENTS=true`, `NODE_ENV` not production) against a disposable database created with `DATABASE_PATH` and `UPLOAD_DIR` pointing at a temporary directory. No real money moved and no real customer data was used. Admin checks were enabled with a locally provisioned administrator (`SMOKE_ADMIN_EMAIL` / `SMOKE_ADMIN_PASSWORD`).

## Automated test inventory

| File | Tests | Area |
| --- | ---: | --- |
| `server/test/auth.test.ts` | 13 | Health, CSRF/origin checks, registration, login/logout, disabled accounts, RBAC |
| `server/test/checkout.test.ts` | 10 | Authentication gate, server repricing, stock reservation and races, idempotency, multi-seller split, coupons, GST snapshot, ownership, ledger creation |
| `server/test/seller-onboarding.test.ts` | 10 | Draft save/resume, incomplete submission reasons, category-aware FSSAI rules, duplicate submission, change requests and resubmission revision, approval/store activation/audit, self-approval refusal, invalid transitions, private documents, RBAC/isolation, product moderation and suspension |
| `server/test/storefront.test.ts` | 6 | Home payload and approved-only counts, catalogue filters, product/maker pages, 404, sitemap/robots |
| `server/test/fulfilment.test.ts` | 4 | Confirm → pack → ship → deliver, seller isolation, admin fulfilment, ledger eligibility and settlement |
| `server/test/refunds.test.ts` | 4 | Pre-dispatch cancellation, post-delivery return, commission reversal, dispatch lock, reason validation |
| `server/test/categories.test.ts` | 4 | Admin category create/edit, duplicate slugs, loops, in-use deactivation guard, admin-only access |
| `server/test/pricing.test.ts` | 4 | Commission basis, shipping thresholds, GST-inclusive arithmetic, integer-paise totals |
| `server/test/uploads.test.ts` | 3 | Seller-only image upload, magic-byte rejection, private seller documents |
| `server/test/webhook.test.ts` | 3 | Razorpay HMAC rejection, idempotent payment, amount-mismatch manual reconciliation |
| `server/test/migrations.test.ts` | 2 | Opening a pre-onboarding (v1–v2) database, preserving rows, backfilling store status, re-opening without duplicate migrations |
| `server/test/admin-products.test.ts` | 18 | Admin product creation and validation, publish/unpublish/archive lifecycle, stock set/adjust/reserved guard, low-stock threshold and published-only filter, PATCH validation, customer denied |
| `server/test/demo-checkout-and-orders.test.ts` | 6 | Admin-created demo product to checkout, oversell race, server repricing, demo/real GMV isolation, customer order privacy, customer denied status updates |
| **Total** | **87** | |

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

`npm run smoke` against a disposable development API passed all 33 checks:

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

## Build output

| Asset | Size |
| --- | ---: |
| `index-*.js` (router/bootstrap) | 504.94 kB |
| `AdminPages-*.js` | 427.05 kB |
| `PublicPages-*.js` | 182.00 kB |
| `SellerPages-*.js` | 172.46 kB |
| `AccountPages-*.js` | 87.59 kB |
| `vendor-react-*.js` | 70.00 kB |
| `HomePage-*.js` | 57.68 kB |
| `vendor-query-*.js` | 42.69 kB |
| `index-*.css` | 92.51 kB |

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

## What this verification proves

- The application compiles, lints and builds for production.
- Public catalogue, authentication, cart, checkout, fulfilment, earnings, refunds/returns, admin category management and settlement guards work through real HTTP requests.
- Seller onboarding, document privacy and category-aware validation are enforced on the server, not only in the wizard.
- Every application decision is server-authorized, rejects self-approval, persists status and audit history, and gates store/product visibility.
- An existing development database upgrades to the new schema without losing rows or failing integrity checks.
- Money arithmetic, commission snapshots, ledger timing and refund reversals behave as specified in deterministic tests.
- The admin console reads real authenticated data, bases queue counts and catalogue metrics on server responses, and enforces server-side authorization for every decision it offers.
- The server reports unconfigured providers honestly instead of simulating them.

## What remains unverified

These are **not** covered by the evidence above:

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
- **Disaster recovery in production.** The online SQLite backup command works locally; a timed restore drill on production infrastructure has not been done.
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

To return to clean demonstration data afterwards:

```powershell
npm run reset
npm run admin:create -- admin@pahadiroots.test "Marketplace Admin"
```
