# Launch and compliance checklist

This is an operational checklist for taking PAHADI ROOTS from a tested build to a live marketplace. It is **not legal, tax or accounting advice**. Indian marketplace obligations depend on the entity, turnover, product categories and how payments/fulfilment are structured. Have a lawyer and a chartered accountant review the final model.

Nothing below should be assumed complete merely because the software supports it. Tick an item only when a named person has verified the evidence.

## A. Business, tax and legal

- [ ] Legal entity formed; registered name, address, CIN/LLPIN and beneficial ownership confirmed.
- [ ] Marketplace terms, seller agreement, commission schedule and payout terms reviewed by counsel.
- [ ] Consumer-facing terms, privacy notice, cookie notice, shipping policy, returns/refund policy and authenticity policy reviewed and dated. The repository policies are marked **draft**.
- [ ] Grievance officer named with a monitored email, phone and postal address; complaint acknowledgement/resolution timelines documented.
- [ ] GST registration and place-of-supply treatment confirmed. Determine who invoices the customer, how marketplace commission is invoiced, and whether the operator is liable for TCS.
- [ ] Income-tax TDS/TCS obligations for marketplace transactions assessed with a CA.
- [ ] `tax_rate_bp` populated per product/category after HSN/SAC review. The current default is 0, so no GST component is currently calculated correctly.
- [ ] Tax invoice generation, numbering, credit notes and statutory record retention implemented/configured. **The current build does not generate GST invoices.**
- [ ] Legal Metrology packaged-commodity declarations checked: MRP, net quantity, month/year of packing, manufacturer/packer/importer details, consumer-care contact.
- [ ] FSSAI licences/registrations verified for food sellers; ingredient, allergen, shelf-life and storage declarations reviewed.
- [ ] Seller KYC and business verification process defined, including beneficial ownership, bank account verification and periodic re-verification.
- [ ] Product restrictions reviewed: no wildlife/forest produce requiring permits, no restricted medicines, no prohibited weapons, no unsupported therapeutic claims.
- [ ] Origin, GI, organic, handmade and certification claims have documentary evidence. The software must not display a badge without it.
- [ ] Payment aggregator onboarding complete for the actual business entity and marketplace model.
- [ ] DPDP Act notice, consent, purpose limitation, retention, erasure and breach-response process reviewed. Data processing agreements with vendors in place.
- [ ] Insurance (cyber, professional indemnity, product liability as applicable) considered.
- [ ] Intellectual property for the name/logo cleared; contributor/photography licences documented.

## B. Accounts and secrets

- [ ] Production domain and TLS active.
- [ ] Razorpay live keys and webhook secret in the production secret store.
- [ ] Google OAuth Web client created with only the real production JavaScript origin (and localhost for development); `GOOGLE_CLIENT_ID` set in production. No client secret is used by this flow.
- [ ] Razorpay webhook configured to `https://<domain>/api/webhooks/razorpay` with payment and refund events enabled.
- [ ] SMTP/transactional email provider configured with SPF, DKIM and DMARC; `EMAIL_FROM` is an authorised identity.
- [ ] Courier accounts and pickup addresses operational. Understand that shipping is manual; no Shiprocket adapter exists.
- [ ] Separate production and staging environments and credentials.
- [ ] Administrator accounts are individual, named and have unique strong passwords. **MFA is not implemented**; compensate with restricted access, short session review, audit monitoring and network controls until MFA is added.
- [ ] `.env` permissions restricted; no secrets in the repository, screenshots, tickets or logs.
- [ ] Backup destination, encryption key ownership and restore runbook agreed.
- [ ] Error/log aggregation selected. `SENTRY_DSN` is not wired in the current build.

## C. Catalogue and content

- [ ] Demo seed is **not** present in production. Confirm no `(demo)` sellers, `.test` emails or `is_demo` products.
- [ ] Production category taxonomy created and reviewed under **Admin → Categories**. Do not seed demo categories into production.
- [ ] Every seller application, identity document and registration reviewed and recorded.
- [ ] Every product reviewed for accurate title, materials, dimensions, ingredients, allergens, care, origin and stock.
- [ ] Commission rules reviewed by seller/category. Sellers understand the basis (product value after discount, excluding shipping and tax).
- [ ] Shipping thresholds, flat fee and remote-PIN handling confirmed against actual courier costs.
- [ ] Product photography is original or properly licensed; `/credits` updated and placeholder Wikimedia images removed.
- [ ] Descriptions contain no invented reviews, statistics, certifications, awards, sales counts or "best-seller" claims.
- [ ] Seasonal campaign(s) reviewed: real start/end dates, approved eligible products only, each promotional price below its current base price, savings within the campaign cap, and a poster that is owned or licensed. Confirm the advertised "up to X%" matches the eligible products.
- [ ] Campaign status checked on launch day. Draft and archived campaigns must not be publicly reachable; a live campaign must not share a product with another live or scheduled campaign.
- [ ] Announcement bar, homepage, about, sourcing and FAQ edited for the real business; bracketed placeholders removed.
- [ ] Contact details and support hours are monitored.
- [ ] Legal pages no longer say "Draft — legal review pending" and contain the real entity, address, GSTIN and grievance officer.
- [ ] Accessibility, spelling and mobile layout checked on real devices.

## D. Technical release

