import { describe, expect, it } from 'vitest';
import { complianceGroupFor, validateProductCompliance } from '../lib/productCompliance.js';

const baseProduct = {
  materials: null as string | null,
  dimensions: null as string | null,
  care_instructions: null as string | null,
  weight_g: 500 as number | null,
  compliance_json: null as string | null,
};

const completeFood = JSON.stringify({
  fssaiLicense: '12345678901234',
  ingredients: 'Himalayan apples, cane sugar, lemon juice',
  allergenInfo: 'None known',
  shelfLife: '12 months from packing',
  storage: 'Store in a cool dry place away from direct sunlight',
});

describe('category publication compliance', () => {
  it('classifies the seeded category slugs and legacy test slugs', () => {
    expect(complianceGroupFor('tea-and-infusions')).toBe('food');
    expect(complianceGroupFor('pantry-and-preserves')).toBe('food');
    expect(complianceGroupFor('shawls-and-weaves')).toBe('textile');
    expect(complianceGroupFor('test-weaves')).toBe('textile');
    expect(complianceGroupFor('knitwear')).toBe('clothing');
    expect(complianceGroupFor('caps-and-headwear')).toBe('clothing');
    expect(complianceGroupFor('woodcraft')).toBe('craft');
    expect(complianceGroupFor('fruits-and-fresh-produce')).toBe('raw_produce');
    expect(complianceGroupFor('stationery')).toBe('general');
  });

  it('requires food declarations before publication', () => {
    const { group, errors } = validateProductCompliance({
      categorySlug: 'pantry-and-preserves',
      product: baseProduct,
    });
    expect(group).toBe('food');
    expect(errors).toMatchObject({
      'compliance.fssaiLicense': expect.any(String),
      'compliance.ingredients': expect.any(String),
      'compliance.allergenInfo': expect.any(String),
      'compliance.shelfLife': expect.any(String),
      'compliance.storage': expect.any(String),
    });
  });

  it('accepts a complete food declaration and reuses a verified seller licence', () => {
    const complete = validateProductCompliance({
      categorySlug: 'pantry-and-preserves',
      product: { ...baseProduct, compliance_json: completeFood },
    });
    expect(complete.errors).toEqual({});

    const withoutListingLicence = JSON.parse(completeFood) as Record<string, string>;
    delete withoutListingLicence.fssaiLicense;
    const reused = validateProductCompliance({
      categorySlug: 'pantry-and-preserves',
      product: { ...baseProduct, compliance_json: JSON.stringify(withoutListingLicence) },
      sellerFssaiNumber: '12345678901234',
    });
    expect(reused.errors).toEqual({});

    const invalidLicence = validateProductCompliance({
      categorySlug: 'pantry-and-preserves',
      product: { ...baseProduct, compliance_json: JSON.stringify({ ...withoutListingLicence, fssaiLicense: '123' }) },
    });
    expect(invalidLicence.errors['compliance.fssaiLicense']).toBeTruthy();
  });

  it('requires materials for textiles and crafts, and size plus care for clothing', () => {
    const textile = validateProductCompliance({ categorySlug: 'shawls-and-weaves', product: baseProduct });
    expect(textile.errors).toEqual({ materials: expect.any(String) });

    const craft = validateProductCompliance({ categorySlug: 'woodcraft', product: baseProduct });
    expect(craft.errors).toEqual({ materials: expect.any(String) });

    const clothing = validateProductCompliance({ categorySlug: 'knitwear', product: baseProduct });
    expect(clothing.errors).toMatchObject({
      materials: expect.any(String),
      dimensions: expect.any(String),
      careInstructions: expect.any(String),
    });

    const complete = validateProductCompliance({
      categorySlug: 'knitwear',
      product: { ...baseProduct, materials: 'Hand-knitted sheep wool', dimensions: 'Chest 104 cm', care_instructions: 'Hand wash cold, dry flat' },
    });
    expect(complete.errors).toEqual({});
  });

  it('does not apply food or textile rules to a general category', () => {
    const result = validateProductCompliance({ categorySlug: 'stationery', product: baseProduct });
    expect(result.group).toBe('general');
    expect(result.errors).toEqual({});
  });

  it('requires harvest transparency, not packaged-food labelling, for fresh produce', () => {
    const missing = validateProductCompliance({ categorySlug: 'fruits-and-fresh-produce', product: baseProduct });
    expect(missing.group).toBe('raw_produce');
    expect(missing.errors).toMatchObject({
      varietyGrade: expect.any(String),
      harvestInfo: expect.any(String),
      dispatchConditions: expect.any(String),
    });
    expect(missing.errors['compliance.fssaiLicense']).toBeUndefined();
    expect(missing.errors['compliance.ingredients']).toBeUndefined();

    const complete = validateProductCompliance({
      categorySlug: 'fruits-and-fresh-produce',
      product: {
        ...baseProduct,
        variety_grade: 'Royal Delicious · Extra Fancy',
        harvest_info: 'October 2026 harvest, Kotgarh valley',
        dispatch_conditions: 'Ventilated 5-ply cartons, 48-hour express dispatch',
      },
    });
    expect(complete.errors).toEqual({});
  });
});
