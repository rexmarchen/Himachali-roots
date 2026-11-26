# Pan-Himalayan Technical SEO Architecture, Audit & 90-Day Roadmap

**Brand Configuration:** Read from runtime config (`server/env.ts` -> `BRAND_NAME` / `APP_DOMAIN`, defaulting to `Dear Hills` / `dearhills.in`; exposed to client via `/api/config`).  
**Target Geography (First-Class Regions):** Himachal Pradesh, Uttarakhand (Garhwal & Kumaon), Jammu & Kashmir, Ladakh, Sikkim, Arunachal Pradesh, and Darjeeling & Kalimpong (West Bengal hills).

---

## 1. Step 0 Gap Report (`issue | severity | affected pages | fix`)

| Issue | Severity | Affected Pages / Endpoints | Implemented Fix |
|---|---|---|---|
| Public marketplace schema/copy hardcoded to Himachal Pradesh only; zero entity hubs for Ladakh, Uttarakhand, J&K, Sikkim, Arunachal, or Darjeeling/Kalimpong | **High** | `/`, `/shop`, `/regions/*`, `/sitemap.xml` | Added `regions`, `crafts`, and `slug_redirects` SQLite tables (Migration 15 in `server/db.ts`), seeded 7 regions & 9 crafts in `server/lib/himalayanSeeds.ts`, and built admin CRUD (`/api/admin/regions`, `/api/admin/crafts`). |
| Missing product provenance schema fields (`districtVillage`, `craftType`, `technique`, `giTagged`, `madeToOrder`) & no GI claim gate | **High** | `/shop/:product`, `/seller/products/*`, `/admin/products/*` | Added Pan-Himalayan & GI columns to `products` & `seller_profiles`. Sellers can only submit `giRequested` + `giName` + `giRegistrationRef`; only admin can enable `giTagged`. Prohibited claims (`pure pashmina`, `gi certified`, `organic certified`) block publish/decision without reviewed documentation (`shared/productCompliance.ts`). |
| Risk of thin/empty doorway pages for multi-facet region + craft combinations | **High** | `/regions/:region/:craft` | Enforced strict Anti-Doorway gate in `getRegionCraftCombo` (`server/lib/himalayan.ts`): returns `404` + `noindex` and excludes from `/sitemap.xml` unless `>= 3` real, approved, non-demo products AND `>= 120` words unique intro exist. |
| Brand name hardcoded in several metadata strings and missing international feature switch | **Medium** | `shared/seo.ts`, `server/lib/seo.ts`, `src/pages/*` | Consolidated `BRAND_NAME` / `BRAND_DOMAIN` in `server/env.ts` + `/api/config` (`siteConfig.brand`) and added `FEATURE_INTERNATIONAL` (`env.features.international`). |
| Legacy Himachal shop/blog/category meta titles exceeding 60 chars and descriptions >160 chars | **Medium** | `/`, `/shop`, `/blog`, `/shop/:product` | Added `fitSeoTitle(..., 60)` & `fitSeoDescription(..., 158)` helpers in `shared/seo.ts`; updated SSR meta + client `usePageMeta`. |
| Missing Merchant Center region/craft custom labels and un-redirected legacy slugs | **Medium** | `/feeds/google-merchant.xml`, `/regions/kashmir`, renamed slugs | Added `<g:custom_label_0>` (Region) & `<g:custom_label_1>` (Craft/Category) excluding demo items; added `slug_redirects` 301 middleware in `server/app.ts` + automatic redirect recording when admins edit product slugs. |
| Client-side button pagination & thin Himachal-only blog library (5 posts) | **Medium** | `/shop`, `/blog`, `/guides`, `/makers/:slug` | Converted `Pagination` in `src/components/ui.tsx` into crawlable `<Link>` (`<a>`) links; authored 30 Pan-Himalayan guides (`>= 900` words each) in `shared/guidesData*.ts`; extended `MakerDetailPage` with `craftSpecialty`, `yearsOfPractice`, and `workshopPhotos`. |
| Unverified Google Search Console tag, `Organization.sameAs`, and zero published reviews (`aggregateRating: null`) | **Low / Manual** | Sitewide JSON-LD & Search Console | Verified `Product.aggregateRating` is omitted when `rating_count === 0` (no fabricated ratings); Search Console ownership & external social profiles remain manual owner setup tasks (Section 7). |

