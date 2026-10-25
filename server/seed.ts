import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { env } from './env.js';
import { execute, initDb, queryAll, queryOne, tx, type Db } from './db.js';
import { hashPassword } from './lib/auth.js';
import { newId } from './lib/ids.js';
import { getProduct, getRegions, listCategories, listProducts, listPublicSellers } from './lib/catalog.js';
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
    name: 'Shawls & Handlooms',
    slug: 'shawls-and-weaves',
    description: 'Handloom shawls, stoles, and woven heirlooms crafted on traditional wooden pit looms.',
    image: '/images/product-shawl.jpg',
    sort: 10,
  },
  {
    key: 'tea',
    name: 'Kangra Orthodox Tea',
    slug: 'tea-and-infusions',
    description: 'First flush orthodox black and green teas, single-estate harvests, and wild botanical infusions.',
    image: '/images/product-tea.jpg',
    sort: 20,
  },
  {
    key: 'dry-fruit',
    name: 'Dry Fruit & Nuts',
    slug: 'dry-fruit-and-nuts',
    description: 'High-altitude Kinnaur walnuts, sun-dried wild apricots, and cold-desert chuli almonds.',
    image: '/images/product-walnut.jpg',
    sort: 30,
  },
  {
    key: 'pantry',
    name: 'Wild Honey & Preserves',
    slug: 'pantry-and-preserves',
    description: 'Raw unpasteurized wildflower honey, slow-simmered orchard fruit jams, and traditional mountain pickles.',
    image: '/images/product-honey.jpg',
    sort: 40,
  },
  {
    key: 'oils',
    name: 'Cold-Pressed Oils',
    slug: 'cold-pressed-oils',
    description: 'Artisanal wood cold-pressed apricot kernel oil, virgin walnut oil, and stone-ground yellow mustard oil.',
    image: '/images/product-oil.jpg',
    sort: 50,
  },
  {
    key: 'pulses',
    name: 'Mountain Pulses & Staples',
    slug: 'pulses-and-staples',
    description: 'Terraced-grown Chamba rajma, Himalayan pure shilajit resin, deep crimson saffron, and mountain grains.',
    image: '/images/product-rajma.jpg',
    sort: 60,
  },
  {
    key: 'knitwear',
    name: 'Warm Knitwear',
    slug: 'knitwear',
    description: 'Hand-knitted sheep wool socks, cozy ribbed mufflers, and cable-knit gloves for alpine winters.',
    image: '/images/product-muffler.jpg',
    sort: 70,
  },
  {
    key: 'headwear',
    name: 'Himachali Caps',
    slug: 'caps-and-headwear',
    description: 'Traditional Kulluvi and Bushahri velvet-banded wool caps worn across the mountain valleys.',
    image: '/images/product-cap.jpg',
    sort: 80,
  },
  {
    key: 'gifting',
    name: 'Curated Gifting',
    slug: 'gifting',
    description: 'Bespoke hand-assembled mountain pantry crates, artisanal tea selections, and winter warmth gift sets.',
    image: '/images/editorial-terrace.jpg',
    sort: 90,
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
  // 1. Shawls & Handlooms
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
    materials: 'Pure Himalayan sheep wool with cotton warp',
    care: 'Dry clean or gentle hand wash cold with wool detergent. Dry flat in shade.',
    origin: 'Kullu valley, Himachal Pradesh',
    region: 'Kullu',
    short: 'A generous handloom wool shawl featuring iconic geometric border motifs woven on wooden pit looms.',
    description:
      'Woven on heritage pit looms in the Kullu valley by artisan families using time-honored techniques. The cloth is extraordinarily warm without being unwieldy, softening into a magnificent drape with every season. Authentic geometric tribal border in natural madder-red and indigo accents.',
    image: '/images/product-shawl.jpg',
    imageAlt: 'Handwoven Kullu wool shawl with intricate border patterning',
    credit: 'Illustrative photograph: Rajani Gairshail, CC BY-SA 4.0, via Wikimedia Commons.',
    featured: true,
    stock: 8,
    attributes: { Weave: 'Pit loom handloom', Fiber: '100% Desi sheep wool', Border: 'Traditional Kulluvi motif', Dye: 'Natural plant-based dyes' },
  },
  {
    slug: 'chamba-rumal-embroidered-stole',
    name: 'Chamba Rumal embroidered stole',
    category: 'shawls',
    seller: 'chamba',
    price: 840000,
    compareAt: 950000,
    sku: 'DEMO-CHA-SHW-02',
    unit: 'piece',
    weightG: 340,
    dimensions: '190 × 70 cm',
    materials: 'Fine handspun tussar silk & merino wool',
    care: 'Dry clean only. Store wrapped in breathable muslin cloth.',
    origin: 'Ravi Valley, Chamba, Himachal Pradesh',
    region: 'Chamba',
    short: 'Exquisite double-sided reversible embroidered stole inspired by classical Pahari miniature paintings.',
    description:
      'Created by women master artisans in Chamba using the rare dorukha (double-sided darning) embroidery style where both sides appear completely identical. Drawing inspiration from 18th-century Pahari paintings of alpine floral creepers and pastoral legends, each stole takes up to 4 weeks of patient needlework.',
    image: '/images/weaving.jpg',
    imageAlt: 'Artisan weaving handloom textile on traditional wooden loom',
    credit: 'Illustrative photograph: Rajani Gairshail, CC BY-SA 4.0, via Wikimedia Commons.',
    featured: false,
    stock: 5,
    attributes: { Technique: 'Chamba Dorukha embroidery', Craft: 'GI-tagged Chamba Rumal heritage', Base: 'Tussar silk blend', Artisan: 'Women artisan collective' },
  },
  {
    slug: 'pashmina-angora-cloud-wrap',
    name: 'Pashmina & Angora cloud wrap',
    category: 'shawls',
    seller: 'kullu',
    price: 1250000,
    compareAt: 1400000,
    sku: 'DEMO-KUL-SHW-03',
    unit: 'piece',
    weightG: 260,
    dimensions: '210 × 100 cm',
    materials: '80% High-altitude Pashmina, 20% Angora wool',
    care: 'Professional dry clean only.',
    origin: 'Spiti & Kullu highlands, Himachal Pradesh',
    region: 'Kullu',
    short: 'Featherweight high-altitude Pashmina and combed Angora cloud wrap with hand-twisted fringed edges.',
    description:
      'Sourced from nomadic pastoralist flocks grazing at 4,000 metres on the trans-Himalayan plateau. Spun to an ultra-fine micron count and hand-finished with natural walnut-rind and oak-bark tan hues. Weighing just 260 grams, it provides transcendent warmth and gossamer elegance.',
    image: '/images/shawl.jpg',
    imageAlt: 'Folded fine wool pashmina shawl with hand-finished trim',
    credit: 'Illustrative photograph: Rajani Gairshail, CC BY-SA 4.0, via Wikimedia Commons.',
    featured: true,
    stock: 6,
    attributes: { Fiber: 'Pashmina & Angora blend', Micron: '15.5 microns', Weight: '260g featherweight', Finish: 'Natural unbleached dyes' },
  },

  // 2. Kangra Orthodox Tea
  {
    slug: 'kangra-valley-green-tea',
    name: 'Kangra valley green tea',
    category: 'tea',
    seller: 'kangra',
    price: 62000,
    sku: 'DEMO-KAN-TEA-01',
    unit: '100 g tin',
    weightG: 100,
    materials: 'Whole Camellia sinensis leaf',
    foodInfo:
      '100% Whole leaf single-estate green tea. Zero additives, zero artificial flavours. High in naturally occurring catechins and L-theanine. Store in airtight tin in a cool place away from humidity.',
    origin: 'Dharamshala & Palampur, Kangra Valley, HP (Elev. 1,450m)',
    region: 'Kangra',
    short: 'Hand-plucked first flush orthodox green tea with floral sweetness, sweet vegetal notes, and zero bitterness.',
    description:
      'Cultivated in the shaded foothills of the Dhauladhar mountain range. Plucked by hand at first dawn when the morning mountain mist still bathes the tender two leaves and a bud. Pan-fired in small artisanal woks to arrest oxidation and lock in delicate grassy and honeysuckle aromas.',
    image: '/images/product-tea.jpg',
    imageAlt: 'Emerald green terraced tea gardens in the Kangra valley under Himalayan peaks',
    credit: 'Illustrative photograph: UnpetitproleX, CC BY-SA 4.0, via Wikimedia Commons.',
    featured: true,
    stock: 24,
    attributes: { Flush: 'First Flush Spring Harvest', Grade: 'Fine Orthodox Whole Leaf', Altitude: '1,450 metres', Caffeine: 'Mild / Balanced' },
  },
  {
    slug: 'kangra-first-flush-black-tea',
    name: 'Kangra first flush orthodox black tea',
    category: 'tea',
    seller: 'kangra',
    price: 75000,
    compareAt: 85000,
    sku: 'DEMO-KAN-TEA-02',
    unit: '100 g tin',
    weightG: 100,
    materials: 'Whole Camellia sinensis orthodox black leaf',
    foodInfo:
      'Pure Orthodox Kangra Black Tea (GI Protected). Zero dust or CTC fannings. Best steeped at 95°C for 3 to 4 minutes.',
    origin: 'Palampur Estate, Kangra Valley, HP',
    region: 'Kangra',
    short: 'Gold-tipped orthodox black tea celebrated for its sparkling amber liquor and distinct muscatel fruit notes.',
    description:
      'Kangra orthodox tea holds a prized Geographical Indication (GI) tag dating back to 1849. Grown in acidic Himalayan soil fed by melting glaciers, this orthodox black tea delivers crisp muscatel notes reminiscent of Darjeeling, complemented by a woody sweet finish that pairs gracefully without milk.',
    image: '/images/region-kangra.jpg',
    imageAlt: 'Panoramic Kangra tea estate with snow-dusted mountains in the background',
    credit: 'Illustrative photograph: Platform Archive, CC BY-SA 4.0.',
    featured: false,
    stock: 32,
    attributes: { Classification: 'Tippy Golden Flowery Orange Pekoe (TGFOP)', Provenance: 'GI Tag Kangra Tea', Liquor: 'Bright Golden Amber' },
  },
  {
    slug: 'chamomile-wild-rhododendron-infusion',
    name: 'Chamomile & wild rhododendron infusion',
    category: 'tea',
    seller: 'kangra',
    price: 49000,
    sku: 'DEMO-KAN-TEA-03',
    unit: '75 g glass jar',
    weightG: 75,
    materials: 'Sun-dried Himalayan chamomile blossoms & wild rhododendron petals',
    foodInfo:
      '100% Caffeine-Free Botanical Herbal Tisane. Naturally soothing before bedtime. Keep jar sealed away from direct sunlight.',
    origin: 'Baijnath & Dharamshala, Kangra Valley, HP',
    region: 'Kangra',
    short: 'Soothing whole chamomile flowers blended with crimson wild Himalayan rhododendron petals (Buransh).',
    description:
      'A relaxing caffeine-free alpine tisane blending whole sun-dried German chamomile flowers with hand-foraged wild rhododendron (Buransh) petals from the high cedar forests of Dharamkot. Steep for 5 minutes to release gentle honey-apple aromas and a restorative, calming nightcap.',
    image: '/images/product-saffron.jpg',
    imageAlt: 'Artisanal glass jar of mountain botanical flowers and crimson herbs',
    credit: 'Illustrative photograph: PAHADI ROOTS Creative Studio.',
    featured: false,
    stock: 28,
    attributes: { Blend: 'Chamomile & Wild Rhododendron', Caffeine: 'Zero / 100% Caffeine-Free', Aroma: 'Honey, Apple & Mountain Blossom' },
  },

  // 3. Dry Fruit & Nuts
  {
    slug: 'kinnaur-walnut-kernels',
    name: 'Kinnaur walnut kernels',
    category: 'dry-fruit',
    seller: 'kinnaur',
    price: 98000,
    compareAt: 115000,
    sku: 'DEMO-KIN-WAL-01',
    unit: '250 g pouch',
    weightG: 250,
    foodInfo:
      'Ingredients: 100% Raw Walnut Kernels (Juglans regia). Allergens: Tree nuts (Walnuts). Naturally sun-dried, chemical-free and unbleached. Zero added salt or preservatives.',
    origin: 'Sangla & Kalpa Valleys, Kinnaur, Himachal Pradesh (Elev. 2,800m)',
    region: 'Kinnaur',
    short: 'Sun-dried high-altitude Kinnauri walnuts with tender golden skins, rich natural oils, and sweet buttery crunch.',
    description:
      'Harvested from heritage mountain orchards in the glacier-fed valleys of Kinnaur, perched at 2,800 metres above sea level. The intense Himalayan sunlight and freezing alpine nights stimulate the trees to produce nuts packed with extraordinary healthy oil reserves.\n\nEach walnut is hand-gathered by local grower families, cracked manually on wooden mallets, and sun-dried on natural slate stone. We never subject our kernels to chlorine bleaching, preserving their wholesome golden-amber pellicle and sweet earthy finish.',
    image: '/images/product-walnut.jpg',
    imageAlt: 'Walnuts in their shells, one cracked open',
    credit: 'Illustrative photograph: Böhringer Friedrich, CC BY-SA 2.5, via Wikimedia Commons.',
    featured: true,
    stock: 14,
    attributes: {
      'Grade': 'Premium Jumbo Halves & Quarters',
      'Elevation': '2,800 m (Sangla & Kalpa Valleys)',
      'Processing': '100% Sun-Dried on Slate, Hand-Cracked',
      'Purity': 'Zero Bleach, Non-GMO, Raw & Unroasted',
    },
  },
  {
    slug: 'dried-apricots-lahaul',
    name: 'Dried apricots from Lahaul',
    category: 'dry-fruit',
    seller: 'lahaul',
    price: 48000,
    compareAt: 55000,
    sku: 'DEMO-LAH-APR-02',
    unit: '250 g pouch',
    weightG: 250,
    foodInfo:
      '100% Wild Mountain Apricots (Prunus armeniaca). Unsulphured, unpasteurized, zero added sugars or preservatives.',
    origin: 'Keylong & Jispa, Lahaul Valley, HP (Elev. 3,100m)',
    region: 'Lahaul and Spiti',
    short: 'Sun-dried open-air apricots with a rich sweet-tart tang, naturally dark and unbleached.',
    description:
      'Grown in pesticide-free orchards along the Bhaga River in Lahaul’s cold desert. Ripe golden apricots are sliced and laid out under the piercing high-altitude sun on cedar boards. Because no sulphur dioxide is used to artificially bright orange them, they dry to an authentic deep mahogany amber with intense, concentrated fruit flavor.',
    image: '/images/product-apricot.jpg',
    imageAlt: 'A bowl of dried apricots',
    credit: 'Illustrative photograph: Andrey Butko, CC BY-SA 3.0, via Wikimedia Commons.',
    featured: false,
    stock: 22,
    attributes: { Processing: '100% Unsulphured, Sun-Dried', Variety: 'Wild Pahadi Chuli Apricot', Taste: 'Sweet with brisk mineral tartness' },
  },
  {
    slug: 'spiti-wild-almonds-chuli',
    name: 'Spiti wild chuli almonds',
    category: 'dry-fruit',
    seller: 'kinnaur',
    price: 110000,
    compareAt: 130000,
    sku: 'DEMO-KIN-ALM-03',
    unit: '200 g pouch',
    weightG: 200,
    foodInfo:
      'Raw Wild Mountain Almond Kernels (Prunus amygdalus). Contains tree nuts. Non-GMO, completely unpasteurized.',
    origin: 'Hangrang Valley & Sangla, Kinnaur, HP',
    region: 'Kinnaur',
    short: 'Rare small-kernel cold-desert mountain almonds with intense aromatics and extraordinarily high essential oil density.',
    description:
      'Unlike California commercial farmed almonds, these indigenous Himalayan mountain almonds grow wild on steep arid cliffsides. Though smaller in profile, their cold-climate adaptation concentrates essential fatty acids, vitamin E, and a rich marzipan-sweet aroma unmatched by any commercial crop.',
    image: '/images/product-walnut.jpg',
    imageAlt: 'Wild mountain almonds in rustic wooden vessel',
    credit: 'Illustrative photograph: Platform Archive.',
    featured: false,
    stock: 18,
    attributes: { Variety: 'Wild Gurbandi Chuli', OilContent: '>54% natural oil content', Harvest: 'Manual tree-shaking autumn harvest' },
  },

  // 4. Wild Honey & Preserves
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
      '100% Raw Unpasteurized Mountain Honey. Zero corn syrup, zero inverted sugar. Crystallization is a natural hallmark of raw unheated honey.',
    origin: 'Keylong & Chandra Valley, Lahaul, HP (Elev. 3,200m)',
    region: 'Lahaul and Spiti',
    short: 'A single-season raw honey with intense alpine floral scent, hints of clover and wild thyme, and a soft creamy set.',
    description:
      'Gathered during Lahaul’s fleeting 6-week summer bloom when the high alpine meadows erupt with wild sweet clover, buckwheat, seabuckthorn, and thyme. Extracted manually without heating or ultra-filtration to preserve living enzymes, propolis, and wild pollen grains.',
    image: '/images/product-honey.jpg',
    imageAlt: 'A small jar of honey with a piece of honeycomb',
    credit: 'Illustrative photograph: Alabama Extension, CC0, via Wikimedia Commons.',
    featured: true,
    stock: 30,
    attributes: { FloralOrigin: 'Wild Alpine Clover, Buckwheat & Thyme', State: 'Raw & Unfiltered', HarvestPeriod: 'Mid-summer annual harvest' },
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
      'Ingredients: Mountain mango, wild fiddlehead ferns (lingad), yellow mustard oil, fenugreek, rock salt, red chilli, whole spices. Allergens: Mustard.',
    origin: 'Salooni, Chamba District, HP',
    region: 'Chamba',
    short: 'Tangy, mustard-oil cured traditional pickle with wild mountain fiddlehead fern and spiced wild green mango.',
    description:
      'Handmade by women farmers in Salooni village following recipes preserved through generations. Cured under the Himalayan sun in ceramic martabans with cold-pressed yellow mustard oil, wild hing, and hand-roasted spices. Bracingly pungent and savory.',
    image: '/images/product-pickle.jpg',
    imageAlt: 'A jar of Indian pickle with visible spices',
    credit: 'Illustrative photograph: Miansari66, CC0, via Wikimedia Commons.',
    featured: false,
    stock: 19,
    attributes: { Curing: 'Sun-cured in ceramic jars for 21 days', OilBase: 'Pure cold-pressed yellow mustard oil', Spiciness: 'Medium-high traditional heat' },
  },
  {
    slug: 'kinnaur-apple-cider-jam',
    name: 'Kinnaur apple cider jam',
    category: 'pantry',
    seller: 'kinnaur',
    price: 42000,
    sku: 'DEMO-KIN-JAM-02',
    unit: '280 g jar',
    weightG: 280,
    foodInfo:
      'Ingredients: 75% Kinnaur Royal Delicious Apples, raw cane sugar (khand), lemon juice, wild cinnamon bark. Zero artificial pectin or synthetic color.',
    origin: 'Kalpa & Sangla, Kinnaur, HP',
    region: 'Kinnaur',
    short: 'Slow-simmered whole fruit preserve made with heirloom Kinnaur apples, mountain cider, and cracked cinnamon.',
    description:
      'Crafted during the crisp autumn harvest in Kalpa from orchard-ripe Royal Delicious apples. Simmered in small copper cauldrons with pure mountain apple cider and Ceylon cinnamon bark until thick and spoonable. Spread on hot toast, parathas, or paired with sharp goat cheese.',
    image: '/images/auth-orchard.jpg',
    imageAlt: 'Freshly harvested Kinnaur apples in wooden crate with cinnamon',
    credit: 'Illustrative photograph: PAHADI ROOTS Creative Studio.',
    featured: false,
    stock: 26,
    attributes: { FruitContent: '75% Whole Fruit', Sweetener: 'Raw Unrefined Cane Sugar', Additives: 'Zero Pectin, Zero Preservatives' },
  },

  // 5. Cold-Pressed Oils
  {
    slug: 'wild-apricot-kernel-oil-chuli',
    name: 'Wild apricot kernel oil (Chuli)',
    category: 'oils',
    seller: 'kinnaur',
    price: 89000,
    compareAt: 105000,
    sku: 'DEMO-KIN-OIL-01',
    unit: '250 ml glass bottle',
    weightG: 320,
    foodInfo:
      '100% Pure Virgin Cold-Pressed Apricot Kernel Oil (Chuli ka tel). Cold-pressed on wooden expellers below 35°C. Food grade and cosmetic grade.',
    origin: 'Kalpa & Sangla Valleys, Kinnaur, HP',
    region: 'Kinnaur',
    short: 'Wood cold-pressed virgin apricot kernel oil, celebrated for deep cellular hydration, vitamin A, and delicate nutty flavor.',
    description:
      'Extracted from the sweet kernels of wild mountain apricots using traditional wooden kohlu presses. Cold-pressed below 35°C without chemical solvents or heat treatment, yielding a luminous amber oil abundant in oleic and linoleic essential fatty acids. Prized for both gourmet culinary finishing and luxurious skin rejuvenation.',
    image: '/images/product-oil.jpg',
    imageAlt: 'Amber golden bottle of cold-pressed wild apricot kernel oil on rustic mountain wood',
    credit: 'Illustrative photograph: PAHADI ROOTS Creative Studio.',
    featured: true,
    stock: 25,
    attributes: { Method: 'Wood Kohlu Cold-Pressed', Purity: '100% Single-Ingredient Virgin', Uses: 'Culinary Drizzle & Ayurvedic Abhyanga Massage' },
  },
  {
    slug: 'pahadi-walnut-cold-pressed-oil',
    name: 'Extra virgin Pahadi walnut oil',
    category: 'oils',
    seller: 'kinnaur',
    price: 145000,
    compareAt: 165000,
    sku: 'DEMO-KIN-OIL-02',
    unit: '200 ml glass bottle',
    weightG: 280,
    foodInfo:
      'Extra Virgin Cold-Pressed Walnut Oil (Juglans regia). Allergen: Tree nuts. Do not heat to high smoke points; best consumed raw as finishing oil.',
    origin: 'Kinnaur Valley, HP (Elev. 2,600m)',
    region: 'Kinnaur',
    short: 'Extra virgin wood-pressed walnut oil rich in plant-based Omega-3 ALA, with a deep roasted hazelnut aroma.',
    description:
      'Slowly pressed in small batches from freshly shelled high-altitude Kinnauri walnuts. Packing an extraordinary concentration of Omega-3 alpha-linolenic acid, it serves as a nutritious drizzle over warm lentil soups, winter roasted roots, fresh cheeses, and morning sourdough.',
    image: '/images/product-oil.jpg',
    imageAlt: 'Bottle of golden extra virgin walnut oil beside raw walnut halves',
    credit: 'Illustrative photograph: PAHADI ROOTS Creative Studio.',
    featured: false,
    stock: 15,
    attributes: { Extraction: 'First Cold Press (Unrefined)', Omega3: 'Over 12g ALA per 100g', Bottle: 'Dark UV-protective glass bottle' },
  },
  {
    slug: 'mountain-yellow-mustard-oil',
    name: 'Kachi Ghani yellow mustard oil',
    category: 'oils',
    seller: 'chamba',
    price: 38000,
    sku: 'DEMO-CHA-OIL-03',
    unit: '500 ml bottle',
    weightG: 550,
    foodInfo:
      '100% Kachi Ghani Cold-Pressed Yellow Mustard Oil (Brassica hirta). Contains natural sinigrin pungency. Zero argemone oil.',
    origin: 'Salooni, Chamba District, HP',
    region: 'Chamba',
    short: 'Heritage stone-mill cold-pressed yellow sarson oil with mellow nutty heat and sweet aromatic pungency.',
    description:
      'Pressed from heirloom yellow mustard seeds grown on terraced non-irrigated mountain hillslopes. Yellow mustard oil possesses a milder, sweeter, and more fragrant aroma than black mustard oil, making it the supreme choice for authentic Himachali Madra cooking, tempering, and pickling.',
    image: '/images/product-oil.jpg',
    imageAlt: 'Golden yellow mustard oil bottle with mustard seeds',
    credit: 'Illustrative photograph: PAHADI ROOTS Creative Studio.',
    featured: false,
    stock: 35,
    attributes: { Seed: 'Pahadi Yellow Mustard (Sarson)', Pressing: 'Traditional Kachi Ghani Wooden Press', Acidity: '<0.5%' },
  },

  // 6. Mountain Pulses & Staples
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
      'Ingredients: 100% Mountain Kidney Beans (Phaseolus vulgaris). Soak for 6-8 hours before simmering. Store in airtight container.',
    origin: 'Chamba district, Himachal Pradesh',
    region: 'Chamba',
    short: 'Small, thin-skinned heirloom red beans that cook into a melting, buttery gravy without splitting.',
    description:
      'Grown by multi-generational farming families in the high terraces of Chamba along snow-fed canals. Renowned for their delicate skins and natural sweetness, these beans absorb aromatics deeply and cook to a creamy, velvety consistency in traditional slow clay-pot stews.',
    image: '/images/product-rajma.jpg',
    imageAlt: 'A close view of red kidney beans',
    credit: 'Illustrative photograph: Sanjay Acharya, CC BY-SA 3.0, via Wikimedia Commons.',
    featured: true,
    stock: 40,
    attributes: { GrainSize: 'Authentic Small Mountain Bean', CookingTime: '40 mins after overnight soak', Texture: 'Tender & Melt-in-mouth' },
  },
  {
    slug: 'himalayan-pure-shilajit-resin',
    name: 'Purified Himalayan Shilajit resin',
    category: 'pulses',
    seller: 'lahaul',
    price: 165000,
    compareAt: 195000,
    sku: 'DEMO-LAH-SHI-02',
    unit: '20 g jar',
    weightG: 20,
    foodInfo:
      '100% Purified Natural Asphaltum (Shilajit Resin). Verified >75% Fulvic Acid. Dissolve a pea-sized amount in warm water or milk.',
    origin: 'High Glaciers above 16,000 ft, Spiti & Lahaul, HP',
    region: 'Lahaul and Spiti',
    short: 'Grade-A purified soft black rock resin gathered above 16,000 feet, rich in fulvic acid and 84+ ionic trace minerals.',
    description:
      'Harvested by seasoned high-altitude mountain foragers from sheer rock cliffs exposed by melting glacial ice. Purified using the ancient Surya-Tapi (solar decantation) method and filtered through spring water without chemical solvents. Enhances vitality, stamina, and cellular resilience.',
    image: '/images/maker-food.jpg',
    imageAlt: 'Pure glossy dark mountain shilajit resin in amber glass jar',
    credit: 'Illustrative photograph: Platform Archive.',
    featured: true,
    stock: 20,
    attributes: { Purification: 'Traditional Surya-Tapi Solar Method', FulvicAcid: '>75% Certified Fulvic Acid', MineralCount: '84+ Trace Minerals' },
  },
  {
    slug: 'pure-kinnaur-saffron-threads',
    name: 'Pure Sangla valley saffron threads',
    category: 'pulses',
    seller: 'kinnaur',
    price: 240000,
    compareAt: 280000,
    sku: 'DEMO-KIN-SAF-03',
    unit: '1 g glass jar',
    weightG: 1,
    foodInfo:
      '100% Pure Mongra Saffron (Crocus sativus). Hand-picked dark crimson stigmas only. Zero yellow style threads or artificial coloring.',
    origin: 'Sangla Valley, Kinnaur, HP (Elev. 2,700m)',
    region: 'Kinnaur',
    short: 'Exceptional Grade-1 Mongra saffron threads hand-harvested in Sangla with intense crocin color and safranal fragrance.',
    description:
      'Grown in limited micro-climatic pockets of the Sangla Valley where crisp mountain winds and sharp diurnal temperature swings yield saffron stigmas of peerless potency. Just 2 to 3 threads bloom into an intoxicating golden-red infusion for festive rice, milk, and sweets.',
    image: '/images/product-saffron.jpg',
    imageAlt: 'Cork-sealed glass jar filled with vibrant red saffron threads on slate',
    credit: 'Illustrative photograph: PAHADI ROOTS Creative Studio.',
    featured: false,
    stock: 15,
    attributes: { Grade: 'Super Mongra Grade 1', Harvest: 'October 2025 Hand-Plucked', CrocinValue: '>240 color intensity' },
  },
  {
    slug: 'spiti-black-soybeans-kala-bhat',
    name: 'Spiti heirloom black soybeans (Kala Bhat)',
    category: 'pulses',
    seller: 'chamba',
    price: 28000,
    sku: 'DEMO-CHA-SOY-04',
    unit: '500 g pouch',
    weightG: 500,
    foodInfo:
      'Heirloom Black Mountain Soybeans (Glycine max). High plant protein and iron. Soak 8 hours before cooking.',
    origin: 'Chamba & Spiti Highlands, HP',
    region: 'Chamba',
    short: 'Ancient high-altitude black soybeans with an earthy, nutty profile, used in traditional mountain stews.',
    description:
      'A cherished mountain superfood cultivated for centuries at high altitudes. Known locally as Kala Bhat, these resilient black legumes boast exceptional plant protein, anthocyanins, and dietary fiber, yielding a hearty dark broth when simmered with whole spices.',
    image: '/images/editorial-terrace.jpg',
    imageAlt: 'Lush terraced mountain slopes where mountain grains and pulses are grown',
    credit: 'Illustrative photograph: Adam Jones, CC BY-SA 2.0.',
    featured: false,
    stock: 28,
    attributes: { Protein: 'Over 38% natural protein', Origin: 'Heritage non-GMO native seed', FarmMethod: '100% Rainfed organic hillside cultivation' },
  },

  // 7. Warm Knitwear
  {
    slug: 'hand-knitted-himalayan-socks',
    name: 'Hand-knitted Himalayan socks',
    category: 'knitwear',
    seller: 'kullu',
    price: 89000,
    sku: 'DEMO-KUL-SOC-02',
    unit: 'pair',
    weightG: 180,
    materials: 'Pure mountain sheep wool',
    care: 'Hand wash cold with wool wash. Lay flat to dry.',
    origin: 'Kullu valley, Himachal Pradesh',
    region: 'Kullu',
    short: 'Thick, dense hand-knitted sheep wool house socks crafted with reinforced heels for chilly mountain evenings.',
    description:
      'Hand-knitted by village women in the Kullu valley during the quiet winter months between harvests. Crafted with double-stranded local sheep wool and reinforced double-knitted heels, providing unbeatable warmth on stone and hardwood floors.',
    image: '/images/product-socks.jpg',
    imageAlt: 'A pair of hand-knitted patterned socks',
    credit: 'Illustrative photograph: Rajani Gairshail, CC BY-SA 4.0, via Wikimedia Commons.',
    featured: false,
    stock: 18,
    attributes: { Size: 'Free Size (UK 6–10)', Yarn: 'Unbleached Himalayan sheep wool', Craft: 'Hand-knitted double heel' },
  },
  {
    slug: 'himalayan-sheep-wool-muffler',
    name: 'Himalayan sheep wool cable muffler',
    category: 'knitwear',
    seller: 'kullu',
    price: 145000,
    compareAt: 170000,
    sku: 'DEMO-KUL-MUF-03',
    unit: 'piece',
    weightG: 240,
    materials: '100% Pure Merino & Himalayan Sheep Wool',
    care: 'Hand wash cold or dry clean. Reshape flat.',
    origin: 'Manali & Naggar, Kullu Valley, HP',
    region: 'Kullu',
    short: 'Chunky cable-knit wool muffler in oatmeal beige and pine green, soft against the neck and thoroughly windproof.',
    description:
      'Knit by hand on circular bamboo needles in the scenic valley of Naggar. Combining natural oatmeal sheep wool with plant-dyed sage pine green wool, this muffler features traditional cable twists that trap body heat effortlessly during frosty mornings.',
    image: '/images/product-muffler.jpg',
    imageAlt: 'Folded thick cable-knit woolen muffler scarf resting on rustic bench',
    credit: 'Illustrative photograph: PAHADI ROOTS Creative Studio.',
    featured: true,
    stock: 16,
    attributes: { Knit: 'Textured Cable Knit', Length: '180 × 25 cm', Yarn: 'Pure Mountain Wool', Dye: 'Plant-extracted sage green' },
  },
  {
    slug: 'hand-knitted-fingerless-gloves',
    name: 'Ribbed wool fingerless mitts',
    category: 'knitwear',
    seller: 'kullu',
    price: 65000,
    sku: 'DEMO-KUL-GLV-04',
    unit: 'pair',
    weightG: 110,
    materials: 'Soft mountain wool blend',
    care: 'Hand wash gently in cold water.',
    origin: 'Kullu Valley, HP',
    region: 'Kullu',
    short: 'Flexible ribbed wrist warmers and fingerless gloves, designed for cold-weather working and writing.',
    description:
      'Designed for versatility in freezing mountain rooms, keeping your palms and wrists toasty warm while leaving your fingers completely free for typing, holding a warm mug, or sketching. Knit with elastic ribbing that hugs the forearm.',
    image: '/images/editorial-spinning.jpg',
    imageAlt: 'Artisan hand-spinning natural wool yarn',
    credit: 'Illustrative photograph: Yann Forget, CC BY-SA 3.0.',
    featured: false,
    stock: 22,
    attributes: { Fit: 'Snug stretch ribbing', Utility: 'Typing, reading, outdoor photography', Made: '100% Hand-knitted' },
  },

  // 8. Himachali Caps & Headwear
  {
    slug: 'himachali-wool-cap',
    name: 'Kullu traditional wool cap',
    category: 'headwear',
    seller: 'kullu',
    price: 125000,
    sku: 'DEMO-KUL-CAP-03',
    unit: 'piece',
    weightG: 140,
    materials: 'Pure wool with cotton velvet band',
    care: 'Dry clean or spot clean with damp cloth.',
    origin: 'Kullu valley, Himachal Pradesh',
    region: 'Kullu',
    short: 'The iconic Kulluvi round topico cap featuring an intricately woven patterned band and deep forest velvet trim.',
    description:
      'The beloved cultural symbol of Himachal Pradesh. Structured with pure milled felted wool and adorned across the front with an authentic handwoven geometric Kullu pattu border. Worn with pride across community celebrations and daily mountain life.',
    image: '/images/product-cap.jpg',
    imageAlt: 'Several knitted Himachali caps in different colours',
    credit: 'Illustrative photograph: Ravi Kumar, CC BY 3.0, via Wikimedia Commons.',
    featured: true,
    stock: 11,
    attributes: { Style: 'Iconic Kullu Round Topi', FrontBand: 'Handwoven Pit Loom Border', Fabric: 'Felted Pure Wool' },
  },
  {
    slug: 'bushahri-kinnauri-wool-cap',
    name: 'Bushahri Kinnauri velvet-banded cap',
    category: 'headwear',
    seller: 'kinnaur',
    price: 145000,
    compareAt: 165000,
    sku: 'DEMO-KIN-CAP-04',
    unit: 'piece',
    weightG: 150,
    materials: 'Fine wool with parrot green velvet flap',
    care: 'Spot clean only.',
    origin: 'Rampur Bushahr & Kalpa, Kinnaur, HP',
    region: 'Kinnaur',
    short: 'Distinctive Kinnauri Bushahri cap with a rich parrot-green velvet fold-up front band and warm felt crown.',
    description:
      'Originating in the historic Bushahr kingdom of upper Shimla and Kinnaur. Defined by its signature parrot-green velvet brim that folds gracefully upward, accented with subtle golden zari piping. Crafted to shield the head against biting Himalayan winds.',
    image: '/images/product-cap.jpg',
    imageAlt: 'Traditional Himachali cap with royal velvet styling',
    credit: 'Illustrative photograph: Ravi Kumar, CC BY 3.0.',
    featured: false,
    stock: 14,
    attributes: { Heritage: 'Bushahri / Kinnauri Style', Brim: 'Royal green velvet flap', Sizing: 'Medium (56cm) & Large (58cm)' },
  },

  // 9. Curated Gifting
  {
    slug: 'mountain-pantry-gift-box',
    name: 'The mountain pantry gift box',
    category: 'gifting',
    seller: 'lahaul',
    price: 185000,
    compareAt: 220000,
    sku: 'DEMO-LAH-GFT-01',
    unit: 'box',
    weightG: 1400,
    foodInfo:
      'Gift set contains: 1x Lahaul Wildflower Honey (250g), 1x Dried Apricots (250g), 1x Kangra Green Tea Tin (50g).',
    origin: 'Assembled in Himachal Pradesh',
    region: 'Lahaul and Spiti',
    short: 'Hand-assembled kraft gift box with wildflower honey, sun-dried apricots, first flush green tea, and a handwritten card.',
    description:
      'A thoughtful taste of the Himalayas assembled in recycled kraft with mountain-pine twine and a letterpress card. Contains three quintessential food treasures: single-season raw wildflower honey, unsulphured wild apricots, and whole-leaf green tea.',
    image: '/images/product-honey.jpg',
    imageAlt: 'A jar of honey with honeycomb, suggesting a pantry gift',
    credit: 'Illustrative photograph: Alabama Extension, CC0, via Wikimedia Commons.',
    featured: true,
    stock: 9,
    attributes: { Contains: 'Honey 250 g, dried apricots 250 g, green tea 50 g', Packaging: 'Kraft box, paper tape' },
  },
  {
    slug: 'the-himalayan-warmth-gift-hamper',
    name: 'The Himalayan warmth gift hamper',
    category: 'gifting',
    seller: 'kullu',
    price: 340000,
    compareAt: 395000,
    sku: 'DEMO-KUL-GFT-02',
    unit: 'hamper',
    weightG: 950,
    materials: 'Wool accessories & glass tisane jar',
    care: 'Individual care guidelines included inside.',
    origin: 'Kullu & Kangra, HP',
    region: 'Kullu',
    short: 'Curated winter luxury hamper containing hand-knitted sheep wool socks, cable-knit muffler, and calming chamomile tisane.',
    description:
      'The ultimate winter comfort package from Himachal. Includes a pair of dense hand-knitted wool house socks, our signature cable-knit oatmeal sheep wool muffler, and a jar of wild rhododendron and chamomile evening tisane.',
    image: '/images/product-muffler.jpg',
    imageAlt: 'Winter gift hamper with folded cable-knit muffler and accessories',
    credit: 'Illustrative photograph: PAHADI ROOTS Creative Studio.',
    featured: false,
    stock: 7,
    attributes: { Includes: 'Wool Muffler, Hand-knit Socks, Chamomile Jar', Box: 'Cedar wood presentation keepsake crate' },
  },
  {
    slug: 'kinnaur-orchard-connoisseur-crate',
    name: 'Kinnaur orchard connoisseur crate',
    category: 'gifting',
    seller: 'kinnaur',
    price: 280000,
    compareAt: 320000,
    sku: 'DEMO-KIN-GFT-03',
    unit: 'crate',
    weightG: 1600,
    foodInfo:
      'Includes: 1x Cold-Pressed Wild Apricot Oil (250ml), 1x Premium Kinnaur Walnuts (250g), 1x Royal Apple Jam (280g).',
    origin: 'Sangla & Kalpa, Kinnaur, HP',
    region: 'Kinnaur',
    short: 'Artisanal pine-wood crate filled with cold-pressed virgin apricot oil, jumbo walnut halves, and spiced apple cider preserve.',
    description:
      'Direct from the high-altitude glacier orchards of Kinnaur. Packaged in an artisanal pine-wood slide-lid crate lined with dried mountain pine needles. Celebrates the pure agricultural brilliance of the Sangla and Kalpa valleys.',
    image: '/images/auth-orchard.jpg',
    imageAlt: 'High-altitude orchard harvest crate with artisanal bottles and jars',
    credit: 'Illustrative photograph: PAHADI ROOTS Creative Studio.',
    featured: true,
    stock: 10,
    attributes: { Includes: 'Apricot Oil 250ml, Walnuts 250g, Apple Jam 280g', Packaging: 'Artisanal Pine Wood slide crate with pine needle nest' },
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

  // Auto-provision administrator account so it persists across database resets
  const existingAdmin = queryOne<{ id: string }>(db, "SELECT id FROM users WHERE email = 'anshuar9065@gmail.com'");
  if (!existingAdmin) {
    const adminId = newId('usr_');
    const adminHash = hashPassword('Anshu90#@');
    execute(
      db,
      `INSERT INTO users (id, email, password_hash, email_verified, is_disabled, created_at, updated_at)
       VALUES (?, 'anshuar9065@gmail.com', ?, 1, 0, ?, ?)`,
      adminId,
      adminHash,
      now,
      now,
    );
    execute(
      db,
      `INSERT INTO profiles (id, full_name, phone, marketing_consent, updated_at)
       VALUES (?, 'Anshu Admin', '+919065000000', 1, ?)`,
      adminId,
      now,
    );
    execute(db, "INSERT INTO user_roles (user_id, role) VALUES (?, 'customer')", adminId);
    execute(db, "INSERT INTO user_roles (user_id, role) VALUES (?, 'admin')", adminId);
  }

  // Export static fallbacks for Vercel static deployment
  exportStaticFallbackFiles(db);

  console.log(
    [
      'Development seed complete — all records are demonstration data.',
      `  Categories: ${CATEGORIES.length}`,
      `  Demo sellers: ${SELLERS.length}`,
      `  Demo products: ${PRODUCTS.length}`,
      `  Demo seller logins: ${SELLERS.map((s) => s.email).join(', ')}`,
      `  Demo seller password: ${DEMO_PASSWORD}`,
      '  Admin login: anshuar9065@gmail.com (provisioned)',
      '  Static JSON fallback files exported to public/ directory.',
    ].join('\n'),
  );
}

