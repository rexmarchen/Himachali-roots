# Payment and refund test matrix (Razorpay)

Status: **NOT EXECUTED**. Every row requires Razorpay **test-mode** keys, a
staging database and a publicly reachable staging webhook. Never run this against
live keys and never use a real customer card.

Evidence rule: a row is complete only when you record the provider dashboard
reference, the API response, the `payment_events` / `refunds` / ledger rows and
the resulting order status. A local unit test is not evidence for this matrix.

## Preconditions

- `NODE_ENV=production`-like staging build, staging `DATABASE_PATH`, fresh backup.
- `TEST_RAZORPAY_KEY_ID` and `TEST_RAZORPAY_KEY_SECRET` (or the staging secret
  store's test keys). Confirm `/api/config` reports `mode: "test"`.
- `RAZORPAY_WEBHOOK_SECRET` set; endpoint `https://<staging-host>/api/webhooks/razorpay`
  registered for `payment.captured`, `payment.failed`, `refund.processed`,
  `refund.failed`.
- `ALLOW_DEV_PAYMENTS` and `SIMULATED_CHECKOUT_ENABLED` **unset**.
- A staging seller with verified payout details and at least one approved product.
- A staging administrator, MFA enrolled, for refund/settlement steps.

## Matrix

| # | Scenario | Action | Expected evidence | Fails if |
|---|---|---|---|---|
| P1 | Successful payment | Complete checkout with a test card | One `orders` row `paid` with `paid_at`; exactly one `payments` row; one `payment_events` capture row; seller order `pending`; ledger `sale`/`commission` posted once | Two payment rows, order stays pending, commission missing |
| P2 | Duplicate webhook | Replay the captured event body and signature | No second `payment_events` apply, no second ledger set, order unchanged | Any double credit |
| P3 | Amount mismatch | Send/craft an event with a different amount | Event recorded, mismatch audit (for example `payment.amount_mismatch`), order **not** paid | Order flips paid |
| P4 | Order mismatch | Event references another order id | Rejected/recorded, no order paid | Wrong order paid |
| P5 | Currency mismatch | Event currency not INR | Rejected/recorded, order not paid | Order paid |
| P6 | Non-captured payment | Authorised-only or failed payment | Order stays `pending_payment`/fails cleanly; no ledger | Order paid on authorisation |
| P7 | Failed payment | Use Razorpay's failure test card | Payment record failed; stock released when the reservation expires; no seller order payment | Stock stuck or order paid |
| P8 | Full refund | Admin refunds the full amount | Provider refund id stored on `refunds`; ledger reversal to zero net; order/seller order `refunded`; audit `refund.completed` | Missing provider reference, wrong ledger |
| P9 | Partial refund | Refund part of one line | Proportional reversal; commission reversed proportionally; remaining balance correct | Full reversal or no reversal |
| P10 | Cancel before dispatch | Customer/admin cancels a paid order | Stock released; refund obligation recorded; no dispatch state | Stock not released |
| P11 | Post-delivery return | Approve a return, then refund | Proportionate commission reversal; return and refund linked | Commission not reversed |
| P12 | Unverified seller settlement | Try to create and pay a batch | HTTP 409 for both; no batch/payment | Batch created or paid |
| P13 | Held seller settlement | Place a hold, retry | HTTP 409; release restores the pre-hold status | Hold bypassed |
| P14 | Settlement arithmetic | Create a batch from eligible entries | `net = gross − commission − refunds + adjustments`; recompute from ledger rows matches; then record a real test bank/UPI reference and mark paid | Mismatch accepted |
| P15 | Paid without reference | Attempt to mark paid with an empty reference | HTTP 400; status unchanged | Paid with no reference |

## How to inspect

Use read-only queries against the staging database:

```sql
SELECT id, status, paid_at FROM orders ORDER BY created_at DESC LIMIT 5;
SELECT id, order_id, provider_payment_id, amount_paise, status FROM payments ORDER BY created_at DESC LIMIT 5;
SELECT id, order_id, action, created_at FROM payment_events ORDER BY created_at DESC LIMIT 10;
SELECT id, status, provider_refund_id, amount_paise FROM refunds ORDER BY created_at DESC LIMIT 5;
SELECT seller_id, type, amount_paise, status, reference FROM seller_ledger_entries ORDER BY created_at DESC LIMIT 20;
SELECT id, gross_paise, commission_paise, refunds_paise, adjustments_paise, net_paise, provider_reference FROM settlement_batches ORDER BY created_at DESC LIMIT 5;
```

Then run `npm run report:payouts` and require zero critical findings.

## Evidence record

Append one row per run. Never include card numbers, UPI ids or full bank details.

| Date | Case | Provider reference | Result | Evidence location | Run by |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

## After the matrix

1. Reverse or refund every test transaction so no test money remains outstanding.
2. Keep the staging database and webhook endpoint until launch.
3. Only then ask for approval to configure live keys. Live keys are a separate
   approval gate; completing this matrix does not authorise live payments.
4. Record the reconciliation owner and daily cadence in
   [PAYOUT_OPERATIONS.md](PAYOUT_OPERATIONS.md).
