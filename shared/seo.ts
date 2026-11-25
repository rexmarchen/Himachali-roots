import { complianceGroupFor } from './productCompliance.js';

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
      return `${input.name} — Authentic Himachali Knitwear & Apparel | Dear Hills`;
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
