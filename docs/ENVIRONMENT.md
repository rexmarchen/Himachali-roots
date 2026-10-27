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
| `APP_URL` | `http://localhost:5173` | Public origin, no trailing slash. Production for this project is `https://www.dearhills.in`; it controls secure cookies, trusted origins and links in email. `APP_BASE_URL` is accepted as an alias and takes precedence when both are set. |
| `TRUST_PROXY` | `0` | Set `1` behind Caddy/Nginx/Cloudflare so secure-cookie detection and rate limiting see the real client IP. |
| `ALLOWED_ORIGINS` | empty | Comma-separated extra browser origins permitted to call the API with credentials. Only for a split SPA/API deployment; same-origin needs none. Each entry must be HTTPS in production. |
| `VITE_API_BASE_URL` | empty | Build-time client setting. The API origin used by the browser (for example `https://api.shop.example`). Leave unset to call same-origin `/api`. |
| `SESSION_DAYS` | `30` | Absolute session lifetime and cookie lifetime in days. |
| `SESSION_IDLE_DAYS` | `7` | Session expires after this many days without activity. Must be between 1 and `SESSION_DAYS`. |
| `SESSION_COOKIE_SAMESITE` | `lax` | `lax`, `strict`, or `none`. `none` is only for a cross-site SPA/API split, requires HTTPS, and must be paired with an explicit `ALLOWED_ORIGINS` allowlist. |
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

### Google sign-in

| Variable | Default | Notes |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | empty | OAuth 2.0 **Web application** client ID from Google Cloud Console. The client ID is public; it is expected in the browser. |
| `GOOGLE_CLIENT_SECRET` | not used | This build uses Google Identity Services ID tokens verified server-side, so no client secret is read, stored or required. Do not add one unless the flow changes. |

Google sign-in is hidden until `GOOGLE_CLIENT_ID` is set. The browser receives a signed ID token from Google Identity Services and posts it to `POST /api/auth/google`. The server verifies the signature, issuer, audience, expiry and `email_verified` claim with `google-auth-library` before creating a session.

Authorise these JavaScript origins on the OAuth client:

- `https://www.dearhills.in` (the canonical `www` origin)
- `https://dearhills.in` only if the apex domain is served directly instead of redirecting to `www`
- `http://localhost:5173` while developing

Never authorise a domain you do not control. A Google sign-in whose email already belongs to a password account is **not** merged automatically: the API returns a 10-minute single-use linking challenge, and the customer must enter the existing password at `POST /api/auth/google/link` before the identity is attached. The stable Google `sub` is the account key; email is descriptive only.

A Google-only account can add a password from **Account → Profile & security** and then remove Google sign-in. The API refuses to remove the last usable sign-in method.

Google CSP entries are already allowed for `accounts.google.com` in production. If you add a different identity provider, update the CSP explicitly.

### Development helpers

| Variable | Default | Notes |
| --- | --- | --- |
| `ALLOW_DEV_PAYMENTS` | `false` | Non-production only. Enables `/api/dev/orders/:orderNumber/pay`, which marks an order paid and returns an explicit "no money moved" warning. Production startup aborts if enabled. |
| `SIMULATED_CHECKOUT_ENABLED` | `false` | Non-production only. Exposes the labelled demo-checkout button and the same simulation endpoint. Production startup aborts if enabled in any form. |
| `ALLOW_DEV_AUTH_HELPERS` | `false` | Non-production only. Allows verification/reset links to be returned in API responses and enables `/api/auth/dev/last-reset-link` when email is absent. Production startup aborts if true. |

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

### Transactional email (Resend or SMTP)

| Variable | Default | Notes |
| --- | --- | --- |
| `RESEND_API_KEY` | empty | Preferred provider. Server-only. Create a **fresh** key for this deployment; never reuse a key that has appeared in chat, docs or source control. |
| `EMAIL_TIMEOUT_MS` | `10000` | Per-request timeout for Resend. |
| `EMAIL_MAX_ATTEMPTS` | `3` | Retry attempts for retryable Resend responses (clamped to 1–5). |
| `EMAIL_FROM` | `PAHADI ROOTS <no-reply@pahadiroots.example>` | From header. Must be a verified Resend sending domain or an authorised SMTP identity. Placeholder `.example` addresses are rejected as a production warning. |
| `SUPPORT_EMAIL` | `hello@pahadiroots.example` | Displayed in email footers and some content. |
| `ADMIN_NOTIFICATION_EMAIL` | `SUPPORT_EMAIL` | Real monitored inbox for return, refund and account-deletion alerts. |
| `SMTP_HOST` | empty | SMTP fallback hostname. |
| `SMTP_PORT` | `587` | Port `465` enables implicit TLS; other ports use STARTTLS as negotiated by Nodemailer. |
| `SMTP_USER` | empty | SMTP username. |
| `SMTP_PASS` | empty | SMTP password or app password. |