- [ ] `npm run check` passes on the exact release commit.
- [ ] Production build starts with `NODE_ENV=production` and no development helper flags.
- [ ] `APP_URL` is `https://www.dearhills.in` and `TRUST_PROXY=1` is set behind the reverse proxy.
- [ ] DNS points `www.dearhills.in` at the Express host (not Vercel), the apex redirects to `https://www.dearhills.in`, and the old static Vercel domain has been detached.
- [ ] `/api/health/live` and `/api/health/ready` return 200 at `https://www.dearhills.in`; readiness reports `database: up` and `schema: current`.
- [ ] Session cookie observed over HTTPS with `HttpOnly`, `Secure`, the intended `SameSite`, and an idle/absolute expiry. Logout invalidates the server session.
- [ ] Password login, Google sign-in, explicit Google linking and unlink were tested with real accounts. No account merged on email alone.
- [ ] `GOOGLE_CLIENT_ID` has `https://www.dearhills.in` in its authorised JavaScript origins. No client secret is present in the browser bundle.
- [ ] `ALLOWED_ORIGINS` is empty for the recommended same-origin deployment; if split, HTTPS and `SESSION_COOKIE_SAMESITE=none` were deliberately configured and tested.
- [ ] CSP permits Razorpay Checkout and Google Identity Services but nothing unnecessary; browser console is clean.
- [ ] Production database path and upload paths are persistent and owned by the service user.
- [ ] Private seller documents are not reachable under `/uploads` or any static route.
- [ ] Upload limits and magic-byte validation remain enabled.
- [ ] Reverse proxy request-body limit is at least 6 MB and no larger than necessary.
- [ ] Rate limiting behaviour tested; note it is in-process and not suitable for multiple app instances without a shared store.
- [ ] Database schema/migrations applied with a backup taken first; no down migration is available.
- [ ] Backups run on schedule and a full restore has been tested on a separate host.
- [ ] Disk, memory and process supervision alerts configured.
- [ ] Admin audit log reviewed for test actions and the log is retained appropriately.

## E. Payments and money

- [ ] A real Razorpay test-mode payment succeeds, appears once, and moves the seller order to `pending`.
- [ ] A duplicate webhook does not double-apply payment or ledger entries.
- [ ] A failed payment is represented correctly and stock is released on expiry.
- [ ] An amount-mismatch webhook is recorded and does **not** mark the order paid.
- [ ] A full refund through the provider records the provider reference and posts correct ledger reversals.
- [ ] A cancellation before dispatch releases stock and creates the correct refund obligation.
- [ ] A post-delivery return produces a proportionate commission reversal.
- [ ] Settlement arithmetic reconciles to paid seller orders minus refunds/adjustments and commission.
- [ ] Manual bank/UPI payout reference is mandatory and recorded before status `paid`.
- [ ] No automated payout is advertised. If Razorpay Route or another payout rail is added, complete separate provider onboarding and reconciliation tests.
- [ ] Reconciliation owner and daily/weekly cadence assigned.

## F. Orders, support and operations

- [ ] Seller dispatch SLA (currently stated as two working days) is realistic for every seller.
- [ ] Packing, labelling, pickups, lost-parcel and RTO procedures documented.
- [ ] Customer support macros and escalation path cover cancellation, return, damage, missing parcel and payment failure.
- [ ] Refund authority, limits and dual control defined. One person should not be able to create and pay a settlement without review.
- [ ] Seller suspension/offboarding process and outstanding-settlement handling defined.
- [ ] Inventory reconciliation procedure exists for offline sales.
- [ ] Data retention and deletion process for accounts, KYC documents and order records is documented and lawful.
- [ ] Incident response: who revokes sessions, rotates keys, takes the site down and communicates a breach.
- [ ] Business continuity: who restores backups, who contacts customers, and how orders are processed during an outage.

## G. Pre-launch test script

Run this against staging with real provider test credentials:

1. Register a new customer; verify email; log out and back in. Sign in with Google as a new user; sign out and sign in again; confirm an existing password account is not merged without its password.
2. Browse/search/filter; view a seller and product; add to cart; apply a valid and invalid coupon.
3. Complete checkout; confirm server-calculated totals and stock reservation.
4. With an active campaign: confirm the offer page and homepage banner, add an eligible product to the cart, and verify that cart and checkout show the promotional unit price plus the original price. Change or archive the campaign and confirm the open cart reprices.
5. Pay successfully; confirm one payment record, one set of ledger entries and correct seller order.
6. As seller: confirm, pack, ship with tracking, add an in-transit event, deliver.
7. As customer: request a return with a reason; as admin: approve; as admin: refund and record the provider reference.
8. As admin: create a settlement, verify the arithmetic, record a bank/UPI reference and mark paid.
9. Test cancellation before dispatch and confirm stock release.
10. Upload a disguised non-image and confirm rejection; upload a valid image and confirm display.
11. Confirm a customer cannot open another customer's order or a seller document; confirm a seller cannot touch another seller's order.
12. Confirm admin pages are inaccessible to customer/seller roles at the API level, not just the UI.
13. Restore a database backup on a clean host and verify login, catalogue and an order.

## H. Launch day and after

- [ ] Freeze catalogue changes during final verification.
- [ ] Take a fresh backup immediately before switching traffic.
- [ ] Confirm monitoring, on-call and rollback owner.
- [ ] Place a controlled real order and refund it end to end.
- [ ] Announce only what is actually live; do not claim instant payouts, certifications or nationwide same-day delivery.
- [ ] Review the first 24 hours of errors, payment events, failed emails, stock reservations and support contacts.
- [ ] Reconcile the first settlement manually before scaling seller onboarding.
