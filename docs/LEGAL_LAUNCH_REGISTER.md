# Legal, tax and grievance launch register

Status: **BLOCKING LAUNCH** for every row below.

This register exists so no legal, tax or grievance gate can be overlooked in a
technical release. Software cannot satisfy any item here. Each row stays
`BLOCKING LAUNCH` until a **named human** supplies the evidence described and
records the date. Do not remove the draft banners in the public legal pages, and
do not publish placeholder entity details, GSTINs or officer names to make the
site look finished.

Owner column is intentionally `UNASSIGNED`. An item without a named owner is
not in progress.

| # | Gate | Owner | Status | Evidence required to close |
|---|---|---|---|---|
| L1 | Legal entity, registered address and CIN/LLPIN | UNASSIGNED | BLOCKING LAUNCH | Certificate of incorporation / LLP deed; registered address matching the site footer and invoices |
| L2 | GST registration and GSTIN | UNASSIGNED | BLOCKING LAUNCH | GST certificate; GSTIN printed on the site, invoices and seller commission invoices |
| L3 | Marketplace terms of use reviewed by counsel | UNASSIGNED | BLOCKING LAUNCH | Counsel sign-off naming the reviewed version and date; repository policy loses the "draft" marker |
| L4 | Privacy notice and DPDP notice/consent | UNASSIGNED | BLOCKING LAUNCH | Counsel-reviewed notice, lawful-basis mapping, consent capture points, retention schedule, erasure process, breach-response owner |
| L5 | Seller agreement, commission schedule and payout terms | UNASSIGNED | BLOCKING LAUNCH | Counsel-reviewed agreement; commission basis matches `commissionBasisNote` (product value after discounts, excluding shipping and tax); payout timing and hold rights stated |
| L6 | Consumer terms: shipping, returns, refunds, authenticity | UNASSIGNED | BLOCKING LAUNCH | Counsel-reviewed pages with real timelines and refund method; no invented guarantees |
| L7 | Grievance officer and complaint timelines | UNASSIGNED | BLOCKING LAUNCH | Named officer, monitored email, phone, postal address; acknowledgement and resolution SLAs; complaint log owner |
| L8 | GST rates, HSN/SAC, place of supply | UNASSIGNED | BLOCKING LAUNCH | CA-approved rate map per category; `tax_rate_bp` and `hsn_code` populated before any real price is published (current default is 0) |
| L9 | TCS/TDS obligations for marketplace transactions | UNASSIGNED | BLOCKING LAUNCH | CA opinion on applicability, rates, filing cadence and who remits |
| L10 | GST tax invoice and credit-note capability | UNASSIGNED | BLOCKING LAUNCH | Either statutory invoice generation inside the platform, or a named external billing system with matching numbering and retention. **The current build does not generate GST invoices.** |
| L11 | Legal Metrology packaged-commodity declarations | UNASSIGNED | BLOCKING LAUNCH | MRP, net quantity, month/year of packing, packer/manufacturer details and consumer-care contact verified on listings |
| L12 | FSSAI licences for food sellers | UNASSIGNED | BLOCKING LAUNCH | Licence numbers verified against the FSSAI registry; ingredient, allergen, shelf-life and storage declarations reviewed |
| L13 | Origin, GI, organic and handmade claim evidence | UNASSIGNED | BLOCKING LAUNCH | Documentary evidence per claim; badges removed where evidence is missing |
| L14 | Payment aggregator onboarding for the actual entity | UNASSIGNED | BLOCKING LAUNCH | Razorpay merchant onboarding under the legal entity for the marketplace model, plus written confirmation that the live account may accept customer payments |
| L15 | Photography, logo and IP licences | UNASSIGNED | BLOCKING LAUNCH | Contributor releases / licences; `/credits` matches the assets actually served; Wikimedia placeholders removed |
| L16 | Insurance and incident-response ownership | UNASSIGNED | BLOCKING LAUNCH | Cyber / professional indemnity decision recorded; named incident commander and breach-notification route |
| L17 | Data processing agreements with vendors | UNASSIGNED | BLOCKING LAUNCH | DPAs with hosting, payment, email and error-tracking providers; cross-border storage decision recorded |

## Release rule

A technical release may be deployed while this register is open **only** with the
public site kept in its pre-launch state (no real customer payments, no published
placeholder legal text). The `/api/config` response already reports
`legalReviewRequired: true`; do not remove that signal or the draft banners until
the rows above are closed.

## Sign-off record

Append one line per closed gate. Do not edit history.

| Date | Gate | Closed by (name) | Evidence location |
|---|---|---|---|
| — | — | — | — |