---

## 2. Implemented Architecture & Suggested Clean Commit Breakdown

All changes pass TypeScript checking, scoped ESLint, Vitest suites, and production builds. If staging changes into logical commits:

1. **Data Model, Config & Compliance Gates**
   - `server/env.ts`, `server/schema.sql`, `server/db.ts` (Migration 15 `migratePanHimalayanSeo`), `server/lib/himalayanSeeds.ts`, `server/lib/himalayan.ts`, `shared/types.ts`, `shared/seo.ts`, `shared/productCompliance.ts`, `server/lib/productCompliance.ts`
2. **Backend APIs, SSR SEO, Sitemaps & Merchant Feed**
   - `server/app.ts` (`slug_redirects` 301 handler), `server/lib/catalog.ts`, `server/lib/seo.ts`, `server/routes/public.ts`, `server/routes/seller.ts`, `server/routes/admin.ts`
3. **Frontend Hubs, Navigation, Seller/Admin Forms & Crawlable Pagination**
   - `src/pages/HimalayanHubPages.tsx`, `src/App.tsx`, `src/components/PublicLayout.tsx`, `src/components/ui.tsx`, `src/lib/session.tsx`, `src/pages/HomePage.tsx`, `src/pages/ShopPage.tsx`, `src/pages/ProductPage.tsx`, `src/pages/PublicPages.tsx`, `src/pages/SellerPages.tsx`, `src/pages/AdminPages.tsx`
4. **Editorial Content Library (30 Original Guides, 900+ Words Each)**
   - `shared/guides.ts`, `shared/guidesData1.ts`, `shared/guidesData1a.ts`, `shared/guidesData1b.ts`, `shared/guidesData2.ts`, `shared/guidesData2a.ts`, `shared/guidesData2b.ts`, `src/pages/BlogPage.tsx`
5. **Automated SEO & Regression Tests + Documentation**
   - `server/test/pan-himalayan-seo.test.ts`, `server/test/seo.test.ts`, `server/test/migrations.test.ts`, `server/test/storefront.test.ts`, `server/test/helpers.ts`, `docs/PAN_HIMALAYAN_SEO_AUDIT_AND_ROADMAP.md`

---

## 3. Content Inventory: 7 Regions, 9 Crafts & 30 Guides (900+ Words Each)

### Seeded First-Class Regional & Craft Hubs (`server/lib/himalayanSeeds.ts`)
- **Regions (`/regions/:slug`, 150+ word intros + crafts/foods + FAQs):**
  `himachal-pradesh`, `uttarakhand`, `jammu-and-kashmir`, `ladakh`, `sikkim`, `arunachal-pradesh`, `darjeeling-kalimpong`
- **Crafts (`/crafts/:slug`, history + identification guide + FAQs):**
  `pashmina-shawls`, `kullu-kinnauri-shawls`, `himalayan-tea`, `himalayan-honey`, `aipan-art`, `chamba-rumal`, `thangka-painting`, `lepcha-weaving`, `wood-and-walnut-craft`
- **Pillar & Trust Hubs:**
  `/himalayan-handmade-products` (links cleanly to all regions, crafts, categories & GI hub) and `/gi-tagged` (verified GI items only).

### 30 Guides (`/guides/:slug`, `shared/guides.ts`)
Every guide contains **>= 900 words** (verified programmatically), `metaTitle <= 60` chars, `metaDescription <= 160` chars, structured Markdown internal links, and `FAQPage` items. Guides marked **`Fact-Check Required`** carry an on-page editorial verification notice and must be audited against primary GI registry / institutional sources prior to promotion:

