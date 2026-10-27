# Deployment, backup and recovery

This document describes a practical single-node deployment. The application is a Node process serving both the API and the built React SPA, with SQLite on persistent disk. That is a defensible small-marketplace topology, not a horizontally scalable one.

## Topology

```text
Internet
   │ HTTPS
   ▼
Caddy or Nginx  ──►  127.0.0.1:8787  Node/Express
                         │
                         ├── data/pahadi-roots.db (+ -wal, -shm)
                         ├── storage/uploads          (public product images)
                         └── storage/private/seller-docs (private KYC documents)
```

Run **one** Node instance against a given SQLite database. SQLite uses WAL and serialised write transactions, but it is not designed for multiple application servers writing the same file over shared storage.

### Vercel is not an API host in this repository

`vercel.json` rewrites every path to `/index.html`. There is no serverless function, no Express handler and no proxy to the API. A Vercel deployment is therefore a static SPA shell only:

- there is no static catalogue fallback — the client calls `/api/*` and surfaces the failure honestly;
- registration, login, Google sign-in, carts, checkout, seller and admin screens cannot work;
- browser calls to `/api/*` return 404 (or the SPA HTML, depending on rewrites) and fail rather than creating a fake local session.

**Current status (27 October 2026):** `https://www.dearhills.in` is served by the Express 5 + SQLite process behind Caddy (response header `Server: Caddy`). `/api/health`, `/api/health/ready`, `/api/config`, `/api/products` and `/api/auth/me` return real API JSON. `/api/config` reports `payments.configured: false` and `devPaymentsEnabled: false`; the production catalogue currently contains 0 products and 3 categories. Do not treat the hosted instance as a trading shop until catalogue and operational checks are complete.

A Vercel-only deployment is a preview and not a working shop. Production must run the Node process and SQLite volume as described above, or use the Docker/Caddy or Railway paths.

### Docker option

`Dockerfile`, `compose.yaml`, `deploy/Caddyfile` and `deploy/README.md` package the same single-node topology as a container image. The image was built and smoke-tested locally: it serves the SPA and API on one origin, runs as an unprivileged user, reports readiness with the current schema, and keeps the database, uploads and backups on named volumes. Use this path when the host has Docker and you want Caddy to terminate TLS and permanently redirect the apex to `https://www.dearhills.in`. See [`deploy/README.md`](../deploy/README.md) for first deployment, backup, update and rollback commands.

## Prerequisites

- Linux server (Ubuntu 24.04 LTS or similar) with a non-root service user
- Node.js 22.5+ (Node 24 LTS line recommended)
- A domain with DNS pointing at the server
- Persistent disk for database and uploads
- Reverse proxy with automatic TLS (Caddy is the simplest option)

