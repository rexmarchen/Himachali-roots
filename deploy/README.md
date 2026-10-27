# Docker deployment

This is the shortest path to serving the **full Express + SQLite application** at
`https://www.dearhills.in`. The domain is currently served by an Express process
behind Caddy; Vercel remains a static SPA shell only and cannot host the API.

The image runs one Node process serving both the SPA and the API. SQLite, uploads
and private seller documents live on named volumes.

## Prerequisites

- Linux host with Docker Engine and the Compose plugin
- DNS control for `dearhills.in`
- Caddy (recommended) or Nginx on the host for TLS

## First deployment

```bash
git clone https://github.com/rexmarchen/Himachali-roots.git
cd Himachali-roots
cp deploy/production.env.example .env.production
# Edit .env.production: set APP_URL, GOOGLE_CLIENT_ID, a fresh RESEND_API_KEY,
# EMAIL_FROM on a verified sending domain, and SUPPORT_EMAIL/ADMIN_NOTIFICATION_EMAIL.
# Leave Razorpay empty unless a separately scoped payment integration is verified.
chmod 600 .env.production

docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:8787/api/health/ready
```

Readiness must return `200` with `"ready":true` and `"schema":"current"`. Confirm `/api/config` reports `payments.configured:false` unless a payment integration has been separately completed; this build does not claim live payments or refunds.

Send one real test email (registration verification or password reset) and confirm the `notifications` row is `sent` with a provider message id. A `failed` row stores a sanitised error; `skipped` means no provider is configured.

Create the first administrator (it prompts for the password twice):

```bash
docker compose exec -it app node dist-server/server/scripts/create-admin.js \
  owner@dearhills.in "Owner Name"
```

Do **not** enable `SEED_ON_START` in production.

## TLS and the domain

Install Caddy on the host, copy `deploy/Caddyfile` to `/etc/caddy/Caddyfile`, then:

```bash
sudo systemctl reload caddy
curl -fsS https://www.dearhills.in/api/health/ready
```

Before DNS cutover:

1. Remove `dearhills.in` and `www.dearhills.in` from the Vercel project, or the
   old deployment will keep answering.
2. Point `www` and the apex at this host.
3. Add `https://www.dearhills.in` to the Google OAuth authorised JavaScript
   origins.
4. Confirm HTTPS and the readiness endpoint before announcing the site.

## Backups

The database and storage volumes are separate. Back up both.

```bash
# Consistent SQLite snapshot into the backups volume
docker compose exec app node scripts/backup-db.mjs /data/pahadi-roots.db /backups

# Verify it read-only
docker compose exec app node scripts/verify-backup.mjs /backups/pahadi-roots-<timestamp>.db

# Copy off-host
docker compose cp app:/backups/<timestamp>.db ./backups/
```

Storage snapshot while the app is running:

```bash
docker run --rm \
  -v pahadi-roots_pahadi-storage:/storage:ro \
  -v "$PWD/backups:/backups" \
  alpine tar czf "/backups/storage-$(date +%F-%H%M).tgz" -C /storage .
```

Retain at least 14 daily copies plus weekly/monthly off-host copies. Encrypt them:
they contain personal data, password hashes and orders.

## Update and rollback

```bash
# 1. Back up first
docker compose exec app node scripts/backup-db.mjs /data/pahadi-roots.db /backups

# 2. Build the new release
git pull
docker compose up -d --build

# 3. Verify
curl -fsS http://127.0.0.1:8787/api/health/ready
```

Migrations are additive and run on start. There are **no down migrations**.
Rollback means restoring the pre-update database snapshot and the previous image:

```bash
docker compose down
# restore the verified .db into the pahadi-data volume
docker compose up -d
```

Keep the previous image tag until the new release has been stable.

## Useful commands

```bash
docker compose logs -f app
docker compose restart app
docker compose exec app node -e "console.log(process.version)"
```

The container runs as the unprivileged `pahadi` user. The SQLite database, uploads
and private documents must remain writable by that user through the named volumes.