| # | Slug | Region / Craft Focus | Fact-Check |
|---|---|---|---|
| 1 | `how-to-identify-real-kashmiri-pashmina-shawl` | J&K / Pashmina | Required (CDI/GI standards) |
| 2 | `changthangi-ladakh-goat-wool-to-loom-journey` | Ladakh / Pashmina | Required (Leh cooperative data) |
| 3 | `kullu-vs-kinnauri-shawls-weaving-motifs-guide` | Himachal / Shawls | Required (GI registration dates) |
| 4 | `how-to-spot-fake-powerloom-kullu-shawls` | Himachal / Shawls | Reviewed |
| 5 | `chamba-rumal-hand-embroidery-heritage-guide` | Himachal / Chamba Rumal | Required (Museum & GI dates) |
| 6 | `kangra-tea-gi-tag-orthodox-brewing-guide` | Himachal / Tea | Required (IN GI & EU PGI dates) |
| 7 | `darjeeling-first-flush-vs-second-flush-muscatel` | Darjeeling / Tea | Required (Tea Board GI scope) |
| 8 | `kalimpong-artisanal-craft-and-cheese-traditions` | Darjeeling-Kalimpong / Food & Crafts | Required (Early 20th-c. dairy lineage) |
| 9 | `uttarakhand-aipan-folk-art-symbols-buying-guide` | Uttarakhand / Aipan Art | Required (Uttarakhand GI date) |
| 10 | `garhwal-vs-kumaon-wool-pankhi-thigma-textiles` | Uttarakhand / Wool & Rugs | Required (Dan / Thigma GI notes) |
| 11 | `sikkim-large-cardamom-temi-tea-organic-farming` | Sikkim / Tea & Spices | Required (2016 organic milestone & GI) |
| 12 | `lepcha-weaving-backstrap-loom-textiles-sikkim` | Sikkim / Lepcha Weaving | Required (Dzongu & Allo craft terms) |
| 13 | `thangka-painting-traditions-sikkim-ladakh-arunachal` | Pan-Himalayan / Thangka | Required (Lineage terminology) |
| 14 | `arunachal-pradesh-apatani-mishmi-adi-handlooms` | Arunachal / Handlooms | Required (Tribal textile GI filings) |
| 15 | `arunachal-cane-bamboo-basketry-buying-guide` | Arunachal / Bamboo Craft | Reviewed |
| 16 | `kashmir-walnut-wood-carving-papier-mache-guide` | J&K / Walnut Wood & Papier-Mache | Required (Kashmir GI numbers) |
| 17 | `kashmir-sozni-ari-kani-embroidery-differences` | J&K / Sozni, Aari & Kani | Required (Sozni vs Kani GI distinctions) |
| 18 | `how-to-check-genuine-raw-himalayan-honey` | Pan-Himalayan / Raw Honey | Reviewed |
| 19 | `why-raw-himalayan-honey-crystallizes-in-winter` | Uttarakhand & Hills / Raw Honey | Reviewed |
| 20 | `ladakh-seabuckthorn-oil-pulp-nutritional-guide` | Ladakh / Seabuckthorn | Required (GI date & claim hygiene) |
| 21 | `kinnaur-spiti-chuli-wild-apricot-kernel-oil` | Himachal & Ladakh / Apricot Oil | Required (Chulli vs Halman GI/safety) |
| 22 | `uttarakhand-munsiari-rajma-high-altitude-pulses` | Uttarakhand / Mountain Pulses | Required (Munsiari/Harshil GI status) |
| 23 | `ladakh-pashmina-wooden-handloom-care-washing-guide` | Ladakh / Wool & Pashmina Care | Reviewed |
| 24 | `what-is-gi-tag-in-india-himalayan-crafts-list` | Pan-Himalayan / GI Registry Guide | Required (Audit all entries on ipindia.gov.in) |
| 25 | `ladakh-wood-carving-copper-apricot-craft-guide` | Ladakh / Wood, Copper & Apricots | Required (Ladakh wood-carving GI) |
| 26 | `himachal-metal-brass-chamba-thal-traditions` | Himachal / Chamba Thal Metalwork | Required (Metalcraft GI filings) |
| 27 | `garhwali-kumaoni-ringaal-bamboo-baskets-guide` | Uttarakhand / Ringaal Bamboo | Required (Ringaal GI registration date) |
| 28 | `sikkim-handmade-lokta-paper-incense-monastery-crafts` | Sikkim & Kalimpong / Lokta & Incense | Reviewed |
| 29 | `ethical-sourcing-himalayan-artisan-cooperatives` | Pan-Himalayan / Cooperatives | Reviewed |
| 30 | `himalayan-gifting-authentic-winter-hamper-guide` | Pan-Himalayan / Gifting | Reviewed |

