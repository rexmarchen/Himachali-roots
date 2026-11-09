/**
 * Module 07: Product Categories
 * Bounded Context: Himalayan category taxonomy, sorting order, regional rules.
 */
import type { Db } from '../../db.js';
import { queryAll, queryOne } from '../../db.js';

export class CategoryService {
  static listActive(db: Db) {
    return queryAll<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      imageUrl: string | null;
      sortOrder: number;
    }>(
      db,
      `SELECT id, name, slug, description, image_url as imageUrl, sort_order as sortOrder
       FROM categories
       WHERE is_active = 1
       ORDER BY sort_order ASC, name ASC`,
    );
  }

  static findBySlug(db: Db, slug: string) {
    return queryOne(db, 'SELECT * FROM categories WHERE slug = ? AND is_active = 1', slug);
  }
}

