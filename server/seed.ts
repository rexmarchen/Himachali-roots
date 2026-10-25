import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { env } from './env.js';
import { execute, initDb, queryAll, queryOne, tx, type Db } from './db.js';
import { hashPassword } from './lib/auth.js';
import { newId } from './lib/ids.js';
import type { CreditsContent } from '../shared/content.js';

/**
 * Development seed.
 *
 * EVERYTHING created here is demonstration data and is labelled as such in the
 * UI (product `is_demo` flag, "(demo)" in seller names, `.test` email
 * addresses). It must never be presented as real trading history. Running
 * `npm run reset` replaces it; the production database is never seeded
 * automatically.
 */

const DEMO_PASSWORD = process.env.DEMO_SEED_PASSWORD ?? 'PahadiDemo!2026';
const DEMO_DOMAIN = 'demo.pahadiroots.test';

interface DemoCategory {
  key: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  sort: number;
  parent?: string;
}

interface DemoProduct {
  slug: string;
  name: string;
  category: string;
  seller: string;
  price: number;
  compareAt?: number;
  sku: string;
  unit: string;
  weightG?: number;
  dimensions?: string;
  materials?: string;
  care?: string;
  foodInfo?: string;
  origin: string;
  region: string;
  short: string;
  description: string;
  image: string;
  imageAlt: string;
  credit: string;
  featured?: boolean;
  stock: number;
  attributes?: Record<string, string>;
}

const CATEGORIES: DemoCategory[] = [
  {
    key: 'shawls',
    name: 'Shawls & weaves',
    slug: 'shawls-and-weaves',
    description: 'Handloom shawls, stoles and yardage from mountain looms.',
    image: '/images/product-shawl.jpg',
    sort: 10,
  },
  {
    key: 'knitwear',
    name: 'Knitwear',
    slug: 'knitwear',
    description: 'Wool socks, caps and small knitted goods for cold rooms and long walks.',
    image: '/images/product-socks.jpg',
    sort: 20,
  },
  {
    key: 'tea',
    name: 'Tea & infusions',
    slug: 'tea-and-infusions',
    description: 'Small-garden tea and herbal infusions grown in Himachal.',
    image: '/images/product-tea.jpg',
    sort: 30,
  },
  {
    key: 'pantry',
    name: 'Pantry & preserves',
    slug: 'pantry-and-preserves',
    description: 'Honey, pickles, preserves and everyday food from mountain kitchens.',
    image: '/images/product-honey.jpg',
    sort: 40,
  },
  {
    key: 'dry-fruit',
    name: 'Dry fruit & nuts',
    slug: 'dry-fruit-and-nuts',
    description: 'Apricots, walnuts and orchard produce from high valleys.',
    image: '/images/product-walnut.jpg',
    sort: 50,
  },
  {
    key: 'pulses',
    name: 'Pulses & staples',
    slug: 'pulses-and-staples',
    description: 'Beans, lentils and staples grown on terraced fields.',
    image: '/images/product-rajma.jpg',
    sort: 60,
  },
  {
    key: 'headwear',
    name: 'Caps & headwear',
    slug: 'caps-and-headwear',
    description: 'Wool caps in local shapes, made for actual winters.',
    image: '/images/product-cap.jpg',
    sort: 70,
  },
  {
    key: 'gifting',
    name: 'Gifting',
    slug: 'gifting',
    description: 'Small collections of food and handmade things, packed as gifts.',
    image: '/images/editorial-terrace.jpg',
    sort: 80,
  },
];

interface DemoSeller {
  key: string;
  name: string;
  slug: string;
  email: string;
  sellerType: string;
  region: string;
  village: string;
  tagline: string;
  story: string;
  address: { line1: string; city: string; state: string; pincode: string };
  commissionBp?: number;
}

