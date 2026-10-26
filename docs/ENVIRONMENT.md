# Environment and configuration

PAHADI ROOTS reads configuration from the process environment and an optional `.env` file at the repository root. `server/env.ts` loads `.env` with Node's `process.loadEnvFile`; variables already present in the process environment take precedence. Do not commit `.env`.

Start from the template:

```powershell
Copy-Item .env.example .env
```

## Variables

### Application

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | Set `production` for a production build. Production enables HSTS/CSP, serves `dist/`, and force-disables development helpers. |
| `PORT` | `8787` | API and production SPA port. |
| `APP_URL` | `http://localhost:5173` | Public origin, no trailing slash. Must be the HTTPS origin in production; it controls secure cookies and links in email. |
| `TRUST_PROXY` | `0` | Set `1` behind Caddy/Nginx/Cloudflare so secure-cookie detection and rate limiting see the real client IP. |
| `SESSION_DAYS` | `30` | Session and cookie lifetime in days. |
| `LOG_LEVEL` | `info` | Parsed and exposed for future use; the current logger writes structured JSON without level filtering. |

### Data and storage

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_PATH` | `./data/pahadi-roots.db` (resolved from the process working directory) | SQLite database. Use an absolute path on a persistent volume in production. WAL sidecar files are created alongside it. |
| `UPLOAD_DIR` | `./storage/uploads` | Public product images, served at `/uploads/*`. Use an absolute path on persistent storage. |
| `PRIVATE_DOCS_DIR` | `./storage/private/seller-docs` | Private seller/KYC documents. Never served publicly; back it up with the database. |
| `SEED_ON_START` | unset/false | In non-production only, seeds if the product table is empty. Ignored in production. |
| `DEMO_SEED_PASSWORD` | `PahadiDemo!2026` | Password for seeded demo sellers. Change it if a development instance is shared. |
| `ALLOW_DEMO_SEED_IN_PRODUCTION` | unset/false | Emergency escape hatch for a deliberate staging exercise. Never use for a live marketplace. |

Private seller documents are stored under `PRIVATE_DOCS_DIR` (default `storage/private/seller-docs`, relative to the process working directory). This directory is **not** publicly served and must be backed up alongside the database. Keep the service's working directory stable across releases, or set both storage paths to absolute locations on persistent volumes.

### Commerce

| Variable | Default | Notes |
| --- | --- | --- |
| `DEFAULT_COMMISSION_BP` | `1500` | Global commission in basis points (1500 = 15%). Seller and category rules take precedence. |
| `FLAT_SHIPPING_PAISE` | `7900` | ₹79 in paise, charged below the free-shipping threshold after discounts. |
| `FREE_SHIPPING_THRESHOLD_PAISE` | `149900` | ₹1,499 in paise. |
| `RESERVATION_MINUTES` | `30` | Unpaid orders expire and release reserved stock after this period. A sweep runs at startup and every minute. |

Tax rates are deliberately **not** configured globally. `tax_rate_bp` defaults to `0` and GST-inclusive prices snapshot a zero tax component until rates are confirmed and set per product/category. Tax invoices are not generated. Both are launch blockers (see [Remaining blockers](REMAINING_BLOCKERS.md)).

### Development helpers

| Variable | Default | Notes |
| --- | --- | --- |
| `ALLOW_DEV_PAYMENTS` | `false` | Non-production only. Enables `/api/dev/orders/:orderNumber/pay`, which marks an order paid and returns an explicit "no money moved" warning. Production startup aborts if this resolves to true. |
| `ALLOW_DEV_AUTH_HELPERS` | `false` | Non-production only. Allows verification/reset links to be returned in API responses and enables `/api/auth/dev/last-reset-link` when SMTP is absent. Production startup aborts if true. |

Do not enable either helper on any host reachable by the public, even while testing.

### Razorpay

| Variable | Default | Notes |
| --- | --- | --- |
| `RAZORPAY_KEY_ID` | empty | Test keys begin `rzp_test_`; the status endpoint reports test/live mode from this prefix. |
| `RAZORPAY_KEY_SECRET` | empty | Server-only secret. Never expose it to the client. |
| `RAZORPAY_WEBHOOK_SECRET` | empty | Webhook signing secret from the Razorpay dashboard. Required for webhook processing. |

Checkout is enabled only when both key ID and secret are present. Without them, the API returns `payment_not_configured` and (in development with `ALLOW_DEV_PAYMENTS`) offers simulation.

Webhook endpoint:

```text
POST {APP_URL}/api/webhooks/razorpay
```

Subscribe to `payment.captured`, `order.paid`, `payment.failed`, `refund.processed` and `refund.created`. The handler:

- verifies `x-razorpay-signature` as HMAC-SHA256 over the raw body;
- deduplicates provider event IDs;
- checks that the captured amount equals the stored payable amount and records an amount mismatch instead of marking paid if they differ;
- records raw provider events in `payment_events`;
- finalises refunds matched by provider refund/payment IDs.

### SMTP / transactional email

| Variable | Default | Notes |
| --- | --- | --- |
| `SMTP_HOST` | empty | SMTP server hostname. |
| `SMTP_PORT` | `587` | Port `465` enables implicit TLS; other ports use STARTTLS as negotiated by Nodemailer. |
| `SMTP_USER` | empty | SMTP username. |
| `SMTP_PASS` | empty | SMTP password or app password. |
| `EMAIL_FROM` | `PAHADI ROOTS <no-reply@pahadiroots.example>` | From header. Must be an authorised sending identity. |
| `SUPPORT_EMAIL` | `hello@pahadiroots.example` | Displayed in email footers and some content. |

SMTP is considered configured only when host, user and password are all present. Without SMTP, notifications are still recorded in the database with status `skipped` and no email is sent. Failed deliveries are recorded as `failed`; there is no outbox retry worker yet.

### Reserved integration settings

| Variable | Status |
| --- | --- |
| `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_LOCATION` | Parsed but **not implemented**. Dispatch is manual (carrier name, tracking number and shipment events). Setting these does not change behaviour. |
| `SENTRY_DSN` | Parsed but **not wired**. Errors are written as structured JSON to stdout/stderr. |

## Production startup checks

With `NODE_ENV=production`, the server:

- serves the built SPA from `dist/` and falls back to `index.html` for client-side routes;
- enables HSTS, a strict CSP and secure cookies when `APP_URL` is HTTPS;
- refuses to start if development payment or auth helpers are enabled;
- warns if `APP_URL` is not HTTPS, Razorpay is not configured, SMTP is not configured, or the database file is missing.

Warnings are not hard failures for missing payment/email credentials: this permits an intentionally catalogue-only deployment. A storefront that accepts checkout without a payment provider is not a live-commerce configuration.

Run a production build before starting:

```powershell
npm run build
$env:NODE_ENV = "production"
npm start
```

## Local proxy and cookies

- Vite: `http://localhost:5173`
- API: `http://localhost:8787`
- Session cookie: `pr_session`
- Cart cookie: `pr_cart`
- CSRF header required on API mutations: `X-Requested-With: pahadi-roots`

The Vite proxy forwards `/api`, `/uploads`, `/sitemap.xml` and `/robots.txt`. In production, both SPA and API are served by the same Express process, so no proxy path configuration is needed beyond forwarding all requests to the Node port.

## Secret handling

- Generate a unique admin password; never ship a default admin account.
- Keep `.env` out of version control and restrict its permissions.
- Razorpay and SMTP secrets belong only in the server environment.
- Rotate credentials after staff changes or suspected exposure.
- Database backups contain password hashes, personal data and order history; treat them as sensitive.
- The demo seller password is public by design only for `.test` accounts. Do not reuse it anywhere real.
