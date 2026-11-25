import { complianceGroupFor } from './productCompliance.js';

export const MARKETPLACE_DEFAULT_ORIGIN = 'https://www.dearhills.in';
export const BRAND_NAME = 'Dear Hills';
export const BRAND_ALTERNATE_NAMES = ['DEAR HILLS', 'DearHills', 'dearhills', 'dearhills.in'] as const;
export const BRAND_LOGO_URL = `${MARKETPLACE_DEFAULT_ORIGIN}/favicon-192x192.png`;
export const MARKETPLACE_HOME_TITLE =
  'DEAR HILLS — Authentic Himalayan Handloom, Organic Harvest & Mountain Goods | DearHills.in';
export const MARKETPLACE_HOME_DESCRIPTION =
  'Official DearHills (dearhills.in) marketplace for authentic Himachal Pradesh handloom shawls, Kangra tea, raw honey, orchard fruits & mountain crafts.';
export const SHOP_SEO_TITLE = 'Shop Authentic Himachal Handloom, Organic Foods & Mountain Crafts | Dear Hills';
export const SHOP_SEO_COLLECTION_NAME = 'Shop Authentic Himachal Handloom, Organic Foods & Mountain Crafts';
export const SHOP_SEO_DESCRIPTION =
  'Browse authentic Himachali shawls, orthodox Kangra tea, raw wildflower honey, orchard produce, cold-pressed oils and mountain crafts from reviewed local makers and growers.';
export const MAKERS_SEO_TITLE = 'Meet the Mountain Makers & Artisans of Himachal Pradesh | Dear Hills';
export const MAKERS_SEO_DESCRIPTION =
  'Discover the generational weavers, orchardists, tea planters, beekeepers, and woodworkers across the valleys of Himachal Pradesh on Dear Hills.';
export const BECOME_MAKER_SEO_TITLE = 'Sell with Dear Hills — Himalayan Artisan & Producer Onboarding';
export const BECOME_MAKER_SEO_DESCRIPTION =
  'Join Dear Hills and bring authentic Himalayan handloom, orthodox tea, raw forest honey, orchard harvest and village craft to conscious customers across India.';

export function isDemoSellerInput(seller: {
  slug?: string | null;
  name?: string | null;
  email?: string | null;
}): boolean {
  const slug = (seller.slug ?? '').trim().toLowerCase();
  const name = (seller.name ?? '').trim().toLowerCase();
  const email = (seller.email ?? '').trim().toLowerCase();
  return (
    slug === 'demo' ||
    slug.endsWith('-demo') ||
    name.includes('(demo)') ||
    email.endsWith('.test')
  );
}

export function isDemoProductInput(product: {
  isDemo?: boolean | number | null;
  sku?: string | null;
  pricePaise?: number | null;
  shortDescription?: string | null;
  sellerSlug?: string | null;
  sellerName?: string | null;
  sellerEmail?: string | null;
}): boolean {
  const sku = (product.sku ?? '').trim().toUpperCase();
  const short = (product.shortDescription ?? '').trim().toLowerCase();
  return (
    Boolean(product.isDemo) ||
    sku.startsWith('DEMO-') ||
    (typeof product.pricePaise === 'number' && product.pricePaise <= 100) ||
    short.includes('test transaction') ||
    isDemoSellerInput({
      slug: product.sellerSlug,
      name: product.sellerName,
      email: product.sellerEmail,
    })
  );
}

export interface ProductSeoInput {
  name: string;
  categorySlug?: string | null;
  categoryName?: string | null;
  originPlace?: string | null;
  region?: string | null;
}

export interface CategorySeoInput {
  name: string;
  slug?: string | null;
}

export function cleanSeoText(text: string | null | undefined, maxLength = 160): string {
  if (!text) return '';
  const clean = text
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength - 1).trim() + '…';
}

export function productTitleSuffix(categorySlug?: string | null, categoryName?: string | null): string {
  const slug = (categorySlug ?? '').trim().toLowerCase();
  const group = complianceGroupFor(categorySlug, categoryName);

  if (group === 'raw_produce') {
    return 'Fresh Himachal Harvest';
  }
  if (group === 'food') {
    if (slug === 'tea-and-infusions') return 'Authentic Himachal Tea';
    if (slug === 'pantry-and-preserves') return 'Pure Himachal Pantry';
    if (slug === 'cold-pressed-oils') return 'Pure Himachal Harvest';
    return 'Authentic Himalayan Harvest';
  }
  if (group === 'textile') {
    return 'Authentic Handloom Himachal';
  }
  if (group === 'clothing') {
    return 'Authentic Himachali Craft';
  }
  if (group === 'craft') {
    return 'Authentic Handcrafted Himachal';
  }
  return 'Authentic Himachal Origin';
}

export function buildProductSeoTitle(input: ProductSeoInput): string {
  return `${input.name} — ${productTitleSuffix(input.categorySlug, input.categoryName)} | Dear Hills`;
}