const SELLERS: DemoSeller[] = [
  {
    key: 'kullu',
    name: 'Kullu Loom Collective (demo)',
    slug: 'kullu-loom-collective-demo',
    email: `kullu@${DEMO_DOMAIN}`,
    sellerType: 'cooperative',
    region: 'Kullu',
    village: 'Bhuntar',
    tagline: 'Handloom and knitwear from the Kullu valley — demonstration storefront.',
    story:
      'Demonstration seller profile. In a live marketplace this section would carry the workshop’s own account of its looms, its members and its production calendar, reviewed by the marketplace team. No real cooperative is represented by this seed record.',
    address: { line1: 'Demo address, near Bhuntar', city: 'Bhuntar', state: 'Himachal Pradesh', pincode: '175125' },
    commissionBp: 1400,
  },
  {
    key: 'kangra',
    name: 'Kangra Tea Cooperative (demo)',
    slug: 'kangra-tea-cooperative-demo',
    email: `kangra@${DEMO_DOMAIN}`,
    sellerType: 'cooperative',
    region: 'Kangra',
    village: 'Palampur',
    tagline: 'Small-garden tea from the Kangra valley — demonstration storefront.',
    story:
      'Demonstration seller profile. A real seller would supply garden details, plucking seasons and food-safety registrations here. This record exists to exercise the catalogue and is not a claim about any existing tea garden.',
    address: { line1: 'Demo address, Palampur', city: 'Palampur', state: 'Himachal Pradesh', pincode: '176061' },
  },
  {
    key: 'lahaul',
    name: 'Lahaul Apiary & Kitchen (demo)',
    slug: 'lahaul-apiary-demo',
    email: `lahaul@${DEMO_DOMAIN}`,
    sellerType: 'individual',
    region: 'Lahaul and Spiti',
    village: 'Keylong',
    tagline: 'Honey, apricots and preserves from a high cold desert — demonstration storefront.',
    story:
      'Demonstration seller profile. The high-altitude season is short, and this seller would normally describe its apiary locations, orchard partners and kitchen practices. None of that is asserted by this seed record.',
    address: { line1: 'Demo address, Keylong', city: 'Keylong', state: 'Himachal Pradesh', pincode: '175132' },
  },
  {
    key: 'chamba',
    name: 'Chamba Farm Collective (demo)',
    slug: 'chamba-farm-collective-demo',
    email: `chamba@${DEMO_DOMAIN}`,
    sellerType: 'cooperative',
    region: 'Chamba',
    village: 'Salooni',
    tagline: 'Terraced-field staples from the Ravi valley — demonstration storefront.',
    story:
      'Demonstration seller profile. This storefront would list the collective’s member farms, harvest calendar and grading standards. The seed record is sample data and does not represent a real collective.',
    address: { line1: 'Demo address, Salooni', city: 'Salooni', state: 'Himachal Pradesh', pincode: '176320' },
  },
  {
    key: 'kinnaur',
    name: 'Kinnaur Orchard Growers (demo)',
    slug: 'kinnaur-orchard-growers-demo',
    email: `kinnaur@${DEMO_DOMAIN}`,
    sellerType: 'cooperative',
    region: 'Kinnaur',
    village: 'Kalpa',
    tagline: 'Orchard fruit and walnuts from Kinnaur — demonstration storefront.',
    story:
      'Demonstration seller profile. A live listing would explain orchard altitude, drying methods and the grading the grower applies. Nothing in this seed record is a verified origin claim.',
    address: { line1: 'Demo address, Kalpa', city: 'Kalpa', state: 'Himachal Pradesh', pincode: '172108' },
  },
];

