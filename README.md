# PAHADI ROOTS

A multi-vendor marketplace for products made and grown in Himachal Pradesh — storefront, customer accounts, seller workspace and administrator console in one application.

The visual system is deliberately editorial rather than "startup dashboard": warm paper, orchard burgundy, apple blossom and harvest gold, Cormorant Garamond display type and Manrope interface type. Product and story pages are built around makers, materials and places, not generic Himalayan decoration.

> **Project status: a security-hardened marketplace build — not a launched business.**
>
> Core commerce and marketplace workflows run against a real server and database. Payment-gateway integration is **out of scope for this build**: orders stay in `pending_payment` unless a configured provider produces verified evidence. Transactional email is implemented through Resend (SMTP fallback) but cannot be proven until a verified sending domain and a fresh API key exist. Courier dispatch is manual. Demonstration records are labelled as demonstrations. See [Remaining blockers](docs/REMAINING_BLOCKERS.md) before treating this as production-ready.

**Main hosted link:** [https://www.dearhills.in](https://www.dearhills.in). It is currently served by the Express 5 + SQLite process behind Caddy: `/api/health`, `/api/health/ready`, `/api/config`, `/api/products` and `/api/auth/me` return real API JSON. The Vercel configuration in this repository is a static SPA rewrite only and cannot host the API. The production database is intentionally empty (0 products, 0 sellers); do not treat the hosted instance as a trading shop until catalogue, credentials and operational checks in [Launch checklist](docs/LAUNCH_CHECKLIST.md) are complete.

## What works now

| Area | Implemented and exercised |
| --- | --- |
| Storefront | Home, seasonal offer page with poster and eligible-product listing, shop filters/search/sort, product pages, maker directory and profiles, cart, authenticated checkout, editorial pages, policies, image credits, sitemap |
| Customer account | Registration/login, Google sign-in with explicit password-confirmed linking, email verification, password reset, addresses, order history/detail, cancellation and return requests, reviews for delivered purchases, wishlist, notifications, profile and deletion request |
| Seller workspace | Ten-step resumable maker application with category-aware questions, private document upload, explicit application/store status and review history; approval gate; dashboard and readiness checklist; product drafts, submission and resubmission after change requests; image upload, inventory, order confirm → pack → ship → deliver, tracking, earnings ledger, settlements, store profile, notifications |
| Admin console | Seller application review with evidence, checklist, requirements, reason-required decisions, review history and audit trail; product moderation including change requests; seasonal campaign creation, status/window control, poster upload, eligible-product pricing; category management, orders and fulfilment, payments, refunds, returns, cancellations, commission rules, settlement creation/payout recording, customers, review moderation, structured content editors, coupons, support inbox, audit log, integration status |
| Commerce rules | Integer-paise accounting, GST-inclusive prices, server-side repricing, coupon validation and redemption limits, shipping thresholds, commission snapshots, stock reservation with double-release protection, idempotent checkout, seller-order splitting |
| Orders & aftercare | Order event timeline, customer/seller/admin order files, cancellations before dispatch, per-item partial returns, refund-request records with manual bank/UPI completion, no paid status without verified payment evidence |
| Email | Resend transactional email with retry, timeout, idempotency key, atomic dedupe and sanitised errors; SMTP fallback; notification queue visibility in the admin console |
| Security | scrypt passwords, server-verified Google ID tokens with explicit account linking, opaque hashed sessions with rotation and idle/absolute expiry, RBAC, CSRF header + origin allowlist checks, rate limits, Helmet/CSP, parameterised SQL, ownership checks, upload type/signature validation, HMAC payment verification, audit logging |
| Quality | TypeScript typecheck, ESLint, 154 integration/security/migration/email tests across 18 files, live HTTP smoke, seller-lifecycle E2E, production build, dependency audit |

The full route tree is available without an external service. Google Identity Services, Resend/SMTP and an optional Razorpay adapter are the external integrations wired; **only Razorpay is out of scope for production sign-off** and remains unconfigured/untested with live credentials. Courier dispatch is manual. The application reports unconfigured integrations rather than pretending they are live.

## Stack

- **Runtime:** Node.js 24 (Node 22.5+ required for `node:sqlite`), TypeScript
- **Server:** Express 5, Zod 4, `node:sqlite` (`DatabaseSync`, WAL mode)
- **Client:** React 19, React Router 7, TanStack Query 5, Vite 7
- **Styling:** Tailwind CSS 4 with custom design tokens
- **Testing:** Vitest, Supertest
- **Images:** attributed Wikimedia Commons assets for development only

### Why SQLite instead of Supabase

The requested build assumed a Supabase/PostgreSQL backend, but no Supabase project or credentials existed in this environment. Rather than claim an unverified cloud setup, the application uses Node's built-in SQLite with a complete relational schema, foreign keys, transactions and migrations. The data access layer is isolated in `server/db.ts` and `server/lib/*`; [Deployment](docs/DEPLOYMENT.md#moving-to-postgresql-or-supabase) documents the migration path. SQLite is suitable for a single-node launch, not horizontal scaling.

## Quick start

Requirements: Node.js 22.5+ (24 recommended), npm 10+.

```powershell
npm install
Copy-Item .env.example .env
npm run seed
npm run admin:create -- admin@pahadiroots.test "Marketplace Admin"
npm run dev
```

Open a browser at `http://localhost:5173`; the API runs on `http://localhost:8787` and Vite proxies `/api`, `/uploads`, `/sitemap.xml` and `/robots.txt`.

`npm run seed` is idempotent and does nothing if products already exist. To replace local demo data:

```powershell
npm run reset
npm run admin:create -- admin@pahadiroots.test "Marketplace Admin"
```

`npm run reset` **deletes all local data** and recreates the demonstration catalogue. It never runs in production unless `ALLOW_DEMO_SEED_IN_PRODUCTION=true` is set deliberately.

### Demonstration accounts

Seeded sellers use `.test` addresses and the password in `DEMO_SEED_PASSWORD` (`PahadiDemo!2026` by default):

| Seller | Email |
| --- | --- |
| Kullu Loom Collective (demo) | `kullu@demo.pahadiroots.test` |
| Kangra Tea Cooperative (demo) | `kangra@demo.pahadiroots.test` |
| Lahaul Apiary & Kitchen (demo) | `lahaul@demo.pahadiroots.test` |
| Chamba Farm Collective (demo) | `chamba@demo.pahadiroots.test` |
| Kinnaur Orchard Growers (demo) | `kinnaur@demo.pahadiroots.test` |

No demonstration administrator is committed. Create one with the command above. The CLI prompts for a password without echoing it; it also supports `ADMIN_PASSWORD` for non-interactive provisioning and `--reset-password` for rotation.

Demo products carry `is_demo`, demo sellers include `(demo)` in their names, and no reviews or sales statistics are fabricated. Seeded images are illustrative and attributed on `/credits`.

### Development payment simulation

With no Razorpay keys, checkout creates an order in `pending_payment` and offers a clearly labelled development simulation when both conditions hold:

- `NODE_ENV` is not `production`
- `ALLOW_DEV_PAYMENTS=true`

The simulation endpoint explicitly states that no money moved. It is force-disabled in production, and the server refuses to start if the flag is enabled under `NODE_ENV=production`.

### Transactional email

Set `RESEND_API_KEY` plus a verified `EMAIL_FROM` domain to send order, verification, return and refund notices through Resend. `SMTP_*` remains a fallback. Notifications are deduplicated in `notifications` with a unique dedupe key; failed sends are `failed`, unconfigured sends are `skipped`, and provider errors are sanitised so keys never reach logs. `retryFailedNotifications` in `server/lib/email.ts` can be run by an operator; there is no background outbox worker yet.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | API + Vite development servers |
| `npm run dev:api` | API only, with watch mode |
| `npm run build` | Build SPA and compiled server |
| `npm start` | Run the compiled production server |
| `npm run seed` | Seed demo data if the catalogue is empty |
| `npm run reset` | Delete local data and reseed (destructive) |
| `npm run admin:create -- <email> "<name>"` | Provision an administrator |
| `npm run db:backup` | Consistent SQLite snapshot into `backups/` |
| `npm run db:verify -- <file>` | Read-only integrity/schema check of a backup |
| `npm run smoke` | Live HTTP smoke test against a running development API |
| `npm run typecheck` | Client, server and test TypeScript checks |
| `npm run lint` | ESLint |
| `npm test` | 154 Vitest/Supertest tests |
| `npm run check` | Typecheck + lint + tests + production build |

## Project structure

```text
server/
  schema.sql            complete relational schema
  db.ts                 SQLite open, pragmas, schema/migrations, transactions
  env.ts                environment parsing and production guards
  app.ts                Express app, security middleware, static serving
  seed.ts               labelled demonstration data
  lib/                  auth, pricing, cart, orders, payments, uploads, email, audit
  routes/               auth, public, shop, account, seller, admin
  test/                 integration and security tests
  scripts/create-admin.ts
src/
  App.tsx               lazy-loaded route tree and guards
  pages/                storefront, auth, account, seller and admin pages
  components/           layout, UI primitives, product card, route guards
  lib/                  API client, session, formatting, Razorpay loader, toasts
shared/                 shared TypeScript types and content contracts
public/images/          attributed development photography + credits.json
scripts/                image fetching, server asset copy, database backup, HTTP smoke test
docs/                   environment, deployment, seller, launch and status docs
```

## Core marketplace rules

- **Money** is stored as integer paise. No floating-point arithmetic is used for prices or ledger entries.
- **Prices are GST-inclusive.** `tax_rate_bp` defaults to `0` until a chartered accountant confirms rates and HSN treatment. The tax component is snapshotted but not added to the payable total. Tax configuration and tax invoices remain launch blockers.
- **Commission** is charged on product value after discounts, excluding shipping and taxes. Resolution order is seller rule → category rule → global rule. The default is 15% (`1500` bp). Rate and amount are snapshotted on each seller order.
- **Shipping** is marketplace revenue. A flat ₹79 applies below ₹1,499 after discounts; ₹1,499+ ships free. Thresholds are configurable.
- **Stock** is reserved atomically at checkout and released if payment expires or the order is cancelled before dispatch. Shipping decrements both on-hand and reserved quantities.
- **Ledger timing:** verified payment creates pending sale and commission entries. Delivery makes them eligible; funds become available after a 7-day return window. Approved refunds post proportional deductions and commission reversals.
- **Payouts are manual.** An administrator reviews a seller statement, records a mandatory bank/UPI reference, and only then is the settlement marked paid. No live payout API is claimed.
- **Seller onboarding is explicit.** Applications move through `draft → submitted → under_review → changes_requested / approved / rejected` with `suspended` and re-verification paths. Store status is separate (`setup_incomplete`, `pending_activation`, `active`, `suspended`). Every administrator decision requires the configured reason and is recorded in the application event log and `audit_logs`. Applicants cannot submit unwritten categories, and administrators cannot decide on their own application.
- **Product moderation is separate from seller approval.** Listing workflow statuses are `draft`, `submitted`, `changes_requested`, `approved/published`, `rejected`. A product is publicly visible only when the product and its seller are both approved; seller suspension pauses live listings.
- **Seasonal campaigns are server-authoritative.** An administrator selects explicitly eligible products and a fixed promotional price for each. A promotion must be lower than the current base price and within the campaign's maximum discount, and one product can belong to only one live or scheduled campaign. The database view `active_campaign_prices` is the only source of a live promo price, so catalogue, cart and checkout can never disagree. Scheduled and expired states are derived from the configured window; draft and archived campaigns are not public. Campaign pages show only real eligible products and do not invent dates or discounts.
- **Order splitting:** a cart containing multiple sellers becomes one customer order with separate seller orders, shipments and tracking.
- **Guest checkout is intentionally unsupported.** Guest carts are kept in a signed random cookie and merge into the account cart after login.

Detailed state machines and money rules live in `server/lib/orders.ts`, `server/lib/pricing.ts` and `shared/types.ts`.

## Security model

- Passwords: Node `scrypt` with per-user salt and constant-time comparison.
- Sessions: opaque random tokens; only SHA-256 hashes are stored. `HttpOnly`, `SameSite=Lax`, `Secure` when `APP_URL` is HTTPS, configurable lifetime.
- Authorization: every seller and admin API checks role and resource ownership on the server. Client guards are only navigation aids.
- CSRF: mutating requests require `X-Requested-With: pahadi-roots` and a same-origin `Origin` when present. Webhooks are exempt and verified with provider signatures.
- Uploads: MIME allow-list, 5 MB limit, random filenames, magic-byte checks. Seller documents are outside the public static directory and served only through authorized routes.
- Rate limits: global API limit plus tighter auth and sensitive-action limits. The limiter is in-process, so a multi-instance deployment needs a shared store.
- Headers: Helmet, strict production CSP, HSTS, frame denial, no `X-Powered-By`.
- Audit: administrator decisions and money movements are written to `audit_logs` with actor, target and structured details.

## Verification

Last verified on 27 October 2026 with Node 24.21.0:

- `npm run typecheck` — passed (client, server and test projects)
- `npm run lint` — passed
- `npm test` - 154 of 154 tests passed across 18 files, including Google sign-in/linking, session hardening, campaign, seller onboarding, admin products, checkout, returns/refunds, email/Resend and legacy-migration suites
- `npm run build` — passed; production-sized SPA and `dist-server/server/index.js` generated, with no source maps; `scripts/build-web.mjs` pins `NODE_ENV=production` so a local `.env` cannot ship React's development bundle
- `npm run smoke` — 28 of 28 non-admin live HTTP checks passed in an earlier development run (33 checks when `SMOKE_ADMIN_EMAIL` and `SMOKE_ADMIN_PASSWORD` are supplied); not re-run against live production
- Seller lifecycle E2E — 53 of 53 live HTTP checks passed against a disposable API and database in an earlier run
- `npm audit` — 0 vulnerabilities at the time of the dependency upgrade; re-run before release
- The legacy-migration test opens a pre-onboarding database and upgrades it to the current migration without losing seeded rows; production readiness reports `schema: current`
- Live production probe at `https://www.dearhills.in` returned `200` for `/api/health`, `/api/health/ready`, `/api/config`, `/api/products` and `/api/auth/me`; `/api/config` reports `payments.configured: false`, `devPaymentsEnabled: false`, and `/api/products` returns 0 items
- Tests use in-memory SQLite and real HTTP routes. They do **not** prove live Razorpay, Resend domain delivery, Google OAuth browser consent or courier behaviour. See [Verification](docs/VERIFICATION.md).

## Documentation

- [Environment and configuration](docs/ENVIRONMENT.md)
- [Deployment, backup and recovery](docs/DEPLOYMENT.md)
- [Seller guide](docs/SELLER_GUIDE.md)
- [Launch and compliance checklist](docs/LAUNCH_CHECKLIST.md)
- [Remaining blockers](docs/REMAINING_BLOCKERS.md)
- [Verification report](docs/VERIFICATION.md)

## Content and image provenance

Development photography comes from Wikimedia Commons under the licences recorded in `public/images/credits.json` and on `/credits`. The images are illustrative; they do not depict the demo sellers or prove a product's origin. Replace them with commissioned photography and seller-supplied evidence before launch.

The homepage hero and editorial set is generated by `node scripts/prepare-home-images.mjs`. It downloads the curated Commons files at a safe thumbnail width, writes 720/1100/1600–1800px progressive JPEGs to `public/images/home/`, and merges attribution into `public/images/credits.json`. The seed reads that file, so regenerate the credits content (or edit it in the admin console) after changing images.

Policy text is explicitly marked **draft** and contains bracketed business facts to complete. It has not been reviewed by a lawyer. The marketplace name, visual identity and product descriptions in the seed are demonstrations, not claims of a trading entity or certification.
