import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/pahadi-roots.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();

for (const t of tables) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${t.name})`).all();
    const textCols = cols.filter(c => (c.type || '').toUpperCase().includes('CHAR') || (c.type || '').toUpperCase().includes('TEXT') || c.type === '').map(c => c.name);
    for (const c of textCols) {
      const match = db.prepare(`SELECT rowid, * FROM ${t.name} WHERE ${c} LIKE '%diwali%' OR ${c} LIKE '%Diwali%' OR ${c} LIKE '%Shubh%'`).all();
      if (match.length > 0) {
        console.log(`=== Found in ${t.name}.${c} ===`);
        console.log(JSON.stringify(match, null, 2));
      }
    }
  } catch (e) {
    console.error(`Error checking ${t.name}:`, e.message);
  }
}