function exportStaticFallbackFiles(db: Db): void {
  const publicDir = path.resolve(process.cwd(), 'public');
  if (!fs.existsSync(publicDir)) return;

  // 1. static-categories.json
  const categories = listCategories(db);
  const categoriesJson = {
    categories: categories.filter((c) => !c.parentId),
    subcategories: categories.filter((c) => c.parentId),
  };
  fs.writeFileSync(path.join(publicDir, 'static-categories.json'), JSON.stringify(categoriesJson, null, 2), 'utf8');

  // 2. static-products.json
  const productList = listProducts(db, { pageSize: 100 });
  const minMax = queryOne<{ min: number | null; max: number | null }>(
    db,
    "SELECT MIN(price_paise) AS min, MAX(price_paise) AS max FROM products WHERE status = 'approved'",
  );
  const productsJson = {
    ...productList,
    filters: {
      categories: listCategories(db),
      sellers: listPublicSellers(db).map((s) => ({ name: s.name, slug: s.slug })),
      regions: getRegions(db),
      priceRangePaise: minMax ?? { min: 28000, max: 1450000 },
    },
  };
  fs.writeFileSync(path.join(publicDir, 'static-products.json'), JSON.stringify(productsJson, null, 2), 'utf8');

  // 3. static-product-details.json
  const detailsMap: Record<string, unknown> = {};
  for (const item of productList.items) {
    const detail = getProduct(db, item.slug);
    if (detail) {
      detailsMap[item.slug] = {
        product: detail,
      };
    }
  }
  fs.writeFileSync(path.join(publicDir, 'static-product-details.json'), JSON.stringify(detailsMap, null, 2), 'utf8');
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