const PRODUCTS: DemoProduct[] = [
  {
    slug: 'kullu-handwoven-wool-shawl',
    name: 'Kullu handwoven wool shawl',
    category: 'shawls',
    seller: 'kullu',
    price: 680000,
    compareAt: 780000,
    sku: 'DEMO-KUL-SHW-01',
    unit: 'piece',
    weightG: 620,
    dimensions: '200 × 90 cm',
    materials: 'Wool; cotton warp',
    care: 'Dry clean or hand wash cold with a wool detergent. Dry flat in shade.',
    origin: 'Kullu valley, Himachal Pradesh',
    region: 'Kullu',
    short: 'A generous wool shawl in a traditional geometric pattern, woven on a pit loom.',
    description:
      'A demonstration listing for a handwoven wool shawl. The pattern language borrows from Kullu’s pit-loom tradition; in a live listing the seller would describe the specific motifs, the yarn count and the weaver. The cloth is warm without being heavy, with a firm hand that softens with wear.',
    image: '/images/product-shawl.jpg',
    imageAlt: 'A geometrically patterned handwoven textile on a wooden loom',
    credit: 'Illustrative photograph: Rajani Gairshail, CC BY-SA 4.0, via Wikimedia Commons. Not the actual product.',
    featured: true,
    stock: 6,
    attributes: { Weave: 'Pit loom', Finish: 'Hand-finished fringe', Colour: 'Natural with madder-red border' },
  },
  {
    slug: 'hand-knitted-himalayan-socks',
    name: 'Hand-knitted Himalayan socks',
    category: 'knitwear',
    seller: 'kullu',
    price: 89000,
    sku: 'DEMO-KUL-SOC-02',
    unit: 'pair',
    weightG: 180,
    materials: 'Wool blend',
    care: 'Hand wash cold. Do not tumble dry.',
    origin: 'Kullu valley, Himachal Pradesh',
    region: 'Kullu',
    short: 'Thick, plainly knitted house socks for cold floors and early mornings.',
    description:
      'A demonstration listing for a pair of hand-knitted socks. The knit is dense and slightly irregular, as hand-work is. These are house socks, not hiking socks: the wool is soft rather than technical, and the fit is generous.',
    image: '/images/product-socks.jpg',
    imageAlt: 'A pair of hand-knitted patterned socks',
    credit: 'Illustrative photograph: Rajani Gairshail, CC BY-SA 4.0, via Wikimedia Commons. Not the actual product.',
    stock: 18,
    attributes: { Size: 'Adult, approximate UK 6–10', Yarn: 'Woollen blend', Made: 'Hand-knitted' },
  },
  {
    slug: 'himachali-wool-cap',
    name: 'Himachali wool cap',
    category: 'headwear',
    seller: 'kullu',
    price: 125000,
    sku: 'DEMO-KUL-CAP-03',
    unit: 'piece',
    weightG: 140,
    materials: 'Wool',
    care: 'Hand wash cold. Reshape and dry flat.',
    origin: 'Kullu valley, Himachal Pradesh',
    region: 'Kullu',
    short: 'A close-fitting knitted cap in a traditional banded shape.',
    description:
      'A demonstration listing for a knitted woollen cap. The shape is the familiar close-fitting Himachali cap, with a patterned band and a small crown. Colour and pattern will vary between pieces because they are knitted by hand.',
    image: '/images/product-cap.jpg',
    imageAlt: 'Several knitted Himachali caps in different colours',
    credit: 'Illustrative photograph: Ravi Kumar, CC BY 3.0, via Wikimedia Commons. Not the actual product.',
    stock: 11,
    attributes: { Fit: 'Close-fitting', Pattern: 'Assorted, varies by piece' },
  },
  {
    slug: 'kangra-valley-green-tea',
    name: 'Kangra valley green tea',
    category: 'tea',
    seller: 'kangra',
    price: 62000,
    sku: 'DEMO-KAN-TEA-01',
    unit: '100 g tin',
    weightG: 100,
    materials: 'Camellia sinensis leaf',
    foodInfo:
      'Ingredients: green tea leaf. Allergens: none declared. Store airtight away from light and strong smells. Best within 12 months of packing. Demonstration data — the live listing must carry the seller’s actual FSSAI details and batch information.',
    origin: 'Kangra valley, Himachal Pradesh',
    region: 'Kangra',
    short: 'A light, grassy green tea from the first flush, packed in a small tin.',
    description:
      'A demonstration listing for Kangra green tea. Expect a pale liquor, a vegetal aroma and very little bitterness if steeped briefly. This is an everyday tea rather than a competition grade, and the tin is sized for a household rather than a café.',
    image: '/images/product-tea.jpg',
    imageAlt: 'Terraced tea gardens on a hillside',
    credit: 'Illustrative photograph: UnpetitproleX, CC BY-SA 4.0, via Wikimedia Commons. Not the actual product.',
    featured: true,
    stock: 24,
    attributes: { Type: 'Green tea', Steeping: '80 °C, 2–3 minutes', Pack: '100 g tin' },
  },
  {
    slug: 'lahaul-wildflower-honey',
    name: 'Lahaul wildflower honey',
    category: 'pantry',
    seller: 'lahaul',
    price: 54000,
    sku: 'DEMO-LAH-HON-01',
    unit: '250 g jar',
    weightG: 250,
    foodInfo:
      'Ingredients: honey. Allergens: none declared. Crystallisation is normal. Do not feed honey to infants under 12 months. Store at room temperature. Demonstration data — replace with the seller’s actual food-safety declarations before launch.',
    origin: 'Lahaul valley, Himachal Pradesh',
    region: 'Lahaul and Spiti',
    short: 'A single-season honey with a strong floral scent and a soft, grainy set.',
    description:
      'A demonstration listing for honey from a short high-altitude flowering season. The flavour is full and slightly resinous, and the texture sets firmly. Because it is not pasteurised for clarity, it may crystallise; warm the jar gently in water if you prefer it runny.',
    image: '/images/product-honey.jpg',
    imageAlt: 'A small jar of honey with a piece of honeycomb',
    credit: 'Illustrative photograph: Alabama Extension, CC0, via Wikimedia Commons. Not the actual product.',
    featured: true,
    stock: 30,
    attributes: { 'Floral source': 'Mixed mountain wildflowers', Texture: 'Set' },
  },
  {
    slug: 'dried-apricots-lahaul',
    name: 'Dried apricots from Lahaul',
    category: 'dry-fruit',
    seller: 'lahaul',
    price: 48000,
    sku: 'DEMO-LAH-APR-02',
    unit: '250 g pouch',
    weightG: 250,
    foodInfo:
      'Ingredients: dried apricots. Allergens: none declared. May contain natural stones or fragments — check before eating. Store cool and dry. Demonstration data; the live listing must state the seller’s food registrations.',
    origin: 'Lahaul valley, Himachal Pradesh',
    region: 'Lahaul and Spiti',
    short: 'Sun-dried apricots with a tart edge, unsulphured and dark in colour.',
    description:
      'A demonstration listing for orchard apricots dried in the open air. They are unsulphured, so the colour is deep amber rather than bright orange, and the flavour is more acidic than sweet. Good in a lunchbox, or steeped with tea.',
    image: '/images/product-apricot.jpg',
    imageAlt: 'A bowl of dried apricots',
    credit: 'Illustrative photograph: Andrey Butko, CC BY-SA 3.0, via Wikimedia Commons. Not the actual product.',
    stock: 22,
    attributes: { Treatment: 'Unsulphured', Grade: 'Mixed sizes' },
  },
  {
    slug: 'chamba-rajma',
    name: 'Chamba rajma',
    category: 'pulses',
    seller: 'chamba',
    price: 32000,
    sku: 'DEMO-CHA-RAJ-01',
    unit: '500 g pouch',
    weightG: 500,
    foodInfo:
      'Ingredients: kidney beans. Allergens: none declared. Soak before cooking and boil thoroughly; never eat raw or undercooked beans. Store cool and dry. Demonstration data; the live listing must carry the seller’s actual declarations.',
    origin: 'Chamba district, Himachal Pradesh',
    region: 'Chamba',
    short: 'Small, thin-skinned red beans that hold their shape in a slow curry.',
    description:
      'A demonstration listing for rajma grown on terraced fields. The beans are smaller than the common market grade and cook to a firm, creamy centre. Soak overnight, discard the water, and simmer with aromatics until tender.',
    image: '/images/product-rajma.jpg',
    imageAlt: 'A close view of red kidney beans',
    credit: 'Illustrative photograph: Sanjay Acharya, CC BY-SA 3.0, via Wikimedia Commons. Not the actual product.',
    stock: 40,
    attributes: { Size: 'Small grade', Cooking: 'Soak 8 hours, simmer 45–60 minutes' },
  },
  {
    slug: 'mountain-kitchen-pickle',
    name: 'Mountain kitchen pickle',
    category: 'pantry',
    seller: 'chamba',
    price: 36000,
    sku: 'DEMO-CHA-PIC-01',
    unit: '300 g jar',
    weightG: 300,
    foodInfo:
      'Ingredients (demonstration): mango or local fruit, mustard oil, salt, chilli, spices. Allergens: mustard. Store in a cool place; use a dry spoon. Demonstration data — replace with the seller’s actual recipe, allergens and FSSAI details.',
    origin: 'Chamba district, Himachal Pradesh',
    region: 'Chamba',
    short: 'A sharp, oily pickle in the mountain style, made for dal and rice.',
    description:
      'A demonstration listing for a small-batch pickle. It is salty and sour rather than sweet, with a mustard-oil base and a slow chilli heat. The jar is sized for one household; keep the spoon dry and the lid closed.',
    image: '/images/product-pickle.jpg',
    imageAlt: 'A jar of Indian pickle with visible spices',
    credit: 'Illustrative photograph: Miansari66, CC0, via Wikimedia Commons. Not the actual product.',
    stock: 16,
    attributes: { Heat: 'Medium', Base: 'Mustard oil', Allergens: 'Mustard' },
  },
  {
    slug: 'kinnaur-walnut-kernels',
    name: 'Kinnaur walnut kernels',
    category: 'dry-fruit',
    seller: 'kinnaur',
    price: 98000,
    sku: 'DEMO-KIN-WAL-01',
    unit: '250 g pouch',
    weightG: 250,
    foodInfo:
      'Ingredients: walnut kernels. Allergens: tree nuts (walnut). Store airtight in a cool place or refrigerate for longer keeping. Demonstration data; replace with the seller’s actual declarations.',
    origin: 'Kinnaur district, Himachal Pradesh',
    region: 'Kinnaur',
    short: 'Light-coloured walnut kernels with a thin bitter skin and a clean finish.',
    description:
      'A demonstration listing for hand-cracked walnut kernels. They are pale and mostly whole, with some broken pieces, and the skin is thin enough to eat. Keep them cold if you are not using them within a few weeks; walnut oil goes stale at warm room temperatures.',
    image: '/images/product-walnut.jpg',
    imageAlt: 'Walnuts in their shells, one cracked open',
    credit: 'Illustrative photograph: Böhringer Friedrich, CC BY-SA 2.5, via Wikimedia Commons. Not the actual product.',
    stock: 14,
    attributes: { Grade: 'Mostly whole kernels', Packaging: 'Resealable pouch' },
  },
  {
    slug: 'mountain-pantry-gift-box',
    name: 'The mountain pantry gift box',
    category: 'gifting',
    seller: 'lahaul',
    price: 185000,
    sku: 'DEMO-LAH-GFT-01',
    unit: 'box',
    weightG: 1400,
    foodInfo:
      'Contains honey, dried apricots and tea. Allergens and food-safety declarations must be taken from each component listing. Demonstration gift set; contents may change. Replace all declarations before launch.',
    origin: 'Assembled in Himachal Pradesh',
    region: 'Lahaul and Spiti',
    short: 'Honey, apricots and a small tea tin in a plain kraft box, with a handwritten note.',
    description:
      'A demonstration gift listing that combines three pantry items in one box. It is packed in plain kraft with paper tape and a card; no plastic tray. Because it contains food, it is not returnable once opened unless something is damaged or missing.',
    image: '/images/product-honey.jpg',
    imageAlt: 'A jar of honey with honeycomb, suggesting a pantry gift',
    credit: 'Illustrative photograph: Alabama Extension, CC0, via Wikimedia Commons. Not the actual product.',
    stock: 9,
    attributes: { Contains: 'Honey 250 g, dried apricots 250 g, green tea 50 g', Packaging: 'Kraft box, paper tape' },
  },
];

