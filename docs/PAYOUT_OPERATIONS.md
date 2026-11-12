# Payout and settlement operations

Payouts are **manual**. The platform calculates what is owed and records the
bank/UPI reference afterwards. It never moves money and never claims instant or
automatic settlement.

## Preconditions enforced in code

A settlement batch cannot be created or paid unless all of the following hold.
These are server-side gates, not UI hints.

| Gate | Behaviour |
|---|---|
| Payout details on file | Seller must have submitted bank/UPI details |
| Admin verification | `payout_status = 'verified'`. `not_started`, `pending_configuration`, `pending_verification` and `blocked` all refuse with 409 |
| Active hold | `blocked` plus `payout_status_before_hold` refuses; releasing the hold restores the exact pre-hold status |
| Ledger entries | Only `eligible` entries without a settlement can be included |
| Bank/UPI reference | Required before status becomes `paid`; an empty or very short reference is rejected |
| Hold at payment time | A hold placed after batch creation still blocks payment |

Marking a settlement paid without a real transfer is a data-integrity and
accounting failure, not a cosmetic one. Never do it to clear a queue.

## Read-only verification report

```bash
sudo -u pahadi npm run report:payouts
```

Exit codes: `0` clean, `1` non-critical findings with `--strict`, `2` critical.
It opens the database read-only and prints ids, statuses and amounts — never bank
account numbers, IFSC, UPI ids, names or emails.

Checks performed:

- `payout_status` distribution;
- sellers with payout details on file but not verified (**critical**: their money
  is blocked);
- sellers marked verified with no payout details (**critical**);
- sellers holding eligible un-settled money while unverified (warning);
- paid settlements with a missing/implausible reference (**critical**);
- paid settlements without `paid_at` (**critical**);
- settlement arithmetic `net = gross − commission − refunds + adjustments`
  (**critical** on mismatch);
- paid settlements where the `settlement.paid` audit actor is the creator
  (warning: dual control not evidenced);
- paid settlements with no `settlement.paid` audit row (**critical**);
- ledger rows marked `settled` with no batch (**critical**).

## Verification workflow (admin)

1. Seller submits details in **Seller → Payout details**. Values are masked in
   the UI after submission.
2. Admin opens **Admin → Sellers → payout review**. Compare the account
   name/number/IFSC or UPI id against documentary evidence supplied out of band.
   Never verify against a screenshot alone.
3. Choose **Verify** only when the details match the seller's legal identity.
   Use **Hold** with a reason when something is wrong; use **Release** only after
   the issue is resolved. Release restores the pre-hold status.
4. Record who verified and when. The audit log is the evidence.

## Settlement procedure

1. Run `npm run report:payouts` and confirm zero critical findings.
2. Create the batch for one seller and period. Read
   `gross − commission − refunds + adjustments = net` from the batch, then
   recompute it from the included ledger entries. Stop on any mismatch.
3. Make the actual bank/UPI transfer from the business account, outside the
   application.
4. Record the real transfer reference (UTR / UPI reference) and mark paid.
5. File the bank statement line with the batch. The report will now show the
   batch as paid with a reference.
6. Re-run `npm run report:payouts`; it must stay at zero critical findings.

**Dual control:** the person who creates a settlement should not be the person
who records payment. The schema records `created_by` and the audit log records
the paying actor; the report flags same-actor payments. A flag is a prompt for
review, not proof of misconduct.

## Daily reconciliation

| Step | Cadence | Owner |
|---|---|---|
| `npm run report:payouts` and review criticals | Daily before payouts | UNASSIGNED |
| Match paid batches to bank/UPI statement lines | Daily | UNASSIGNED |
| Confirm no seller has eligible money while unverified | Weekly | UNASSIGNED |
| Confirm provider payment and refund references reconcile | Daily | UNASSIGNED |
| Review same-actor settlement flags | Weekly | UNASSIGNED |

Assign real names before launch. An unowned reconciliation is an unowned money
risk.

## Administrator MFA and recovery

- Every administrator enrols TOTP from **Account → Profile & security**. The
  admin console shows a banner until the account enrols; a clear banner is the
  only acceptable state before launch.
- A lost authenticator is recovered with shell access only:

  ```bash
  sudo -u pahadi npm run mfa:reset -- admin@example.com
  ```

  This clears the secret and disables MFA for that account. It is not a web
  endpoint, and the operator must verify the requester's identity out of band.
  Re-enrol immediately and record the reset in the launch log.
- Do not disable the MFA challenge to unblock a user. Do not share TOTP seeds.

## Re-verification before launch

Because settlement creation now requires `payout_status = 'verified'`, every
existing seller with bank details must be re-checked. Until then their eligible
money is visible but unpayable — by design. Do not lower the gate to clear the
backlog; complete the verification instead.
