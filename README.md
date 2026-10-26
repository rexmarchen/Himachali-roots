# PAHADI ROOTS

A multi-vendor marketplace for products made and grown in Himachal Pradesh — storefront, customer accounts, seller workspace and administrator console in one application.

The visual system is deliberately editorial rather than "startup dashboard": warm paper, orchard burgundy, apple blossom and harvest gold, Cormorant Garamond display type and Manrope interface type. Product and story pages are built around makers, materials and places, not generic Himalayan decoration.

> **Project status: a complete, tested development build — not a launched business.**
>
> Core commerce and marketplace workflows run against a real server and database. Live payment, email and courier integrations cannot be validated until credentials and merchant approvals exist. Demonstration records are labelled as demonstrations. See [Remaining blockers](docs/REMAINING_BLOCKERS.md) before treating this as production-ready.

**Main hosted link:** [https://www.dearhills.in](https://www.dearhills.in). At the time of writing it is a **static Vercel build only** — `/api/*` returns 404, so sign-in, carts and checkout do not work there. The intended production origin is the same URL served by the Express + SQLite process described in [Deployment](docs/DEPLOYMENT.md). Do not treat the current static deployment as the live shop.

## What works now

| Area | Implemented and exercised |
| --- | --- |
| Storefront | Home, seasonal offer page with poster and eligible-product listing, shop filters/search/sort, product pages, maker directory and profiles, cart, authenticated checkout, editorial pages, policies, image credits, sitemap |
| Customer account | Registration/login, Google sign-in with explicit password-confirmed linking, email verification, password reset, addresses, order history/detail, cancellation and return requests, reviews for delivered purchases, wishlist, notifications, profile and deletion request |
| Seller workspace | Ten-step resumable maker application with category-aware questions, private document upload, explicit application/store status and review history; approval gate; dashboard and readiness checklist; product drafts, submission and resubmission after change requests; image upload, inventory, order confirm → pack → ship → deliver, tracking, earnings ledger, settlements, store profile, notifications |
| Admin console | Seller application review with evidence, checklist, requirements, reason-required decisions, review history and audit trail; product moderation including change requests; seasonal campaign creation, status/window control, poster upload, eligible-product pricing; category management, orders and fulfilment, payments, refunds, returns, cancellations, commission rules, settlement creation/payout recording, customers, review moderation, structured content editors, coupons, support inbox, audit log, integration status |
| Commerce rules | Integer-paise accounting, GST-inclusive prices, server-side repricing, coupon validation and redemption limits, shipping thresholds, commission snapshots, stock reservation, idempotent checkout, seller-order splitting |
| Security | scrypt passwords, server-verified Google ID tokens with explicit account linking, opaque hashed sessions with rotation and idle/absolute expiry, RBAC, CSRF header + origin allowlist checks, rate limits, Helmet/CSP, parameterised SQL, ownership checks, upload type/signature validation, HMAC payment verification, audit logging |
| Quality | TypeScript typecheck, ESLint, 131 integration/security/migration/campaign tests, live HTTP smoke, seller-lifecycle E2E, production build, dependency audit |

The full route tree is available without an external service. Google Identity Services, Razorpay and SMTP are the external integrations wired; courier dispatch is manual. The application reports unconfigured integrations rather than pretending they are live.

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
| `npm test` | 131 Vitest/Supertest tests |
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

Last verified on 26 October 2026 with Node 24.21.0:

- `npm run typecheck` — passed
- `npm run lint` — passed
- `npm test` — 131 of 131 tests passed across 16 files, including Google sign-in/linking, session hardening, campaign, seller onboarding, admin products, checkout, refunds and legacy-migration suites
- `npm run build` — passed; SPA and `dist-server/server/index.js` generated (Vite reports a >500 kB chunk warning)
- `npm run smoke` — 28 of 28 non-admin live HTTP checks passed against a running development API (33 checks when `SMOKE_ADMIN_EMAIL` and `SMOKE_ADMIN_PASSWORD` are supplied), including storefront, registration, checkout with the labelled development payment simulation, seller confirm → pack → ship → deliver, and the admin settlement hold guard
- Seller lifecycle E2E — 53 of 53 live HTTP checks passed against a disposable API and database
- `npm audit` — 0 vulnerabilities after upgrading `nodemailer` and `vitest`
- The legacy-migration test opened a pre-onboarding v1–v2 database and upgraded it to version 6 without losing seeded rows; the development database itself is at migration 6
- Campaign, cart and order rows were verified through public and admin HTTP endpoints, with the promotional price applied consistently and the original unit price retained on order lines
- `/api/health/ready` returns `ready: true`, `database: up`, `schema: current` in the default development environment; it deliberately omits integration configuration

The tests use an in-memory SQLite database and exercise real HTTP routes. They cover Google token claims/sign-in/linking and session hardening, auth/RBAC/CSRF, storefront home/catalogue/sitemap, campaign eligibility, scheduling/expiry, overlap guards and promotional repricing in catalogue/cart/checkout, checkout repricing and idempotency, stock races, coupon use, GST snapshots, seller isolation, fulfilment order, ledger/settlement eligibility, cancellation/refund/return accounting, upload signatures/private documents, admin category rules, Razorpay webhook signature/idempotency/amount mismatch, draft save/resume, category-aware validation (including FSSAI rules for food), duplicate submission, change requests and resubmission revisions, self-approval refusal, cross-seller isolation, product moderation/publish/suspend, and upgrading a pre-onboarding database. They do **not** prove live provider behaviour. See [Verification](docs/VERIFICATION.md).

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
