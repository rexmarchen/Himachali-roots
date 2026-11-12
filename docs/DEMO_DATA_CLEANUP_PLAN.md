# Demo data cleanup plan

Status: **AUDIT TOOL READY — NOTHING DELETED**. Deletion requires an explicit
approval gate from the product owner after the read-only audit is reviewed.

## Why this exists

The seed creates demonstration sellers, products and orders so the storefront can
be developed offline. Some of it must never appear on a real marketplace:
`(demo)` seller names, `.test` emails, `is_demo = 1` products and orders, ₹1 test
listings and placeholder imagery. The audit is read-only; it cannot write or
migrate.

## Step 1 — read-only audit (safe to run on production)

```bash
cd /opt/pahadi-roots
sudo -u pahadi npm run audit:demo-data
# or point at the live database explicitly:
sudo -u pahadi npm run audit:demo-data -- /var/lib/pahadi-roots/dearhills.db
```

The script prints JSON lines with counts, record ids and image URL **hosts** only.
It never prints email addresses, names, phone numbers or bank details, and it
never deletes anything. Add `--strict` to make the command exit 1 when anything
actionable is found (useful in a pre-launch gate).

### What it checks

| Check | Meaning |
|---|---|
| `sellers.demo-named` | `business_name` contains `demo` or the slug contains `demo` |
| `sellers.placeholder-email-patterns` | `.test`, `@example.*` or plus-addressed seller emails |
| `products.demo-or-test` | `is_demo = 1`, `price_paise = 100`, or a name containing test/demo/sample |
| `product_images.hosts` | third-party hosts such as Wikimedia, Unsplash or placeholder services |
| `orders.demo` | `is_demo = 1` orders versus orders that look real (`is_demo = 0`) |
| `reviews.total` / sample wording | seeded or fabricated review text |
| `users.placeholder-email-patterns` | non-seller accounts on placeholder domains |

### Local rehearsal result (LOCAL-TEST, development database only)

Run on 11 November 2026 against `data/pahadi-roots.db`:

| Finding | Count |
|---|---|
| Sellers | 5, all `(demo)` named with `.test` emails |
| Products | 27, all `is_demo = 1` |
| ₹1 test products | 0 |
| Product images | 27, all same-origin relative paths (no Wikimedia hosts) |
| Orders | 5, all `is_demo = 1`; 0 real-looking |
| Reviews | 0 |
| Placeholder user emails | 10 |

This describes the **local dev database**, not production. Production numbers
are unknown until the audit runs there. Do not treat this table as a production
finding.

Note on the schema default: `products.is_demo` and `orders.is_demo` default to 1
for raw SQL inserts. Application writes set products to 0 and derive order
`is_demo` from the lines and payment mode, so `is_demo = 1` reliably identifies
seed/simulated records in a normally-run system. Any record inserted by hand with
raw SQL must be reviewed manually.

## Step 2 — present findings and get approval

Bring the audit output to the owner. The approval message must state:

1. exact row counts per table to be removed;
2. whether any order with a real payment reference is in scope (it must not be
   silently deleted — refund/accounting handling is a separate decision);
3. the backup file name and its `npm run db:verify` result;
4. the maintenance window;
5. the rollback: restore the verified pre-cleanup backup.

Do not delete a seller, product or order that has a real payment, refund,
settlement or GST implication without a written accounting decision.

## Step 3 — backup before any change

```bash
sudo -u pahadi npm run db:backup -- "$DATABASE_PATH" /opt/pahadi-roots/backups
sudo -u pahadi npm run db:verify -- /opt/pahadi-roots/backups/<timestamp>.db
```

Require `integrity_check = ok`, zero foreign-key violations and
`schema_migrations` ending at 13. Stop if the backup fails.

## Step 4 — deletion order (reviewed script only)

Foreign keys are enforced, so a single `DELETE FROM seller_profiles` will fail.
Remove dependants first, inside one transaction, after counting each table in the
same transaction and aborting if a count differs from the approved plan:

1. review/cart/wishlist rows referencing demo products or demo users;
2. refunds, returns, cancellations, shipments and shipment events for demo orders;
3. settlement items and settlement batches for demo sellers;
4. ledger entries (`sale`, `commission`, `refund`, `adjustment`, `settlement`);
5. payments and payment events for demo orders;
6. order items, seller orders, order events, demo orders;
7. product images, inventory movements, inventory, demo products;
8. seller documents, application events, seller applications, seller notifications;
9. demo seller profiles;
10. demo users (`profiles`, `user_roles`, sessions, auth identities, tokens cascade);
11. demo categories only if no real product references them.

Do not run ad-hoc `DELETE` statements from a terminal. Put them in a reviewed
script under version control, run it with `--dry-run` first, and keep the output.

## Step 5 — content and seller re-verification

Data deletion is not enough. After cleanup:

- Replace every placeholder or externally hosted image with an owned or licensed
  asset and update `/credits` to match what is actually served.
- Re-verify every real seller's identity, bank/UPI details, GSTIN/FSSAI where
  applicable, and payout status. Settlements now require
  `payout_status = 'verified'`; use `npm run report:payouts` to find sellers with
  eligible money behind an unverified profile.
- Re-check every listing's origin, materials, stock, tax rate and claims. Remove
  any badge that has no documentary evidence (see
  [LEGAL_LAUNCH_REGISTER.md](LEGAL_LAUNCH_REGISTER.md)).
- Confirm no review, rating, sales count or "best-seller" claim was invented.
- Re-run the audit; require zero actionable findings before launch.

## Step 6 — post-cleanup proof

Record all of:

```bash
sudo -u pahadi npm run audit:demo-data -- --strict
sudo -u pahadi npm run report:payouts
curl -fsS https://www.dearhills.in/api/health/ready
```

`audit:demo-data --strict` must exit 0 and `report:payouts` must show zero
critical findings. Keep the output with the launch record. Do not claim "demo
data removed" from a local run.