export function buildProductFallbackDescription(input: ProductSeoInput): string {
  const origin = (input.originPlace || input.region || '').trim() || 'Himachal Pradesh';
  const group = complianceGroupFor(input.categorySlug, input.categoryName);
  let text: string;
  switch (group) {
    case 'raw_produce':
      text = `Buy fresh ${input.name} harvested in ${origin}. Direct from verified Himalayan growers on Dear Hills.`;
      break;
    case 'food':
      text = `Buy pure ${input.name} sourced from ${origin}. Authentic Himalayan harvest from verified local producers on Dear Hills.`;
      break;
    case 'textile':
      text = `Shop authentic ${input.name} handwoven in ${origin}. Genuine Himachali handloom from verified artisans on Dear Hills.`;
      break;
    case 'clothing':
      text = `Shop authentic ${input.name} made in ${origin}. Direct from verified Himachali makers on Dear Hills.`;
      break;
    case 'craft':
      text = `Shop authentic ${input.name} handcrafted in ${origin}. Genuine Himalayan craft from verified local artisans on Dear Hills.`;
      break;
    default:
      text = `Shop authentic ${input.name} from ${origin}. Verified Himalayan origin and quality on Dear Hills.`;
      break;
  }
  return cleanSeoText(text, 160);
}

export function buildCategorySeoTitle(input: CategorySeoInput): string {
  const group = complianceGroupFor(input.slug, input.name);
  switch (group) {
    case 'raw_produce':
      return `${input.name} — Fresh Himachal Harvest | Dear Hills`;
    case 'food':
      return `${input.name} — Authentic Himalayan Harvest | Dear Hills`;
    case 'textile':
      return `${input.name} — Authentic Handloom Himachal | Dear Hills`;
    case 'clothing':
      return `${input.name} — Authentic Himachali Woollens & Apparel | Dear Hills`;
    case 'craft':
      return `${input.name} — Authentic Handcrafted Himachal | Dear Hills`;
    default:
      return `${input.name} — Authentic Himachal Origin | Dear Hills`;
  }
}

export function buildCategoryFallbackDescription(input: CategorySeoInput): string {
  const group = complianceGroupFor(input.slug, input.name);
  let text: string;
  switch (group) {
    case 'raw_produce':
      text = `Shop fresh ${input.name} harvested across Himachal Pradesh. Direct from verified mountain orchards and growers on Dear Hills.`;
      break;
    case 'food':
      text = `Buy pure ${input.name} sourced from Himachal Pradesh. Direct from verified mountain growers and food producers on Dear Hills.`;
      break;
    case 'textile':
      text = `Shop authentic ${input.name} handwoven across Himachal Pradesh. Direct from verified mountain weavers on Dear Hills.`;
      break;
    case 'clothing':
      text = `Shop authentic ${input.name} made across Himachal Pradesh. Direct from verified mountain makers on Dear Hills.`;
      break;
    case 'craft':
      text = `Shop authentic ${input.name} handcrafted across Himachal Pradesh. Direct from verified mountain artisans on Dear Hills.`;
      break;
    default:
      text = `Explore authentic ${input.name} made and grown across Himachal Pradesh. Direct from verified mountain makers and growers on Dear Hills.`;
      break;
  }
  return cleanSeoText(text, 160);
}

export function buildProductShortFallback(input: ProductSeoInput): string {
  const originRaw = (input.originPlace || input.region || '').trim() || 'Himachal Pradesh';
  const originLocation = originRaw.toLowerCase().includes('himachal') ? originRaw : `${originRaw}, Himachal Pradesh`;
  const slug = (input.categorySlug ?? '').trim().toLowerCase();
  const group = complianceGroupFor(input.categorySlug, input.categoryName);
  let text: string;
  switch (group) {
    case 'raw_produce':
      text = `Fresh ${input.name} harvested in ${originLocation}.`;
      break;
    case 'food':
      if (slug === 'tea-and-infusions') {
        text = `Orthodox ${input.name} sourced directly from ${originLocation}.`;
      } else if (slug === 'pantry-and-preserves') {
        text = `Pure ${input.name} prepared from ${originRaw} mountain harvests.`;
      } else if (slug === 'cold-pressed-oils') {
        text = `Pure cold-pressed ${input.name} from ${originLocation}.`;
      } else {
        text = `Pure ${input.name} sourced from ${originLocation}.`;
      }
      break;
    case 'textile':
      text = `Handwoven ${input.name} crafted on looms in ${originLocation}.`;
      break;
    case 'clothing':
      text = `Authentic ${input.name} made in ${originLocation}.`;
      break;
    case 'craft':
      text = `Handcrafted ${input.name} made by artisans in ${originLocation}.`;
      break;
    default:
      text = `Authentic ${input.name} sourced from ${originLocation}.`;
      break;
  }
  return cleanSeoText(text, 160);
}
