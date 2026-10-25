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
   npm run check          # typecheck, lint, 51 tests, production build
   ```

   Tests are optional on a production host but the build is not. `npm run build` produces `dist/` and `dist-server/`.

2. Create `/opt/pahadi-roots/.env` from `.env.example` and set at minimum:

   ```dotenv
   NODE_ENV=production
   PORT=8787
   APP_URL=https://shop.example.com
   TRUST_PROXY=1

   DATABASE_PATH=/var/lib/pahadi-roots/data/pahadi-roots.db
   UPLOAD_DIR=/var/lib/pahadi-roots/storage/uploads

   SEED_ON_START=false
   ALLOW_DEV_PAYMENTS=false
   ALLOW_DEV_AUTH_HELPERS=false

   RAZORPAY_KEY_ID=
   RAZORPAY_KEY_SECRET=
   RAZORPAY_WEBHOOK_SECRET=

   SMTP_HOST=
   SMTP_PORT=587
   SMTP_USER=
   SMTP_PASS=
   EMAIL_FROM=PAHADI ROOTS <no-reply@shop.example.com>
   SUPPORT_EMAIL=support@shop.example.com
   ```

   Use real values before accepting orders. `APP_URL` **must** be the HTTPS origin; it controls secure cookies and links.

3. Provision the first administrator. This initialises the schema if the database is new:

   ```bash
   cd /opt/pahadi-roots
   npm run admin:create -- owner@shop.example.com "Owner Name"
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
     "database": "up",
     "payments": "unconfigured",
     "shipping": "manual-only",
     "email": "unconfigured"
   }
   ```

   `payments` and `email` become `configured` only when valid server credentials are present.

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
shop.example.com {
    encode zstd gzip
    request_body {
        max_size 6MB
    }
    reverse_proxy 127.0.0.1:8787 {
        header_up X-Forwarded-Proto {scheme}
    }
}
```

Reload with `sudo systemctl reload caddy`. Caddy obtains and renews TLS automatically.

## Nginx alternative

```nginx
server {
    listen 443 ssl http2;
    server_name shop.example.com;

    ssl_certificate     /etc/letsencrypt/live/shop.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/shop.example.com/privkey.pem;

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
    server_name shop.example.com;
    return 301 https://$host$request_uri;
}
```

Set `TRUST_PROXY=1` when behind either proxy. Without it, rate limiting sees the proxy address and secure-cookie detection may be wrong.

## Razorpay go-live

1. Complete Razorpay merchant onboarding and obtain production keys.
2. Put `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` in the production environment. Do not put the secret in the browser bundle or repository.
3. In the Razorpay dashboard, create a webhook to `https://shop.example.com/api/webhooks/razorpay` and subscribe to `payment.captured`, `order.paid`, `payment.failed`, `refund.processed` and `refund.created`.
4. Run a small live transaction end to end, including a refund. Verify:
   - the order becomes `paid` once, not twice;
   - the webhook event is stored in `payment_events`;
   - the seller order moves to `pending`;
   - a refund produces a provider reference and ledger reversal;
   - failure and amount-mismatch paths are visible to an administrator.
5. Keep `ALLOW_DEV_PAYMENTS=false`. Production startup refuses if it is true.

The code uses Razorpay Orders, Checkout signature verification, webhook HMAC verification and the Refunds API. These paths are covered by local HMAC tests but have not been exercised against Razorpay's live service in this build.

## Email go-live

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` and `SUPPORT_EMAIL`. Use a dedicated transactional sending identity and configure SPF, DKIM and DMARC. Test registration verification, password reset, order confirmation, dispatch, refund and seller decision emails.

Without SMTP, notifications are recorded with `skipped`. They are not retried automatically.

## Shipping operations

There is no Shiprocket adapter. Live dispatch is manual:

1. Seller confirms and packs the order.
2. Seller records carrier and tracking number when shipping.
3. Seller or administrator adds shipment events; delivery marks the seller order delivered.
4. Tracking is displayed to the customer.

Use a carrier account separately. Do not configure `SHIPROCKET_*` expecting integration — those variables are reserved and currently inert.

## Release procedure

1. Take a database backup and a storage snapshot.
2. Deploy code to a new release directory; run `npm ci && npm run build`.
3. Apply schema migrations by starting the new process (the app is additive and applies schema/migrations on open). **Back up first**; there are no down migrations.
4. Restart the service and check `/api/health`.
5. Smoke-test login, catalogue, cart, checkout (or deliberate failure path), seller order visibility and admin login.
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

## Backup

### What must be backed up

- SQLite database and its WAL state
- public product images (`UPLOAD_DIR`)
- private seller documents (`storage/private/seller-docs`)
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

Retain daily snapshots for at least 14 days, plus weekly/monthly copies off-host. Encrypt backups at rest and restrict access: they contain personal data, password hashes and order history.

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

3. Copy the chosen backup into place and set ownership:

   ```bash
   cp /var/lib/pahadi-roots/backups/pahadi-roots-2026-10-23T...db /var/lib/pahadi-roots/data/pahadi-roots.db
   chown pahadi:pahadi /var/lib/pahadi-roots/data/pahadi-roots.db
   chmod 600 /var/lib/pahadi-roots/data/pahadi-roots.db
   ```

4. Restore the matching storage snapshot. If the database is from before a file upload, restoring only the database leaves some image/document references broken.

5. Start the service and check health:

   ```bash
   sudo systemctl start pahadi-roots
   curl -fsS http://127.0.0.1:8787/api/health
   ```

6. Verify an administrator login, a recent order, a seller ledger balance and a private document as the owner. Do not announce recovery until these checks pass.

## Monitoring

- Health: `GET /api/health` every minute from an external monitor; alert on non-200 or `database != up`.
- Logs: ship JSON logs to a log service. Watch `unhandled_request_error`, `payment_provider_error`, `razorpay_webhook_failed`, `startup_failed`, `expiry_sweep_failed`.
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
