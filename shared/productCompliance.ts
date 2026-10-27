/**
 * Category-specific publication checks.
 *
 * These rules are deliberately data-driven and kept in one place so the
 * marketplace owner can adjust them after legal/CA review without rewriting the
 * product workflow. They are publication gates, not a determination that a
 * product is legally compliant in every circumstance.
 */

export type ComplianceGroup = 'food' | 'textile' | 'clothing' | 'craft' | 'general';

export interface ComplianceField {
  key: string;
  label: string;
  message: string;
}

export interface ComplianceGuide {
  group: ComplianceGroup;
  label: string;
  summary: string;
  fields: ComplianceField[];
}

const FOOD_SLUGS = new Set([
  'fruits-and-fresh-produce',
  'tea-and-infusions',
  'dry-fruit-and-nuts',
  'pantry-and-preserves',
  'cold-pressed-oils',
  'pulses-and-staples',
  'food',
  'packaged-food',
  'honey',
  'pickles',
  'spices',
  'bakery',
]);

const CLOTHING_SLUGS = new Set(['knitwear', 'caps-and-headwear', 'clothing', 'apparel', 'accessories']);
const TEXTILE_SLUGS = new Set(['shawls-and-weaves', 'textiles', 'handloom', 'wool-textiles']);

function normalise(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function complianceGroupFor(categorySlug: string | null | undefined, categoryName?: string | null): ComplianceGroup {
  const slug = normalise(categorySlug);
  const name = normalise(categoryName);
  if (FOOD_SLUGS.has(slug) || /(food|tea|honey|pickle|oil|pulse|spice|bakery|fruit|nut|preserve)/.test(slug) || /(food|tea|honey|pickle|oil|pulse|spice|bakery|fruit|nut|preserve)/.test(name)) {
    return 'food';
  }
  if (CLOTHING_SLUGS.has(slug) || /(cloth|apparel|knitwear|cap|headwear|accessor)/.test(slug) || /(cloth|apparel|knitwear|cap|headwear|accessor)/.test(name)) {
    return 'clothing';
  }
  if (TEXTILE_SLUGS.has(slug) || /(textile|weave|shawl|wool|handloom)/.test(slug) || /(textile|weave|shawl|wool|handloom)/.test(name)) {
    return 'textile';
  }
  if (/(craft|wood|metal|pottery|jewel)/.test(slug) || /(craft|wood|metal|pottery|jewel)/.test(name)) {
    return 'craft';
  }
  return 'general';
}

export const COMPLIANCE_GUIDES: Record<ComplianceGroup, ComplianceGuide> = {
  food: {
    group: 'food',
    label: 'Food, farm and pantry products',
    summary:
      'Food listings need the applicable food-business registration or licence, ingredients, allergen declaration, net quantity, shelf life and storage guidance before publication.',
    fields: [
      { key: 'compliance.fssaiLicense', label: 'FSSAI registration / licence number', message: 'Enter the applicable 14-digit FSSAI registration or licence number.' },
      { key: 'compliance.ingredients', label: 'Ingredients', message: 'List the ingredients used in this product.' },
      { key: 'compliance.allergenInfo', label: 'Allergen declaration', message: 'Declare allergens, or state that none are known.' },
      { key: 'compliance.shelfLife', label: 'Shelf life / best before', message: 'State the shelf life or best-before period.' },
      { key: 'compliance.storage', label: 'Storage guidance', message: 'Describe how the product should be stored.' },
    ],
  },
  textile: {
    group: 'textile',
    label: 'Handloom and textiles',
    summary:
      'Textile listings should describe the material and making process, with dimensions, colour or variants and care guidance where they apply.',
    fields: [
      { key: 'materials', label: 'Material and composition', message: 'Describe the fibre or material composition.' },
    ],
  },
  clothing: {
    group: 'clothing',
    label: 'Clothing and accessories',
    summary:
      'Clothing and accessory listings need material, size guidance and care instructions so buyers can choose correctly.',
    fields: [
      { key: 'materials', label: 'Material and composition', message: 'Describe the fibre or material composition.' },
      { key: 'dimensions', label: 'Size or measurements', message: 'Add the size or key measurements.' },
      { key: 'careInstructions', label: 'Care instructions', message: 'Add washing and care instructions.' },
    ],
  },
  craft: {
    group: 'craft',
    label: 'Handicrafts',
    summary:
      'Craft listings should identify the materials, dimensions and making tradition. The product story and authentic photographs are reviewed manually.',
    fields: [{ key: 'materials', label: 'Material and composition', message: 'Describe the materials used.' }],
  },
  general: {
    group: 'general',
    label: 'General products',
    summary: 'Describe the product accurately, including materials and dispatch requirements where relevant.',
    fields: [],
  },
};

export function complianceGuideFor(categorySlug: string | null | undefined, categoryName?: string | null): ComplianceGuide {
  return COMPLIANCE_GUIDES[complianceGroupFor(categorySlug, categoryName)];
}

interface ComplianceProduct {
  materials: string | null;
  dimensions: string | null;
  care_instructions: string | null;
  weight_g: number | null;
  compliance_json: string | null;
}

function readCompliance(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => typeof value === 'string')
        .map(([key, value]) => [key, (value as string).trim()]),
    );
  } catch {
    return {};
  }
}

/**
 * Validate the fields that must be present before a product may be submitted
 * or approved. `sellerFssaiNumber` allows a food seller whose verified
 * application already records a licence to reuse it for every listing.
 */
export function validateProductCompliance(input: {
  categorySlug: string | null | undefined;
  categoryName?: string | null;
  product: ComplianceProduct;
  sellerFssaiNumber?: string | null;
}): { group: ComplianceGroup; errors: Record<string, string> } {
  const group = complianceGroupFor(input.categorySlug, input.categoryName);
  const errors: Record<string, string> = {};
  const compliance = readCompliance(input.product.compliance_json);

  if (group === 'food') {
    const licence = compliance.fssaiLicense || (input.sellerFssaiNumber ?? '').trim();
    if (!/^\d{14}$/.test(licence)) {
      errors['compliance.fssaiLicense'] = 'Enter the applicable 14-digit FSSAI registration or licence number.';
    }
    if ((compliance.ingredients ?? '').length < 3) {
      errors['compliance.ingredients'] = 'List the ingredients used in this product.';
    }
    if ((compliance.allergenInfo ?? '').length < 2) {
      errors['compliance.allergenInfo'] = 'Declare allergens, or state that none are known.';
    }
    if ((compliance.shelfLife ?? '').length < 2) {
      errors['compliance.shelfLife'] = 'State the shelf life or best-before period.';
    }
    if ((compliance.storage ?? '').length < 3) {
      errors['compliance.storage'] = 'Describe how the product should be stored.';
    }
    if (!input.product.weight_g || input.product.weight_g <= 0) {
      errors.weightG = 'Add the net packed weight so the declared quantity is accurate.';
    }
  }

  if (group === 'textile' || group === 'clothing' || group === 'craft') {
    if ((input.product.materials ?? '').trim().length < 3) {
      errors.materials = 'Describe the fibre or material composition.';
    }
  }

  if (group === 'clothing') {
    if ((input.product.dimensions ?? '').trim().length < 2) {
      errors.dimensions = 'Add the size or key measurements.';
    }
    if ((input.product.care_instructions ?? '').trim().length < 3) {
      errors.careInstructions = 'Add washing and care instructions.';
    }
  }

  return { group, errors };
}

export function firstComplianceError(errors: Record<string, string>): string {
  return Object.values(errors)[0] ?? 'Complete the category-specific product information before submitting.';
}