function readCredits(): CreditsContent {
  const file = path.resolve(process.cwd(), 'public', 'images', 'credits.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      credits: { file: string; title: string; author: string; license: string; sourceUrl: string; note: string }[];
    };
    return {
      intro:
        'Photography on this development build is illustrative and sourced from Wikimedia Commons under the licences listed below. Images do not depict specific PAHADI ROOTS sellers or imply that a product comes from the place shown. Replace these assets with original product photography before launch.',
      items: parsed.credits.map((credit) => ({
        title: credit.title,
        author: credit.author,
        license: credit.license,
        sourceUrl: credit.sourceUrl,
        usedFor: credit.note,
      })),
    };
  } catch {
    return {
      intro:
        'Image attribution could not be loaded. Run `node scripts/fetch-images.mjs` to restore the development image set and its credits.',
      items: [],
    };
  }
}

function resetDatabase(db: Db): void {
  const tables = queryAll<{ name: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'",
  );
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec('BEGIN IMMEDIATE');
    for (const table of tables) {
      db.exec(`DELETE FROM "${table.name.replace(/"/g, '""')}"`);
    }
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore
    }
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

function insertSiteContent(db: Db, key: string, value: unknown): void {
  execute(
    db,
    `INSERT INTO site_content (key, value_json) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`,
    key,
    JSON.stringify(value),
  );
}