Place the application in `/opt/pahadi-roots` and data in `/var/lib/pahadi-roots` so releases and data can be managed separately.

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin pahadi
sudo mkdir -p /opt/pahadi-roots /var/lib/pahadi-roots/{data,storage/uploads,storage/private/seller-docs,backups}
sudo chown -R pahadi:pahadi /opt/pahadi-roots /var/lib/pahadi-roots
```

## First deployment

1. Install dependencies and build as the service user:

   ```bash
   cd /opt/pahadi-roots
   npm ci
   npm run check          # typecheck, lint, full test suite, production build
   ```

   Tests are optional on a production host but the build is not. `npm run build` produces `dist/` and `dist-server/`. It runs `scripts/build-web.mjs`, which forces `NODE_ENV=production` before Vite loads `.env`, so a developer's local `NODE_ENV=development` cannot leak React's development bundle into a release.

2. Create `/opt/pahadi-roots/.env` from `.env.example` and set at minimum:

   ```dotenv
   NODE_ENV=production
   PORT=8787
   APP_URL=https://www.dearhills.in
   TRUST_PROXY=1
   ALLOWED_ORIGINS=

   DATABASE_PATH=/var/lib/pahadi-roots/data/pahadi-roots.db
   UPLOAD_DIR=/var/lib/pahadi-roots/storage/uploads
   PRIVATE_DOCS_DIR=/var/lib/pahadi-roots/storage/private/seller-docs

   SEED_ON_START=false
   ALLOW_DEV_PAYMENTS=false
   ALLOW_DEV_AUTH_HELPERS=false

   SESSION_DAYS=30
   SESSION_IDLE_DAYS=7
   SESSION_COOKIE_SAMESITE=lax

   GOOGLE_CLIENT_ID=

   RAZORPAY_KEY_ID=
   RAZORPAY_KEY_SECRET=
   RAZORPAY_WEBHOOK_SECRET=

   RESEND_API_KEY=
   EMAIL_TIMEOUT_MS=10000
   EMAIL_MAX_ATTEMPTS=3
   EMAIL_FROM=PAHADI ROOTS <no-reply@dearhills.in>
   SUPPORT_EMAIL=support@dearhills.in
   ADMIN_NOTIFICATION_EMAIL=support@dearhills.in

   # Optional SMTP fallback; Resend wins when both are set.
   SMTP_HOST=
   SMTP_PORT=587
   SMTP_USER=
   SMTP_PASS=
   ```

   `EMAIL_FROM` must be on a verified Resend sending domain (SPF, DKIM and DMARC configured). Create a **fresh** Resend key for the host; never reuse a key that has appeared in chat or source control. The server refuses to start on critical production misconfiguration and warns when email is unconfigured or still uses `.example` addresses.

   Use real values before accepting orders. `APP_URL` **must** be the HTTPS origin; it controls secure cookies and links. `dearhills.in` must be a mailbox you actually monitor; otherwise set `SUPPORT_EMAIL` to the real support inbox.

3. Provision the first administrator. This initialises the schema if the database is new:

   ```bash
   cd /opt/pahadi-roots
   npm run admin:create -- owner@dearhills.in "Owner Name"
   ```

   The password is prompted without echo. For automated provisioning, set `ADMIN_PASSWORD` for that single command and unset it afterwards. Never seed demo products into production.

4. Start once in the foreground to confirm:

   ```bash
   npm start
   curl -fsS http://127.0.0.1:8787/api/health
   ```

   Expected shape:

   ```json
   {
     "status": "ok",
     "ready": true,
     "database": "up",
     "schema": "current",
     "timestamp": "2026-10-26T17:00:00.000Z"
   }
   ```

   `/api/health` and `/api/health/ready` are readiness checks and return `503` when the database is unreachable or the schema is not current (migration 8). `/api/health/live` checks only that the process is alive. Readiness intentionally does not disclose payment or email configuration; confirm those from startup warnings or the admin console.

5. Configure the reverse proxy and systemd (below).

## systemd

Create `/etc/systemd/system/pahadi-roots.service`:

```ini
[Unit]
Description=PAHADI ROOTS marketplace
After=network.target

[Service]
Type=simple
User=pahadi
Group=pahadi
WorkingDirectory=/opt/pahadi-roots
EnvironmentFile=/opt/pahadi-roots/.env
ExecStart=/usr/bin/node dist-server/server/index.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=20
KillSignal=SIGTERM

# Hardening. Keep the two data paths writable.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/pahadi-roots
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now pahadi-roots
sudo systemctl status pahadi-roots
sudo journalctl -u pahadi-roots -f
```

Logs are structured JSON on stdout/stderr. The process handles `SIGTERM` by closing the HTTP listener and database.

## Caddy

`/etc/caddy/Caddyfile`:

```caddyfile
www.dearhills.in {
    encode zstd gzip
    request_body {
        max_size 6MB
    }
    reverse_proxy 127.0.0.1:8787 {
        header_up X-Forwarded-Proto {scheme}
    }
}

dearhills.in {
    redir https://www.dearhills.in{uri} permanent
}
```

Reload with `sudo systemctl reload caddy`. Caddy obtains and renews TLS automatically for both names.

## Nginx alternative

```nginx
server {
    listen 443 ssl http2;
    server_name www.dearhills.in;

    ssl_certificate     /etc/letsencrypt/live/www.dearhills.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.dearhills.in/privkey.pem;

    client_max_body_size 6m;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name www.dearhills.in dearhills.in;
    return 301 https://www.dearhills.in$request_uri;
}

server {
    listen 443 ssl http2;
    server_name dearhills.in;
    ssl_certificate     /etc/letsencrypt/live/www.dearhills.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/www.dearhills.in/privkey.pem;
    return 301 https://www.dearhills.in$request_uri;
}
```

Set `TRUST_PROXY=1` when behind either proxy. Without it, rate limiting sees the proxy address and secure-cookie detection may be wrong.

## Google sign-in go-live

Google sign-in uses the Google Identity Services ID-token flow. The browser receives a signed credential and the server verifies it with Google's library. **No client secret is used or needed** for this flow.

1. In Google Cloud Console, create or select the production project.
2. Configure the OAuth consent screen. Use the real application name, support email, privacy-policy URL and terms URL. Complete verification if Google requires it for the scopes you request.
3. Create an **OAuth 2.0 Client ID → Web application**.
4. Add **Authorised JavaScript origins**:
   - `https://www.dearhills.in` (canonical production origin)
   - `http://localhost:5173` for local development only