---

## 4. Technical SEO Feeds, Sitemaps & Indexing Controls

- **`/sitemap.xml`** (`server/routes/public.ts`): Dynamically includes `/`, `/himalayan-handmade-products`, `/shop`, `/gi-tagged`, `/guides`, `/blog`, `/makers`, `/become-a-maker`, `/about`, `/sourcing`, `/contact`, `/faq`, all active regions, all active crafts, **only qualifying `/regions/:region/:craft` combos (>= 3 real non-demo products & >= 120 words)**, non-empty active categories, active non-demo campaigns, non-demo makers, real non-demo approved products with image tags, all `BLOG_POSTS`, and all 30 `HIMALAYAN_GUIDES`.
- **`/robots.txt`**: Explicitly allows public discovery paths (`/`, `/regions/`, `/crafts/`, `/gi-tagged`, `/himalayan-handmade-products`, `/guides/`, `/sellers/`, public read `/api/*` catalog endpoints) and disallows `/admin`, `/cart`, `/checkout`, `/account`, `/seller`, `/login`, `/register`, search/auth endpoints.
- **`/feeds/google-merchant.xml`**: Emits Google Shopping XML containing real approved non-demo products only, including `<g:custom_label_0>` (`region`) and `<g:custom_label_1>` (`craft_type || category_name`), active promotional `<g:sale_price>`, availability, and GTIN/identifier compliance.
- **Noindex Coverage:** Admin, seller workspace, customer account, cart, checkout, demo listings/₹1 test items, and any URL carrying query parameters (`?q=`, `?sort=`, `?page=2`, `?region=`, `?craft=`, `?technique=`, `?giTagged=`, `?minPrice=`, `?maxPrice=`, `?featured=`).

---

## 5. Observed Verification & Performance Benchmarks

- **TypeScript (`npm run typecheck`):** Passed (`tsc` across client, server, and test projects).
- **ESLint (scoped across `server`, `src`, and updated `shared/*` files):** Passed with 0 errors. *(Note: root `npm run lint` reports pre-existing lint issues in `mobile/` React Native `require()` assets and `shared/urls.ts` outside this SEO scope.)*
- **Vitest (`npm test`):** **29 test files passed (29), 273 tests passed (273)**, including `server/test/pan-himalayan-seo.test.ts` (6 suites covering schema/meta hygiene, Anti-Doorway 404 gate, Merchant feed `custom_label` + demo exclusion, promo price schema match, noindex rules, 301 redirects, protected claim enforcement, and 30 guide validation) plus `server/test/seo.test.ts`, `migrations.test.ts`, and `storefront.test.ts`.
- **Production Build (`npm run build`):** Succeeded (`dist/assets/index-BxRq6gxn.js` 303.45 kB / 89.19 kB gzip; code-split `HimalayanHubPages-D8YDP1hT.js` 17.02 kB / 4.43 kB gzip; lazy `BlogPage-o6WQwI4t.js` 310.25 kB / 116.27 kB gzip).
- **Local Production SSR Benchmark** (measured against built `dist-server/server/index.js` on isolated temp DB):
  - `/`: `200`, `13.6 ms` TTFB, `5,625 bytes`
  - `/regions/ladakh`: `200`, `5.3 ms` TTFB, `5,334 bytes`
  - `/crafts/pashmina-shawls`: `200`, `4.2 ms` TTFB, `5,450 bytes`
  - `/gi-tagged`: `200`, `4.0 ms` TTFB, `4,570 bytes`
  - `/himalayan-handmade-products`: `200`, `5.5 ms` TTFB, `6,689 bytes`
  - `/guides`: `200`, `2.9 ms` TTFB, `4,718 bytes`
  - `/sitemap.xml`: `200`, `8.2 ms` TTFB, `20,043 bytes`
  - `/robots.txt`: `200`, `1.1 ms` TTFB, `990 bytes`