export async function seed(db: Db, options: { reset?: boolean } = {}): Promise<void> {
  if (env.isProduction && process.env.ALLOW_DEMO_SEED_IN_PRODUCTION !== 'true') {
    throw new Error(
      'Refusing to seed demonstration data in production. Set ALLOW_DEMO_SEED_IN_PRODUCTION=true only for a deliberate staging exercise.',
    );
  }

  if (options.reset) resetDatabase(db);

  const existing = queryOne<{ count: number }>(db, 'SELECT COUNT(*) AS count FROM products');
  if ((existing?.count ?? 0) > 0) {
    console.log('Seed skipped: products already exist. Run `npm run reset` to replace development data.');
    return;
  }

  const now = new Date().toISOString();
  const categoryIds = new Map<string, string>();
  const sellerIds = new Map<string, string>();
  const sellerUserIds = new Map<string, string>();
  const passwordHash = hashPassword(DEMO_PASSWORD);

  tx(db, () => {
    for (const category of CATEGORIES) {
      const id = newId('cat_');
      categoryIds.set(category.key, id);
      execute(
        db,
        `INSERT INTO categories (id, name, slug, parent_id, description, image_url, sort_order, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        id,
        category.name,
        category.slug,
        category.parent ? categoryIds.get(category.parent) ?? null : null,
        category.description,
        category.image,
        category.sort,
        now,
      );
    }

    for (const seller of SELLERS) {
      const userId = newId('usr_');
      const sellerId = newId('sel_');
      const address = JSON.stringify({
        line1: seller.address.line1,
        city: seller.address.city,
        state: seller.address.state,
        pincode: seller.address.pincode,
        phone: '+910000000000',
      });

      execute(
        db,
        `INSERT INTO users (id, email, password_hash, email_verified, is_disabled, created_at, updated_at)
         VALUES (?, ?, ?, 1, 0, ?, ?)`,
        userId,
        seller.email,
        passwordHash,
        now,
        now,
      );
      execute(
        db,
        `INSERT INTO profiles (id, full_name, phone, marketing_consent, updated_at) VALUES (?, ?, ?, 0, ?)`,
        userId,
        seller.name,
        '+910000000000',
        now,
      );
      execute(db, "INSERT INTO user_roles (user_id, role) VALUES (?, 'customer')", userId);
      execute(db, "INSERT INTO user_roles (user_id, role) VALUES (?, 'seller')", userId);
      execute(
        db,
        `INSERT INTO seller_profiles
           (id, user_id, business_name, slug, seller_type, tagline, story, region, village, operating_address,
            pickup_address, status, commission_rate_bp, approved_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?)`,
        sellerId,
        userId,
        seller.name,
        seller.slug,
        seller.sellerType,
        seller.tagline,
        seller.story,
        seller.region,
        seller.village,
        address,
        address,
        seller.commissionBp ?? null,
        now,
        now,
        now,
      );
      execute(
        db,
        `INSERT INTO seller_applications
           (id, seller_id, status, business_name, seller_type, categories, address, phone, notes, submitted_at, reviewed_at)
         VALUES (?, ?, 'approved', ?, ?, ?, ?, ?, ?, ?, ?)`,
        newId('app_'),
        sellerId,
        seller.name,
        seller.sellerType,
        JSON.stringify(CATEGORIES.filter((c) => PRODUCTS.some((p) => p.seller === seller.key && p.category === c.key)).map((c) => c.slug)),
        address,
        '+910000000000',
        'Demonstration application generated by server/seed.ts. No identity documents were checked.',
        now,
        now,
      );
      sellerIds.set(seller.key, sellerId);
      sellerUserIds.set(seller.key, userId);
    }

    for (const product of PRODUCTS) {
      const categoryId = categoryIds.get(product.category);
      const sellerId = sellerIds.get(product.seller);
      if (!categoryId || !sellerId) throw new Error(`Seed product ${product.slug} references a missing category or seller.`);

      const productId = newId('prd_');
      execute(
        db,
        `INSERT INTO products
           (id, seller_id, category_id, name, slug, short_description, description, price_paise,
            compare_at_price_paise, sku, unit, weight_g, dimensions, materials, care_instructions, food_info,
            origin_place, origin_verified, region, attributes, tax_rate_bp, hsn_code, status, is_featured,
            is_demo, submitted_at, approved_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, NULL, 'approved', ?, 1, ?, ?, ?, ?)`,
        productId,
        sellerId,
        categoryId,
        product.name,
        product.slug,
        product.short,
        product.description,
        product.price,
        product.compareAt ?? null,
        product.sku,
        product.unit,
        product.weightG ?? null,
        product.dimensions ?? null,
        product.materials ?? null,
        product.care ?? null,
        product.foodInfo ?? null,
        product.origin,
        product.region,
        product.attributes ? JSON.stringify(product.attributes) : null,
        product.featured ? 1 : 0,
        now,
        now,
        now,
        now,
      );
      execute(
        db,
        `INSERT INTO product_images (id, product_id, url, alt, credit, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
        newId('img_'),
        productId,
        product.image,
        product.imageAlt,
        product.credit,
        now,
      );
      execute(
        db,
        `INSERT INTO inventory (product_id, quantity, reserved_quantity, low_stock_threshold, updated_at)
         VALUES (?, ?, 0, 3, ?)`,
        productId,
        product.stock,
        now,
      );
      execute(
        db,
        `INSERT INTO inventory_movements (id, product_id, change, reason, reference, note, created_at)
         VALUES (?, ?, ?, 'seed', ?, 'Demonstration starting stock', ?)`,
        newId('mov_'),
        productId,
        product.stock,
        `seed:${product.sku}`,
        now,
      );
    }

    execute(
      db,
      `INSERT INTO commission_rules (id, scope, category_id, seller_id, rate_bp, is_active, effective_from)
       VALUES (?, 'global', NULL, NULL, ?, 1, ?)`,
      newId('cmr_'),
      env.defaultCommissionBp,
      now,
    );

    execute(
      db,
      `INSERT INTO commission_rules (id, scope, category_id, seller_id, rate_bp, is_active, effective_from)
       VALUES (?, 'category', ?, NULL, 1000, 1, ?)`,
      newId('cmr_'),
      categoryIds.get('gifting') ?? null,
      now,
    );

    execute(
      db,
      `INSERT INTO coupons
         (id, code, description, type, value, min_order_paise, max_discount_paise, usage_limit, per_user_limit,
          used_count, starts_at, ends_at, is_active, created_at)
       VALUES (?, 'WELCOME10', 'Demo coupon: 10% off a first pantry order, capped at ₹300.', 'percent', 10,
               99900, 30000, 500, 1, 0, ?, ?, 1, ?)`,
      newId('cpn_'),
      now,
      new Date(Date.now() + 365 * 86400_000).toISOString(),
      now,
    );

    execute(
      db,
      `INSERT INTO coupons
         (id, code, description, type, value, min_order_paise, max_discount_paise, usage_limit, per_user_limit,
          used_count, starts_at, ends_at, is_active, created_at)
       VALUES (?, 'HIMALAYA250', 'Demo coupon: ₹250 off orders over ₹1,999.', 'fixed', 25000,
               199900, NULL, 200, 1, 0, ?, ?, 1, ?)`,
      newId('cpn_'),
      now,
      new Date(Date.now() + 365 * 86400_000).toISOString(),
      now,
    );

    insertSiteContent(db, 'credits', readCredits());

    execute(
      db,
      `INSERT INTO integration_settings (key, enabled, mode, metadata_json, updated_at)
       VALUES ('razorpay', 0, 'unconfigured', ?, ?)
       ON CONFLICT(key) DO NOTHING`,
      JSON.stringify({ note: 'Configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the environment.' }),
      now,
    );
    execute(
      db,
      `INSERT INTO integration_settings (key, enabled, mode, metadata_json, updated_at)
       VALUES ('shiprocket', 0, 'unconfigured', ?, ?)
       ON CONFLICT(key) DO NOTHING`,
      JSON.stringify({ note: 'Carrier automation is not implemented. Dispatch is recorded manually.' }),
      now,
    );
  });

  // Audit rows are written outside the seed transaction so the log records a
  // completed action rather than a partially applied one.
  execute(
    db,
    `INSERT INTO audit_logs (id, actor_id, actor_email, action, entity_type, entity_id, after_json, created_at)
     VALUES (?, NULL, NULL, 'seed.development_data_loaded', 'system', 'seed', ?, ?)`,
    newId('aud_'),
    JSON.stringify({
      demo: true,
      sellers: SELLERS.length,
      products: PRODUCTS.length,
      categories: CATEGORIES.length,
      demoEmails: [...sellerUserIds.values()].length,
      note: 'Demonstration data. Product listings are labelled is_demo=1 and sellers carry "(demo)" in their names.',
    }),
    now,
  );

  console.log(
    [
      'Development seed complete — all records are demonstration data.',
      `  Categories: ${CATEGORIES.length}`,
      `  Demo sellers: ${SELLERS.length}`,
      `  Demo products: ${PRODUCTS.length}`,
      `  Demo seller logins: ${SELLERS.map((s) => s.email).join(', ')}`,
      `  Demo seller password: ${DEMO_PASSWORD}`,
      '  Admin: create one with `npm run admin:create -- you@example.com "Your Name"`.',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  const reset = process.argv.includes('--reset');
  const db = initDb(env.databasePath);
  await seed(db, { reset });
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
