# Seller guide

This guide describes the seller workflow implemented in the current development build. It is written for a seller using the web workspace, not for developers.

> **Reality check:** commission, ledger and settlement logic is real, but payouts are recorded manually by the marketplace team. No automated payout provider is connected. Demo sellers exist only to exercise the software.

## 1. Apply to sell

Open **Become a Maker** (`/sell`). If you are not signed in you can create an account there; your draft application is tied to that account.

The application has ten steps and saves as you go. You can leave and return; the server restores the last saved step, and the URL `?step=` lets you resume a specific step.

1. **Account and email verification.** You must confirm your email before the final submission. Mobile verification is not connected in this build.
2. **Seller category.** Choose the description that fits you: farmer/grower, artisan/craftsperson, food producer, home business, local brand or retailer. Questions and evidence requirements change with this choice.
3. **Personal and shop profile.** Your name, phone number, shop or maker name, a short tagline and your story. The story must be at least 80 characters.
4. **Location and dispatch.** District, village/town, operating address and, separately, where orders are dispatched from.
5. **Products and origin.** Shop categories, product groups, what you make and an origin/authenticity narrative. You declare that the information is accurate.
6. **Identity, business and category evidence.** Upload the documents your category needs. Food producers must provide an FSSAI number and FSSAI evidence. GSTIN, incorporation, trademark and similar documents are only requested where they apply; they are not blanket demands.
7. **Shipping and packaging.** Your dispatch window (1–15 days), how you pack, whether you ship across India and any cold-chain requirements.
8. **Payout preference.** Bank transfer or UPI, account-holder name and masked account details. **No payout provider is connected.** The marketplace team settles manually after delivery and the return window; this step records preferences, not an automated payout mandate.
9. **Agreements and commission disclosure.** Review the current seller terms, authenticity policy, privacy notice and the commission basis. The version you accept is recorded with your application.
10. **Review and submit.** Check every section and submit. Incomplete applications are rejected with the exact fields to fix; submission is server-authoritative and duplicate submits are deduplicated.

### Application and store status

Application status and store status are separate:

- Application: `draft`, `submitted`, `under_review`, `changes_requested`, `approved`, `rejected`, `suspended`.
- Store: `setup_incomplete`, `pending_activation`, `active`, `suspended`.

Only an approved application activates the store and allows products to be published. If a reviewer requests changes, read the reason in **Seller → Application & verification**, update the application and resubmit; the revision number increases and the earlier history is kept. Rejection and suspension also carry a reason. You cannot edit or resubmit while an application is under review or already approved.

### Private documents

Accepted document types include ID proof, address proof, business registration, GST certificate, FSSAI, craft evidence, land records and cooperative registration, depending on your category and structure. Upload a PDF, JPEG or PNG up to 5 MB. Files are checked by extension, MIME type and file signature. They are stored outside the public image directory and can be opened only by you or an administrator; administrator access is audited.

Do not upload a document that belongs to someone else. Do not put Aadhaar numbers, bank passwords or unnecessary personal data in public product copy.

## 2. Set up your store profile

From **Seller → Store profile**, maintain:

- public business name, tagline and story;
- region, village, operating and pickup addresses;
- contact email/phone;
- GSTIN and registrations;
- bank/UPI settlement details used by the marketplace team.

Keep bank details accurate. A settlement cannot be paid without a valid reference recorded by the administrator; incomplete details delay payouts.

## 3. Add a product

Go to **Seller → Products → New product**.

### Product fields

- **Name and slug** — customer-facing name; the slug becomes the public URL.
- **Category** — choose from the marketplace taxonomy. A listing cannot be submitted without a category.
- **Short description** — the summary shown in listings.
- **Full description** — at least 80 characters at submission. Be specific about materials, dimensions, care, ingredients and what the buyer receives.
- **Price** — entered as rupees in the form and stored as integer paise. Prices are GST-inclusive in this build; tax configuration is pending.
- **Compare-at price** — optional. Do not invent a permanent "original" price.
- **SKU** — your internal stock reference. Must be unique.
- **Unit, packed weight and dimensions** — packed weight is required before submission so shipping can be calculated.
- **Materials, care instructions, food information** — complete these honestly. Food listings must state ingredients, allergens, shelf life and storage.
- **Origin place** — only claim a place you can support. The "origin verified" marker is controlled by the marketplace after evidence review.
- **Inventory** — on-hand quantity and a low-stock threshold.

### Images

Upload JPEG, PNG or WebP up to 5 MB. At least one image is required before moderation. Use your own photographs that show the actual product, colour, scale and finish. The development seed uses attributed Wikimedia photographs; they are not suitable for a live listing.

### Submit for review

A listing can be submitted from `draft`, `rejected` or a reviewer-requested change. The server checks:

- description at least 80 characters;
- price greater than zero;
- packed weight present;
- at least one image;
- for food sellers, FSSAI licence number, ingredients and shelf life in the food-compliance section.

