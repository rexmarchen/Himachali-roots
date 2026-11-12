# Email and DNS go-live

Status: **NOT CONFIGURED / NOT VERIFIED**. The live `/api/config` reports a
support address, but no delivery or DNS authentication was proven in this round.
Sending is optional for a preview; it is mandatory before real orders.

## 1. Sending domain

Use a subdomain or the apex consistently, for example `dearhills.in` with
`EMAIL_FROM="DEAR HILLS <no-reply@dearhills.in>"`. Do not mix `mail.dearhills.in`
in links with `dearhills.in` in the From header.

| Record | Purpose | Expected |
|---|---|---|
| SPF | Authorise the provider | A single `v=spf1` record that includes the provider and ends `~all`; never two SPF records |
| DKIM | Message signing | Provider-published selector record, verified in the provider dashboard |
| DMARC | Alignment and reporting | `v=DMARC1; p=quarantine; rua=mailto:<monitored>; adkim=s; aspf=s` (start at `none` only while testing, then move to quarantine) |
| MX | Inbound support mail | Provider/host MX records for the monitored mailboxes |
| Return-Path / bounce | Bounce handling | Provider default, or a CNAME the provider specifies |

Verify with an external DNS checker and by reading the full headers of a received
message: SPF pass, DKIM pass, DMARC pass.

## 2. Mailboxes

Create and monitor, at minimum: `no-reply@`, `support@`, `grievance@` (or the
named grievance officer's address) and `orders@` if used. These must be real
mailboxes a named person reads, not aliases that discard mail. Record the owner.

## 3. Application configuration

```dotenv
RESEND_API_KEY=<fresh key created for this deployment>
EMAIL_FROM=DEAR HILLS <no-reply@dearhills.in>
SUPPORT_EMAIL=support@dearhills.in
ADMIN_NOTIFICATION_EMAIL=support@dearhills.in
EMAIL_TIMEOUT_MS=10000
EMAIL_MAX_ATTEMPTS=3
```

Never reuse a key that appeared in chat, documentation or source control. SMTP
(`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`) is a fallback; Resend wins
when both are configured.

## 4. Messages to send and receive

Send each to a real inbox you control, then open it and check the headers and
links. Record the provider message id.

| # | Message | Trigger | Must arrive | Link/action must work |
|---|---|---|---|---|
| E1 | Verify email | Register a new account | Yes | Verification link signs in/verifies once |
| E2 | Password reset | Request reset | Yes | Single-use link, expiry enforced |
| E3 | Order confirmation | Pay in test mode | Yes | Order number and totals correct |
| E4 | Cancellation | Cancel before dispatch | Yes | Refund timeline stated, no false instant-refund claim |
| E5 | Return decision | Approve/reject a return | Yes | Decision and next step clear |
| E6 | Refund completed | Complete a refund | Yes | Amount and provider reference timeline accurate |
| E7 | Seller decision | Approve/reject a seller application | Yes | Correct next onboarding step |
| E8 | Admin notification | New order/application | Yes | Goes to a monitored admin inbox |

## 5. Verify delivery records

```sql
SELECT id, type, status, provider_message_id, attempts, created_at
  FROM notifications ORDER BY created_at DESC LIMIT 20;
```

Require `status = 'sent'` with a provider message id for each message above.
`skipped` means no provider is configured; `failed` means the provider rejected
it or the request errored.

Retry behaviour:

```bash
npm run email:retry                 # dry run, queue counts only
npm run email:retry -- --send --limit 5
```

Force one failure (for example a deliberately wrong key on staging), confirm the
notification is recorded `failed` with a sanitised error, restore the key, then
run the retry and confirm it becomes `sent`. Never paste the provider error
payload containing secrets into a ticket.

## 6. Launch gate

- SPF, DKIM and DMARC pass on a real received message.
- Every mailbox is monitored by a named person.
- E1–E8 delivered and their links exercised.
- `npm run email:retry` works and does not leak secrets.
- `docs/LAUNCH_CHECKLIST.md` section B email rows are ticked with evidence.

DNS changes require the domain owner's approval; record who changed which record
and when.