5. Add **Authorised redirect URIs** only if another flow requires them. The GIS popup flow in this build does not need a redirect URI.
6. Put the generated client ID in the production environment as `GOOGLE_CLIENT_ID`. It is public and is served to the browser through `GET /api/config`.
7. Restart the service. Confirm `GET /api/config` reports `googleEnabled: true` and the sign-in page renders the Google button.
8. Test with a real Google account:
   - a new Google user creates exactly one customer account;
   - a returning Google user signs in to the same account;
   - a Google email that matches an existing password account is asked for that password before linking;
   - a disabled account is refused;
   - logging out clears the session server-side.

Do not put a Google client secret in the browser bundle or repository. If a future flow needs offline access or a server-side token exchange, add the secret only to the server environment and document the change.

The production CSP already allows `https://accounts.google.com` for scripts, frames and connections. If the consent screen or GIS is blocked by a browser extension or corporate proxy, test in a clean browser profile before changing the CSP.

### DNS and TLS

The canonical origin is **`https://www.dearhills.in`**. The apex `dearhills.in` should redirect permanently to the `www` host so cookies, canonical links and OAuth origins stay on one origin.

As of 27 October 2026, `www.dearhills.in` is already served by the Express process behind Caddy and `/api/*` returns real JSON. Keep the Vercel project from claiming the custom domain; if it still does, remove it to avoid DNS/TLS conflicts.

For a new host or a move:

1. Deploy this repository to the Node host and start it behind Caddy/Nginx.
2. Remove `dearhills.in` / `www.dearhills.in` from any static host project.
3. At the DNS provider, point:
   - `www` at the Express host (`A`/`AAAA`, or `CNAME` where supported);
   - apex `dearhills.in` at the same host, with the proxy redirecting to `https://www.dearhills.in`.
4. Wait for DNS propagation, then confirm `https://www.dearhills.in/api/health/ready` returns `200` with `"ready": true` and `"schema": "current"`.
5. Add `https://www.dearhills.in` to the Google OAuth authorised JavaScript origins.
6. Set `APP_URL=https://www.dearhills.in` and `TRUST_PROXY=1`.

