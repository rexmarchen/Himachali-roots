# Monitoring, alerting and credential rotation

The application is a single Node process behind Caddy, writing JSON lines to
stdout/journald. It has no external error tracker wired in: `SENTRY_DSN` is read
into `env.sentryDsn` but nothing sends to it. Treat "monitoring is live" as
**false** until an owner completes the alert routing below and proves one alert
end to end.

## What already exists in code

| Capability | Detail | Evidence class |
|---|---|---|
| Request ids | Every response carries `X-Request-Id`; a supplied id is reused only if it matches `[A-Za-z0-9._-]{8,64}` | CODE-VERIFIED |
| Structured logs | JSON lines with `level`, `msg`, and specific fields; startup logs `pahadi_roots_api_started` | CODE-VERIFIED |
| 500 diagnostics | `unhandled_request_error` logs the request id, method, path, error name/code and stack server-side; the client still receives only a generic message | CODE-VERIFIED |
| Liveness | `GET /api/health/live` never touches dependencies | CODE-VERIFIED |
| Readiness | `GET /api/health/ready` checks SQLite, the auth tables/columns, migration 13 and `crypto.argon2Sync`; returns 503 with `auth: "mismatch"` or `schema: "outdated"` | CODE-VERIFIED |
| In-process metrics | `MetricsRegistry` records path, method, status and duration per request | CODE-VERIFIED |
| Rate limits | Global and auth-specific counters, exposed in `RateLimit` headers | CODE-VERIFIED |
| Read-only diagnostics | `npm run diagnose` prints runtime, integrity, FK, migration, column and count findings | CODE-VERIFIED |
| External error tracking | Not implemented | CODE-VERIFIED (absent) |

Nothing above proves production is healthy today.

## Alert matrix

Create each alert in the chosen monitoring product and record the real
destination in the "wired" column. A row without a destination is unowned.

| Alert | Signal | Suggested threshold | Route | Owner | Wired |
|---|---|---|---|---|---|
| Service down | `GET /api/health/live` non-200 for 2 minutes | 2 consecutive failures | Page on-call | UNASSIGNED | ☐ |
| Not ready | `/api/health/ready` returns 503 | 2 consecutive failures | Page on-call | UNASSIGNED | ☐ |
| Auth failures | 5xx on `POST /api/auth/login`, `/register`, `/google`, `/mfa/*` | > 5 in 5 minutes | Page on-call | UNASSIGNED | ☐ |
| 5xx spike | Any route, status ≥ 500 | > 1% of requests over 5 minutes | Page on-call | UNASSIGNED | ☐ |
| Payment webhook failures | `payment.webhook_*` errors, unverified signatures, amount mismatch audits | Any occurrence | Alert + investigate same day | UNASSIGNED | ☐ |
| Orders stuck pending payment | `orders.status = 'pending_payment'` older than the reservation window | > 3 in one sweep | Alert | UNASSIGNED | ☐ |
| MFA failures | Failed challenge attempts, locked challenges, `auth.mfa.signin` anomalies | > 10 in 15 minutes | Alert | UNASSIGNED | ☐ |
| Failed emails | `notifications` stuck `queued`/`failed` beyond retry budget | Any row older than 1 hour | Alert | UNASSIGNED | ☐ |
| Settlement anomaly | `npm run report:payouts` exits 2, or paid batch without a reference | Daily run | Alert + freeze payouts | UNASSIGNED | ☐ |
| Database health | `npm run diagnose` critical finding, `integrity_check` failure, disk < 15% | Daily + on failure | Page on-call | UNASSIGNED | ☐ |
| Backup freshness | Newest file in the backup directory older than 24 hours | 24 hours | Page on-call | UNASSIGNED | ☐ |
| Certificate expiry | Caddy-managed TLS < 14 days | 14 days | Alert | UNASSIGNED | ☐ |

## Error-tracking wiring (currently absent)

`SENTRY_DSN` is unused. Options, in order of preference:

1. Wire a Sentry (or equivalent) server SDK around the Express error handler,
   keeping request ids as the correlation key and scrubbing cookies,
   `Authorization` headers, passwords and payout/UPI strings before send.
2. If no SDK is added, ship journald to a log platform that can alert on
   `"level":"error"` and route `X-Request-Id` searches to an operator.

Do not enable a tracker that captures request bodies: auth and payout endpoints
carry credentials and bank details.

## Log hygiene and retention

- Never log `req.body` for `/api/auth/*`, `/api/account/*` payout forms or
  `/api/admin/settlements/*`.
- Never log cookies, `Set-Cookie`, `Authorization`, Razorpay secrets, Resend
  keys or full bank/UPI values.
- Log the request id and route, not the email address, wherever possible.
- Agree a retention window with counsel (order and audit records usually need a
  statutory retention period; debug logs do not).
- Verify with a real search that no secret or full customer record appears in a
  day of production logs. Repeat after wiring a new log sink.

## Investigating the live login 500

Until production logs are supplied, the root cause is **not established**. Use
this sequence on the host during an approved window:

```bash
# 1. The failing request, by id from the response header
sudo journalctl -u pahadi-roots --since "24 hours ago" | grep -F "<X-Request-Id>"

# 2. Any unhandled auth errors
sudo journalctl -u pahadi-roots --since "24 hours ago" | grep -E '"level":"error"|internal_error' | tail -n 100

# 3. Read-only environment and schema proof
cd /opt/pahadi-roots
sudo -u pahadi npm run diagnose
```

`npm run diagnose` requires no write access, prints no secrets or PII, and
distinguishes a missing column (schema mismatch) from a missing
`crypto.argon2Sync` (unsupported runtime). The new server also refuses to start
in production when `crypto.argon2Sync` is unavailable, so that class of 500
cannot be deployed silently again.

## Credential rotation runbook

Rotate after any suspected exposure, staff departure or the old static-bundle
incident. Rotating a credential is a production change: get explicit approval
and schedule a window.

| Credential | How to rotate | Blast radius / verification |
|---|---|---|
| Session secret / cookie signing | Generate a new random value, update the secret store, restart the service | All sessions invalidate; everyone signs in again. Verify login, MFA challenge, logout |
| Razorpay key id/secret | Create new keys in the dashboard, update secrets, restart, run one test-mode payment | Live checkout fails while mismatched; never rotate during an open checkout window |
| Razorpay webhook secret | Create a new endpoint secret, update both sides in the same window | Unsigned webhooks are rejected; confirm a real event arrives and is verified |
| Resend API key | Create a fresh key, update secret, restart, send one real message | Password reset and order mail stop if the key is wrong; check `notifications` rows |
| Google client secret | Only if a confidential flow exists; this build uses the public client id | Sign-in origin must still be `https://www.dearhills.in` |
| Shipping webhook secret | Generate, update courier configuration and secret store | Unsigned courier events are rejected in production |
| SMTP password | Reset with the provider, update secret, restart | Order mail falls back or fails; verify a real inbox |
| Admin passwords | `npm run admin:create` / password reset flow; require MFA re-enrolment | Admin access, audit log integrity |

After rotation: confirm `/api/health/ready` is 200, one login works, one email
arrives, and record the rotation date and operator in the launch log. Never
paste the new secret into chat, docs or a ticket.

## On-call checklist for a 5xx burst

1. Capture `X-Request-Id` from a failing response; find it in journald.
2. `curl -fsS https://www.dearhills.in/api/health/live` and `/ready`.
3. Run `npm run diagnose` on the host (read-only).
4. If readiness is 503: stop and follow the rollback path in
   [DEPLOYMENT.md](DEPLOYMENT.md). Do not migrate or "fix forward" on production.
5. If readiness is green but one route fails: freeze deploys, preserve logs,
   reproduce on staging with the same build hash.