- **Lighthouse Note:** `lighthouse` CLI is not installed locally in this environment, so full mobile/desktop Lighthouse category scores could not be captured locally; run Chrome DevTools / PageSpeed Insights against staging or `https://www.dearhills.in` post-deploy.

---

## 6. 90-Day Pan-Himalayan SEO Execution Roadmap

- **Days 1–30 (Technical Stabilization & Indexing):**
  1. Deploy updated release, verify `/sitemap.xml`, `/robots.txt`, `/regions/kashmir` 301 redirect, and `/guides/*` responses in production.
  2. Fact-check the 22 guides flagged with `factCheckRequired: true` against official `ipindia.gov.in` GI dossiers and clear editorial notices once verified.
  3. Onboard the existing live seller catalog with full `region`, `districtVillage`, `craftType`, `technique`, and 150+ word unique descriptions.
- **Days 31–60 (Multi-Region Supply & Unlocking Combo Hubs):**
  1. Source and approve at least **3 real in-stock products** per flagship region-craft priority pair (starting with `himachal-pradesh/kullu-kinnauri-shawls`, `himachal-pradesh/himalayan-tea`, `uttarakhand/aipan-art`, `ladakh/pashmina-shawls`, `jammu-and-kashmir/pashmina-shawls`) so their `/regions/:region/:craft` pages cross the Anti-Doorway threshold automatically into `/sitemap.xml`.
  2. Connect Google Merchant Center to `/feeds/google-merchant.xml` and segment Shopping campaigns using `custom_label_0` (region) & `custom_label_1` (craft).
  3. Launch post-delivery buyer review requests to populate genuine verified `AggregateRating` rich snippets on top SKUs.
- **Days 61–90 (Authority Building & Scale):**
  1. Earn authoritative citations and contextual editorial backlinks from Indian craft museums, ethical fashion blogs, sustainable tea journals, and regional travel guides pointing to `/himalayan-handmade-products`, `/gi-tagged`, and regional craft guides.
  2. Audit Search Console Search Appearance & Index Coverage for query cannibalization across `/regions/*` vs `/crafts/*` vs `/categories/*` and expand guides with high-impression long-tail regional search queries.
  3. If international shipping logistics are finalized, toggle `FEATURE_INTERNATIONAL=true` (`USD`/`EUR` switcher readiness) and configure country shipping matrices.

---

## 7. Owner Manual Action Checklist

- [ ] **Google Search Console:** Add `google-site-verification` DNS TXT record (or HTML meta token), submit `https://www.dearhills.in/sitemap.xml`, and inspect `/` + `/himalayan-handmade-products` + `/regions/himachal-pradesh`.
- [ ] **Organization Schema (`sameAs`):** Provide official Instagram, Facebook, X, or YouTube URLs so `Organization.sameAs` can be populated once accounts are active.
- [ ] **Google Merchant Center:** Register `/feeds/google-merchant.xml` and verify `<g:custom_label_0>` (region) and `<g:custom_label_1>` (craft) mapping cleanly in active Shopping rules.
- [ ] **Supply Onboarding Across All 7 Regions:** Recruit and verify vetted artisans/cooperatives in Uttarakhand, Jammu & Kashmir, Ladakh, Sikkim, Arunachal Pradesh, and Darjeeling/Kalimpong alongside Himachal Pradesh.
- [ ] **GI & Certification Document Verification:** Collect Authorized User GI certificates, Craft Development Institute (CDI) seal references, or valid Organic Certification documents before enabling `giTagged` or approving protected claim copy in Admin.
- [ ] **Product Descriptions Rewrite Audit:** Filter products flagged `< 100` words in Admin (`needsDescriptionRewrite`) and expand unique craft, material, origin, and care stories to 150+ words.
- [ ] **Collect Real Customer Reviews:** Follow up with delivered orders to gather authentic ratings (avoiding fake/seed ratings).
- [ ] **Fact-Check Flagged Guides:** Verify exact GI registration years/reference citations on the guides carrying `factCheckRequired: true`.
- [ ] **Post-Deploy Lighthouse Audit:** Run mobile + desktop PageSpeed Insights / Chrome Lighthouse against live `https://www.dearhills.in/` and `/regions/himachal-pradesh` to record field Core Web Vitals (LCP/INP/CLS).