Seller-facing workflow statuses are `draft`, `submitted`, `changes_requested`, `published` and `rejected`. While a listing is `submitted` it is read-only. An administrator may approve it (published), reject it with a reason, or request changes; the note appears on the listing. After a change request you can edit the listing and resubmit it. Editing an approved listing or adding an image may return it to moderation - this is intentional.

You can pause an approved listing, resume a paused one, or archive a listing. Archived listings are not sold. You cannot archive a listing while it is with a reviewer. If the marketplace suspends your store, live listings are paused until the store is reinstated.

## 4. Manage inventory

From the product screen, set on-hand quantity. The system will not let you reduce stock below the quantity reserved by paid or in-progress orders. Every change is recorded as an inventory movement.

When an order is paid, stock is reserved. When it ships, both on-hand and reserved quantities are reduced. If payment expires or the order is cancelled before dispatch, the reservation is released.

If you oversell outside the system, correct the stock immediately and contact the marketplace team; do not mark an order shipped if you cannot fulfil it.

## 5. Fulfil orders

Open **Seller → Orders**. A paid order appears as `pending`. The allowed sequence is:

1. **Confirm** — accept the order and prepare it. Status becomes `confirmed`.
2. **Pack** — items are packed. Status becomes `packed`.
3. **Ship** — enter carrier, tracking number and optional tracking URL. Status becomes `shipped`. The customer is notified when email is configured.
4. **Deliver** — record delivery. Status becomes `delivered`, and the sale becomes eligible for the ledger after the 7-day return window.

The server rejects out-of-order transitions and prevents one seller from acting on another seller's order. Do not mark an order delivered before it reaches the customer.

Ship within the promised two working days unless the listing states otherwise. If a delay is unavoidable, contact support and the customer.

### Cancellations

Before dispatch, a customer may request cancellation. Follow the marketplace decision in **Seller → Returns & requests**. Do not ship a cancelled order. After dispatch, cancellation is normally handled as a return instead.

### Returns and refunds

After delivery, a customer may request a return within the policy window. The administrator reviews the request and records the outcome. Approved refunds produce ledger deductions and commission reversals. You do not issue a refund directly through this workspace.

## 6. Understand earnings

The seller dashboard shows sales, commission, estimated earnings and ledger balances.

- Commission is charged on **product value after discounts**, excluding shipping and taxes.
- The default is 15%, but a seller-specific or category rule may apply. The rate used on an order is snapshotted with that order.
- Shipping is retained by the marketplace as logistics revenue; it is not part of seller earnings.
- A paid order creates **pending** ledger entries.
- Delivery makes entries eligible, but they become available after the 7-day return window.
- Approved refunds create proportional negative entries and reverse the related commission.
- Admin adjustments (for example, a goodwill correction) appear in the ledger with a reference.

The dashboard is an operational view, not a tax invoice or a bank statement. Reconcile it with the settlement statement.

## 7. Settlements

Go to **Seller → Earnings** to see ledger entries and settlement batches.

A typical cycle:

1. Delivered earnings pass the return window and become eligible.
2. The marketplace reviews eligible entries and creates a settlement batch.
3. The batch shows gross sales, commission, refunds/adjustments and net payable.
4. The team transfers the amount by bank/UPI.
5. An administrator records the bank/UPI reference and marks the batch paid.

A batch is not "paid" until a reference exists. Bank holidays and review queues can delay payment. If a reference is missing or wrong, raise a support request rather than assuming the money was sent.

This build does **not** integrate Razorpay Route, Stripe Connect or any automated payout service. Do not advertise instant or automatic payouts.

## 8. Notifications and support

**Seller → Returns & requests** shows cancellation/return items relevant to your orders. Transactional email (when SMTP is configured) carries order updates. Without SMTP, notifications are recorded in the database but not emailed; check the workspace and your order list.

For support, use the contact route configured by the marketplace. Include the order number or product reference. Never send passwords or full bank credentials in a support message.

## 9. Rules that protect the marketplace

- List only products you are legally allowed to sell in India.
- No wildlife products, restricted forest produce, therapeutic-medicine claims, prohibited weapons or misdescribed goods.
- Do not use another seller's photographs or copy.
- Do not claim organic, GI, FSSAI, government or "verified origin" status without evidence on file.
- Keep prices, stock and dispatch promises accurate.
- Respond to moderation requests and customer issues promptly.
- Attempting to bypass commission, move a transaction off-platform after introduction, or manipulate reviews is grounds for suspension.

## 10. Development demo login

If you are exploring a seeded development instance, use one of these accounts with `DEMO_SEED_PASSWORD` (default `PahadiDemo!2026`):

```text
kullu@demo.pahadiroots.test
kangra@demo.pahadiroots.test
lahaul@demo.pahadiroots.test
chamba@demo.pahadiroots.test
kinnaur@demo.pahadiroots.test
```

These are `.test` addresses attached to labelled demonstration sellers. They are not real businesses.
