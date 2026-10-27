# Railway Production Deployment Guide — PAHADI ROOTS / Dear Hills

This document defines the production-grade deployment specification for running the backend and unified web application on [Railway](https://railway.com).

---

## 1. Architecture Overview

- **Runtime**: Node.js 24 Bookworm Slim running single-node Express 5 API with built React 19 SPA.
- **Database**: `node:sqlite` `DatabaseSync` in WAL (Write-Ahead Logging) mode.
- **Process Model**: Single replica (`numReplicas: 1`). SQLite requires exactly one writer process.
- **Storage**: Persistent Railway Volume mounted at `/data` containing:
  - Database: `/data/pahadi-roots.db`
  - User Uploads: `/data/uploads`
  - KYC / Private Seller Documents: `/data/private/seller-docs`
  - Automated Backups: `/data/backups`

---

## 2. Configuration Files

### `railway.json`
Located in repository root:
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "numReplicas": 1,
    "sleepApplication": false,
    "healthcheckPath": "/api/health/ready",
    "healthcheckTimeout": 120,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### `scripts/docker-entrypoint.sh`
Railway mounts volumes as `root:root` (0755). The entrypoint script ensures directories exist, chowns `/data` to unprivileged user `pahadi`, and executes the process via `gosu pahadi`:
```sh
#!/bin/sh
set -e
mkdir -p /data/uploads /data/private/seller-docs /data/backups /storage/uploads /storage/private/seller-docs /backups
if [ "$(id -u)" = '0' ]; then
  chown -R pahadi:pahadi /data /storage /backups /app 2>/dev/null || true
  exec gosu pahadi "$@"
fi
exec "$@"
```

---

## 3. Persistent Volume Setup on Railway

> [!IMPORTANT]
> A persistent volume is required so that your SQLite database, seller document uploads, and product photos survive deployments and container restarts.

1. Open your project on **Railway Dashboard** (`https://railway.com`).
2. Select your service (`pahadi-roots` / backend service).
3. Navigate to **Volumes** tab.
4. Click **Add Volume**.
5. Set **Mount Path** to:
   ```
   /data
   ```
6. Save.

---

## 4. Production Environment Variables

Add the following variables in the Railway Service **Variables** tab:

| Variable | Recommended Production Value | Description |
|---|---|---|
| `NODE_ENV` | `production` | Enables production mode and security guards |
| `PORT` | `8787` *(or let Railway inject `$PORT`)* | Port listened to by Express |
| `APP_URL` | `https://www.dearhills.in` | Canonical public HTTPS URL |
| `TRUST_PROXY` | `1` | Trusts Railway's reverse proxy for TLS & client IPs |
| `DATABASE_PATH` | `/data/pahadi-roots.db` | Persistent SQLite database file on volume |
| `UPLOAD_DIR` | `/data/uploads` | Persistent directory for public product & seller photos |
| `PRIVATE_DOCS_DIR` | `/data/private/seller-docs` | Persistent directory for encrypted seller KYC files |
| `SESSION_DAYS` | `30` | Maximum session lifetime |
| `SESSION_IDLE_DAYS` | `7` | Inactivity session timeout |
| `SESSION_COOKIE_SAMESITE` | `lax` | Use `lax` when unified, `none` if frontend on separate domain |
| `SEED_ON_START` | `true` *(on first deploy)* / `false` | Seeds initial catalog if database is completely empty |
| `ALLOW_DEV_PAYMENTS` | `false` | Hard block: must be false in production |
| `ALLOW_DEV_AUTH_HELPERS` | `false` | Hard block: must be false in production |
| `GOOGLE_CLIENT_ID` | `129835560363-tbk55n76db9qsuu21i6rr2n9uv5oi8f0.apps.googleusercontent.com` | Google OAuth Web Client ID |
| `SEED_ADMIN_EMAIL` | `anshuar9065@gmail.com` | Automatically provisions admin on initial seed |
| `SEED_ADMIN_PASSWORD` | *(Secure password, min 8 chars)* | Used for initial admin provisioning |
| `RAZORPAY_KEY_ID` | `rzp_live_...` | Razorpay Live API Key ID |
| `RAZORPAY_KEY_SECRET` | `...` | Razorpay Live Secret Key |
| `RAZORPAY_WEBHOOK_SECRET` | `...` | Razorpay Webhook Signing Secret |
| `SMTP_HOST` | `smtp.resend.com` / `smtp.gmail.com` | SMTP host for transactional emails |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | `...` | SMTP username |
| `SMTP_PASS` | `...` | SMTP app password |
| `EMAIL_FROM` | `PAHADI ROOTS <no-reply@dearhills.in>` | Transactional email from address |
| `SUPPORT_EMAIL` | `support@dearhills.in` | Store support email address |
| `LOG_LEVEL` | `info` | Logging verbosity |

---

## 5. Deployment Methods

### Option A: Direct GitHub Continuous Deployment (Recommended)
1. Go to **Railway.com** -> **New Project** -> **Deploy from GitHub repo**.
2. Select `rexmarchen/Himachali-roots`.
3. Add the Persistent Volume `/data` under **Volumes**.
4. Add the **Variables** as listed above.
5. Railway will automatically build the `Dockerfile`, mount `/data`, verify healthcheck on `/api/health/ready`, and launch the container.

### Option B: Railway CLI Deployment
If using Railway CLI locally:
1. Log in to Railway:
   ```bash
   railway login
   ```
2. Link or create project:
   ```bash
   railway link
   ```
3. Attach volume:
   ```bash
   railway volume add --mount-path /data
   ```
4. Deploy:
   ```bash
   railway up
   ```

---

## 6. Verifying Production Readiness

Once deployed, Railway checks:
- `GET /api/health/ready` -> Returns `200 OK` with JSON:
  ```json
  {
    "status": "ready",
    "checks": {
      "database": "ok",
      "schema": "current",
      "storage": "writable",
      "privateDocs": "writable"
    }
  }
  ```
- `GET /api/config` -> Returns `200 OK` with `googleEnabled: true`.
- Log in with `anshuar9065@gmail.com` -> Admin privileges verified.