Terminate TLS at Caddy/Nginx and redirect HTTP to HTTPS. `APP_URL` must exactly match the HTTPS origin used by the browser; a mismatch causes cookie and Origin/CSRF failures. If the SPA and API are split across hosts, follow the split-origin section in [Environment](ENVIRONMENT.md#split-spa-and-api) instead of guessing at CORS settings.

## Payment gateway — out of scope for this build

Payment-gateway integration is explicitly **out of scope** for this production-readiness pass. No Cashfree, PhonePe, Stripe or new Razorpay features were added. The repository contains a pre-existing, configuration-gated Razorpay adapter (Orders, Checkout signature verification, webhook HMAC verification, Refunds API). It is not configured in production (`payments.configured: false`) and has not been exercised against Razorpay's live service.

The safe operating posture is:

1. Keep `ALLOW_DEV_PAYMENTS` and `SIMULATED_CHECKOUT_ENABLED` false. Production startup refuses if either is enabled.
2. Without a configured provider, checkout creates `pending_payment` orders and never marks them paid.
3. Do not advertise online payment, instant refunds or automatic settlement.
4. Treat the Razorpay section in [Remaining blockers](REMAINING_BLOCKERS.md) as a prerequisite for a future, separately scoped integration. If keys are ever added, run a small live transaction and refund end to end before accepting orders, and verify the order becomes paid once, the event lands in `payment_events`, the seller order moves to `pending`, and amount-mismatch paths are visible to an administrator.

Manual refunds record a request, an approval, and a separate completed action with a verified bank/UPI reference. No money moves through this application.

## Email go-live

1. Create a **fresh** Resend API key for this deployment. Do not reuse a key that has been pasted into chat, docs or source control.
2. Verify the sending domain in Resend and publish SPF, DKIM and DMARC records.
3. Set `RESEND_API_KEY`, `EMAIL_FROM` (on the verified domain), `SUPPORT_EMAIL` and `ADMIN_NOTIFICATION_EMAIL`. Keep `EMAIL_TIMEOUT_MS=10000` and `EMAIL_MAX_ATTEMPTS=3` unless there is a reason to change them.
4. Send a real test to a monitored inbox for: registration verification, password reset, order confirmation, seller decision, cancellation, return and refund approval.
5. Check `/admin` integration status and `notifications` rows: `sent` with a provider message id, `failed` with a sanitised error, or `skipped` when unconfigured.
6. Run `retryFailedNotifications` manually if a transient provider outage left failed rows; there is no background retry worker.

SMTP remains a fallback when `RESEND_API_KEY` is empty. Without either provider, notifications are recorded with `skipped` and nothing is sent. Delivery, bounces and complaints are not automatically reconciled.

## Shipping operations

There is no Shiprocket adapter. Live dispatch is manual:

1. Seller confirms and packs the order.
2. Seller records carrier and tracking number when shipping.
3. Seller or administrator adds shipment events; delivery marks the seller order delivered.
4. Tracking is displayed to the customer.

Use a carrier account separately. Do not configure `SHIPROCKET_*` expecting integration — those variables are reserved and currently inert.

## Seasonal campaigns

Campaigns are administered in **Admin → Campaigns**. They are not edited through environment variables or seed files, and there is no public campaign-creation API.

### Create and publish an offer

1. Create a campaign with a name, slug (for example `pahadi-festive-glow`), description and maximum discount percentage. It starts as `draft` and is not publicly readable.
2. Upload the poster in the admin form, or paste an HTTPS URL / `/images` or `/uploads` path. The storefront renders posters in a fixed 1672:941 frame with `object-contain`, so a different ratio is letterboxed rather than cropped or stretched. For the cleanest result, supply a 1672×941 image. Without a poster the homepage banner is suppressed; the campaign page still works.
3. Add each eligible product and a fixed promotional price in paise. The server requires `promo < current base price` and a discount no greater than the campaign cap. Products must be approved and belong to an approved seller.
4. Optionally set a start and end time. An omitted date is not invented by the server: an active campaign without an end date remains live until an administrator changes it. Set both dates for a real seasonal offer.
5. Activate the campaign. Activation validates every configured price and window and refuses to share a product with another live or scheduled campaign. Draft campaigns can be deleted; an active campaign must be archived instead.

A product may belong to only one live or scheduled campaign. Scheduled campaigns go live automatically, so they reserve their products as soon as they are activated, not when the window opens.

### Public behaviour

- `/offers/<slug>` shows the poster, the real status, and only explicitly eligible products with server-computed savings.
- The homepage banner appears only for a live campaign with a poster and at least one eligible product.
- Draft and archived campaigns return `404`; scheduled and expired campaigns are publicly readable but expose no purchasable promotional price.
- The campaign is included in `sitemap.xml` only while it is live.
- The advertised "up to X% off" is derived from the current configured products and their valid promotional prices, not from the campaign cap alone.

### Pricing and withdrawal

`active_campaign_prices` is the only source of a live promotional price. Catalogue listing, product detail, cart lines and checkout all read it, so totals agree and client-submitted prices are ignored. Order lines store both the paid unit price and `original_unit_price_paise` for the customer's record.

To end an offer, set it to `archived` (or let the end date pass). The promo price disappears from the catalogue immediately and open carts are repriced on their next read. If a product's base price is later edited below its promotional price, or the campaign cap is reduced below a configured saving, the view stops applying that invalid promotion rather than selling at a misleading discount. Check the campaign's admin product list after bulk price changes.

Every create, edit, status change, pricing change and deletion is written to `audit_logs` with the acting administrator.

## Staging

**Status on 27 October 2026:** no staging environment exists. There is no staging hostname, server, database, storage bucket, credential set or deployment target in this repository, the Caddy configuration, Compose, Railway or Vercel configuration. Do not invent a hostname, reuse `www.dearhills.in`, point staging DNS at the production host, or copy production user data into a new environment without explicit authorization and a sanitisation step.

A staging deployment is a **separate single-node installation** of the same artifact. It must not share any of the following with production:

| Resource | Staging requirement |
| --- | --- |
| Hostname / TLS | A hostname allocated by the operator (placeholder: `<staging-host>`); never the production apex or `www` |
| Application process | Its own Node process/container and port; never the production service |
| SQLite database | Its own `DATABASE_PATH`; never the production file, its WAL/SHM files or a live network mount |
| Public uploads | Its own `UPLOAD_DIR` |
| Private seller documents | Its own `PRIVATE_DOCS_DIR` |
| Backups | Its own `BACKUP_DIR`/volume, tested with `npm run db:verify` |
| Credentials | Staging-only values; no production Razorpay, Resend, SMTP, Google or admin credentials |
| Data | Demonstration or synthetic data only; production data only with authorization and sanitisation |

Minimum environment for a staging process:

```dotenv
NODE_ENV=production
APP_URL=https://<staging-host>
ALLOWED_ORIGINS=https://<staging-host>
TRUST_PROXY=1
DATABASE_PATH=/srv/staging/data/pahadi-roots.db
UPLOAD_DIR=/srv/staging/storage/uploads
PRIVATE_DOCS_DIR=/srv/staging/storage/private/seller-docs
ALLOW_DEV_PAYMENTS=false
SIMULATED_CHECKOUT_ENABLED=false
ALLOW_DEV_AUTH_HELPERS=false
SEED_ON_START=false
```

Payments stay unconfigured on staging unless a separate test merchant account is authorized. Email must use a staging sender and an explicitly authorized test recipient, or remain unconfigured and record notifications as `skipped`. Google sign-in stays disabled until a staging OAuth client with the staging origin is available.

Deployment and verification sequence once a host is authorized:

1. Record the intended release commit and confirm the working tree is clean.
2. Build the release (`npm ci && npm run check`), then deploy that commit to the staging release directory.
3. Create an empty staging database; do not copy production. Take a baseline backup.
4. Start the process once so the additive migrations run. Confirm `schema_migrations` reaches the expected version, `PRAGMA integrity_check` is `ok` and `PRAGMA foreign_key_check` is empty.
5. Provision a staging-only administrator with `npm run admin:create -- <email> "<name>"` and a password supplied through the host's secret mechanism.
6. Verify `/`, a deep SPA route, `/api/health`, `/api/health/ready` and `/api/config`. `config` must report `payments.configured: false`, `devPaymentsEnabled: false`, `devAuthHelpers: false`, no Google client ID unless deliberately configured, and no secret values.
7. Run `npm run smoke` against the staging URL with staging admin credentials. Run the partial-return/manual-refund flow against disposable staging accounts. Use only an authorized test email recipient.
8. Restart the service and verify login, order history and uploaded files survive. Check logs for secrets.
9. Record the deployed commit, hostname, command results and any blocked integrations.

Until a host and credentials are supplied, external staging deployment is blocked. Production deployment remains prohibited and payments remain out of scope.

## Release procedure

1. Take a database backup and a storage snapshot. Verify the backup file with `npm run db:verify -- <backup.db>`.
2. Deploy code to a new release directory; run `npm ci && npm run build`.
3. Apply schema migrations by starting the new process (the app is additive and applies schema/migrations on open). **Back up first**; there are no down migrations.
4. Restart the service and check `/api/health/live` and `/api/health/ready`.
5. Smoke-test password login, Google sign-in (if configured), catalogue, cart, checkout (or deliberate failure path), seller order visibility and admin login.
6. Keep the previous release until the new one is stable.

Because schema changes are applied automatically, do not point an older binary at a newer database without a tested rollback plan.

### Seller-onboarding migration (schema version 3)

This release adds onboarding tables and rebuilds `seller_applications` inside `BEGIN IMMEDIATE` because the original table's `CHECK` constraint predated drafts and change requests. It also adds columns to `seller_profiles`, `seller_documents` and `products`, and backfills `store_status`/`published_at`.

Before deploying to a database you care about:

1. Copy the database **and** its `-wal`/`-shm` files while the service is stopped, or use `npm run db:backup`.
2. Open the copy once with the new build and confirm `PRAGMA integrity_check` returns `ok`, `PRAGMA foreign_key_check` is empty, and row counts for `seller_profiles`, `seller_applications`, `products` and `orders` are unchanged.
3. Confirm `schema_migrations` contains version `3` and that approved sellers show `store_status = active`.
4. Only then start the new build against the live file. Do not run two application processes against the same SQLite file during the upgrade.

The development database in this repository was upgraded on a copy only; the checked-in `data/pahadi-roots.db` was not modified by verification.

### Seasonal-campaign migration (schema version 5)

Version 4 added demo-order tracking; version 5 adds:

- `campaigns` and `campaign_products`;
- the `active_campaign_prices` SQL view;
- `order_items.original_unit_price_paise`, nullable for historical rows.

The migration is additive and runs inside the normal startup path. Existing orders, carts and catalogue prices are unchanged: a historical order item has no recorded original price, and no promotion is applied until an administrator creates and activates a campaign.

Before deploying:

1. Back up the database with `npm run db:backup` while the service is stopped, or copy the database and its `-wal`/`-shm` sidecars.
2. Start the new build against a copy and confirm `schema_migrations` contains `1, 2, 3, 4, 5`, `PRAGMA integrity_check` returns `ok`, and `PRAGMA foreign_key_check` is empty.
3. Confirm the existing product count, approved-seller count and order count are unchanged.
4. Deploy, open `/api/health`, then create campaigns as drafts before activating one.

There are no down migrations. Restoring the pre-upgrade backup is the rollback path.

### Authentication hardening migration (schema version 6)

Version 6 is additive:

- `auth_identities` stores a verified provider subject (`provider`, `provider_user_id`, email, display name, avatar, last sign-in);
- `auth_link_challenges` stores hashed, single-use, 10-minute linking challenges;
- `sessions.last_seen_at` supports idle expiry and is backfilled from `created_at` for existing sessions.

Existing password hashes, users, orders and carts are not rewritten. Google-only accounts use a non-verifying `password_hash` marker so password login cannot succeed; a password can be set later from **Profile & security**.

Before deploying:

1. Back up with `npm run db:backup` while the service is stopped, or copy the database and its `-wal`/`-shm` sidecars.
2. Open the copy with the new build and run `npm run db:verify -- <backup.db>`. Confirm `schema_migrations` is `[1,2,3,4,5,6]`, `integrity_check` is `ok`, and there are no foreign-key violations.
3. Confirm row counts for users, orders and products are unchanged and that existing sessions still resolve (or accept that they will expire on the new idle window).
4. Start the new build, then check `/api/health/ready`.

Rollback is restoring the version 5 backup; an older binary must not be pointed at the version 6 database.

### Order-integrity migration (schema version 8)

Version 7 added account-recovery OTPs and single-use reset authorisations. Version 8 is additive:

- `order_events` stores the customer-visible order timeline; `return_request_items` stores per-item partial-return quantities and amounts;
- `refunds.return_request_id`, `refunds.dedupe_key` and a unique partial index make refund requests idempotent;
- `notifications.provider_message_id` records the Resend/SMTP provider reference;
- existing `return_requests.requested_amount_paise` rows are backfilled from their order items.

Before deploying:

1. Back up with `npm run db:backup` while the service is stopped, or copy the database and its `-wal`/`-shm` sidecars.
2. Open the copy with the new build and run `npm run db:verify -- <backup.db>`. Confirm `schema_migrations` ends at `8`, `integrity_check` is `ok`, and there are no foreign-key violations.
3. Confirm row counts for users, orders, refunds and notifications are unchanged.
4. Start the new build and check `/api/health/ready` returns `200` with `"schema": "current"`.

There are no down migrations. Restoring the pre-upgrade backup is the rollback path; do not point an older binary at a version 8 database.

## Backup

### What must be backed up

- SQLite database and its WAL state
- public product images (`UPLOAD_DIR`)
- private seller documents (`PRIVATE_DOCS_DIR`, default `storage/private/seller-docs`)
- the production `.env` (in a secret manager, not alongside public backups)
- release artefact/commit reference

### Database snapshot

The repository includes an online backup command using Node's SQLite backup API:

```bash
cd /opt/pahadi-roots
DATABASE_PATH=/var/lib/pahadi-roots/data/pahadi-roots.db \
  npm run db:backup -- /var/lib/pahadi-roots/data/pahadi-roots.db /var/lib/pahadi-roots/backups
```

The server may remain running. The output file is named `pahadi-roots-<timestamp>.db`. A production cron example:

```cron
15 2 * * * cd /opt/pahadi-roots && /usr/bin/npm run db:backup -- /var/lib/pahadi-roots/data/pahadi-roots.db /var/lib/pahadi-roots/backups >> /var/log/pahadi-backup.log 2>&1
```

After each snapshot, verify it read-only:

```bash
npm run db:verify -- /var/lib/pahadi-roots/backups/pahadi-roots-<timestamp>.db
```

The verifier checks `PRAGMA integrity_check`, foreign keys, required tables, migration versions and row counts. It exits non-zero on failure. A passing verification is not a restore test.

Retain daily snapshots for at least 14 days, plus weekly/monthly copies off-host. Encrypt backups at rest and restrict access: they contain personal data, password hashes and order history. Keep at least one backup that predates each schema migration until the new release has been stable for a full business cycle. The repository's `db:backup` command does not copy `UPLOAD_DIR` or `PRIVATE_DOCS_DIR`; snapshot those separately.

### File backup

Use a snapshot-capable tool or `rsync`:

```bash
rsync -a --delete /var/lib/pahadi-roots/storage/ backup-host:/srv/pahadi-roots/storage/
```

Do not delete private documents while they are referenced by seller applications. Prefer versioned/object storage for longer-term retention.

## Restore

Practice this on a staging host before an incident.

1. Stop the service:

   ```bash
   sudo systemctl stop pahadi-roots
   ```

2. Preserve the current database and WAL files instead of deleting them:

   ```bash
   cd /var/lib/pahadi-roots/data
   mv pahadi-roots.db pahadi-roots.db.failed-$(date +%Y%m%d%H%M%S)
   rm -f pahadi-roots.db-wal pahadi-roots.db-shm
   ```

3. Verify the chosen backup before copying it:

   ```bash
   cd /opt/pahadi-roots
   npm run db:verify -- /var/lib/pahadi-roots/backups/pahadi-roots-2026-10-26T...db
   ```

4. Copy the verified backup into place and set ownership:

   ```bash
   cp /var/lib/pahadi-roots/backups/pahadi-roots-2026-10-26T...db /var/lib/pahadi-roots/data/pahadi-roots.db
   chown pahadi:pahadi /var/lib/pahadi-roots/data/pahadi-roots.db
   chmod 600 /var/lib/pahadi-roots/data/pahadi-roots.db
   ```

5. Restore the matching storage snapshot. If the database is from before a file upload, restoring only the database leaves some image/document references broken.

6. Start the service and check readiness:

   ```bash
   sudo systemctl start pahadi-roots
   curl -fsS http://127.0.0.1:8787/api/health/ready
   ```

7. Verify an administrator login, a recent order, a seller ledger balance and a private document as the owner. Do not announce recovery until these checks pass.

## Monitoring

- Health: `GET /api/health/live` frequently and `GET /api/health/ready` every minute from an external monitor; alert on non-200, `ready != true` or `schema != current`.
- Logs: ship JSON logs to a log service. Watch `unhandled_request_error`, `payment_provider_error`, `razorpay_webhook_failed`, `startup_failed`, `expiry_sweep_failed`. Authentication and account-linking actions are recorded in `audit_logs`; review failed sign-in patterns and linking decisions.
- Disk: alert at 80% for database, uploads and backups. WAL growth can indicate long-running readers or a stuck writer.
- Payments: reconcile Razorpay settlements against `payments` and `refund` records daily; the admin payments screen is not a substitute for provider reconciliation.
- Backups: verify restore quarterly, not merely that a file exists.
- `SENTRY_DSN` is not wired yet; use log aggregation or add an error-reporting integration before launch.

## Moving to PostgreSQL or Supabase

SQLite was chosen because no Supabase environment existed. For multi-instance deployment, managed backups, row-level security and higher write concurrency, migrate to PostgreSQL:

1. Translate `server/schema.sql` types (`TEXT`, integer timestamps, booleans) to PostgreSQL and convert SQLite-specific `strftime` and conflict syntax.
2. Replace `server/db.ts` (`DatabaseSync`) with a pooled `pg` client and a transaction helper preserving `tx()` semantics.
3. Audit raw SQL placeholders (`?` → `$1`) and atomic inventory updates.
4. Recreate access control with PostgreSQL roles/RLS or keep all access server-side. The current app never exposes a database key to the browser.
5. Port integration tests to a disposable PostgreSQL database/container.
6. Move uploads to object storage with signed URLs, keeping private KYC documents private.
7. Only then run more than one application instance and move rate limiting/session concerns to shared infrastructure.

Do not assume the SQLite file is a drop-in production database for a high-traffic marketplace.
