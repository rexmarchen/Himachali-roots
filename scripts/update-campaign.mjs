import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/pahadi-roots.db');

db.prepare(`
  UPDATE campaigns
  SET name = 'Pahadi Seasonal Collection',
      description = 'A curated seasonal collection from Himachali makers: handwoven wool, Kangra tea, orchard walnuts, wildflower honey and Chamba embroidery. Only the products listed in this offer carry a promotional price.',
      poster_url = '/images/campaigns/dearhills-christmas-campaign-1672.webp',
      poster_alt = 'Dear Hills Seasonal Collection — Pure Himalayan Craft and Mountain Harvest.'
  WHERE slug = 'pahadi-festive-glow' OR slug LIKE '%diwali%'
`).run();

console.log('Updated campaign:', db.prepare('SELECT id, name, slug, poster_url, description FROM campaigns').all());