Provider resolution is `RESEND_API_KEY` → SMTP → none. Without either provider, notifications are recorded with status `skipped` and nothing is sent. Resend requests carry an `Idempotency-Key`, retry with backoff, and persist the provider message id. Atomic dedupe (`INSERT OR IGNORE` on the dedupe key) prevents duplicate order mail. Provider failures are recorded as `failed` with a sanitised, length-limited error that redacts API keys. `retryFailedNotifications` in `server/lib/email.ts` can retry `failed` rows manually; there is no background outbox worker or admin retry button yet.

### Reserved integration settings

| Variable | Status |
| --- | --- |
| `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_PICKUP_LOCATION` | Parsed but **not implemented**. Dispatch is manual (carrier name, tracking number and shipment events). Setting these does not change behaviour. |
| `SENTRY_DSN` | Parsed but **not wired**. Errors are written as structured JSON to stdout/stderr. |

## Production startup checks

With `NODE_ENV=production`, the server:

- serves the built SPA from `dist/` and falls back to `index.html` for client-side routes;
- enables HSTS, a strict CSP and secure cookies when `APP_URL` is HTTPS;
- refuses to start (exit code 1) if development payment/auth helpers are enabled, `APP_URL` is not HTTPS, `SESSION_IDLE_DAYS` is outside `1..SESSION_DAYS`, `SESSION_COOKIE_SAMESITE=none` is used without HTTPS, or an `ALLOWED_ORIGINS` entry is not HTTPS;
- warns if Razorpay is not configured, no email provider is configured, `EMAIL_FROM`/`ADMIN_NOTIFICATION_EMAIL` still use `.example` addresses, the database file is missing, `TRUST_PROXY` is disabled, or `GOOGLE_CLIENT_ID` is absent/malformed. Google sign-in is then hidden; password login still works.

Warnings are not hard failures for missing payment/email credentials: this permits an intentionally catalogue-only deployment. A storefront that accepts checkout without a payment provider is not a live-commerce configuration. Payment-gateway integration is out of scope for this build; adding live keys does not by itself make payments and refunds production-ready.

Health endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health/live` | Process liveness only. Does not touch the database. |
| `GET /api/health/ready` | Readiness: database reachable and schema current (migration 8). Returns `503` when not ready. |
| `GET /api/health` | Alias of readiness, kept for existing monitors. |

Readiness deliberately does not disclose payment, SMTP or storage configuration. Check those through startup warnings and the admin console, not a public endpoint.

Run a production build before starting:

```powershell
npm run build
$env:NODE_ENV = "production"
npm start
```

## Local proxy and cookies

- Vite: `http://localhost:5173`
- API: `http://localhost:8787`
- Session cookie: `pr_session` (`HttpOnly`, `SameSite=Lax` by default, `Secure` on HTTPS)
- Cart cookie: `pr_cart`
- CSRF header required on API mutations: `X-Requested-With: pahadi-roots`

The Vite proxy forwards `/api`, `/uploads`, `/sitemap.xml` and `/robots.txt`. In production, both SPA and API are served by the same Express process, so no proxy path configuration is needed beyond forwarding all requests to the Node port.

Browser mutations are also checked against `Origin`. A request whose `Origin` is neither the request host, `APP_URL`, nor an explicit `ALLOWED_ORIGINS` entry is rejected with `403` and code `csrf`. Requests without `Origin` (server-to-server calls, same-origin GETs) pass this check but still need the header for mutations.

### Split SPA and API

A same-origin deployment is strongly recommended. If the SPA must be served from a different site than the API:

1. Set `VITE_API_BASE_URL` to the API origin at build time.
2. Set `ALLOWED_ORIGINS` to the SPA origin on the API.
3. Serve both over HTTPS and set `SESSION_COOKIE_SAMESITE=none`.
4. Keep `credentials: 'include'` on API calls and keep the `X-Requested-With` header.
5. Re-test login, logout, cart merge, Google sign-in and webhooks after the split. Cookies with `SameSite=None` are third-party cookies and may be blocked by browser privacy settings; a first-party API on a subdomain of the same site is safer.

The Vercel configuration in this repository is a static SPA rewrite only. It does not host the Express API, and there is no static catalogue fallback. A Vercel-only deployment shows the shell but cannot load products, register, sign in, keep a cart or place an order. Production must run the Node process (Docker/Caddy or Railway) as described in [Deployment](DEPLOYMENT.md).

## Secret handling

- Generate a unique admin password; never ship a default admin account.
- Keep `.env` out of version control and restrict its permissions.
- Razorpay, Resend and SMTP secrets belong only in the server environment.
- Rotate credentials after staff changes or suspected exposure. A leaked Resend key must be revoked in the Resend dashboard, replaced with a fresh key, and never copied into documentation, logs or chat.
- Database backups contain password hashes, personal data and order history; treat them as sensitive.
- The demo seller password is public by design only for `.test` accounts. Do not reuse it anywhere real.
