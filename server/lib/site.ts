import { queryAll, queryOne, type Db } from '../db.js';
import { DEFAULT_CONTENT } from '../content/defaults.js';
import type { PolicyDocument, PolicyKey, SiteContent } from '../../shared/content.js';
import { POLICY_KEYS } from '../../shared/content.js';
import { notFound } from './http.js';

type ContentKey = Exclude<keyof SiteContent, 'policies'> | 'policies';

export function getSiteContent(db: Db): SiteContent {
  const rows = queryAll<{ key: string; value_json: string }>(db, 'SELECT key, value_json FROM site_content');
  const overrides = new Map<string, unknown>();
  for (const row of rows) {
    try {
      overrides.set(row.key, JSON.parse(row.value_json));
    } catch {
      // Ignore malformed content rather than taking the storefront down.
    }
  }
  const merged: SiteContent = {
    ...DEFAULT_CONTENT,
    announcement: { ...DEFAULT_CONTENT.announcement, ...(overrides.get('announcement') as object | undefined) },
    homepage: { ...DEFAULT_CONTENT.homepage, ...(overrides.get('homepage') as object | undefined) },
    about: { ...DEFAULT_CONTENT.about, ...(overrides.get('about') as object | undefined) },
    sourcing: { ...DEFAULT_CONTENT.sourcing, ...(overrides.get('sourcing') as object | undefined) },
    faq: { ...DEFAULT_CONTENT.faq, ...(overrides.get('faq') as object | undefined) },
    credits: { ...DEFAULT_CONTENT.credits, ...(overrides.get('credits') as object | undefined) },
    policies: { ...DEFAULT_CONTENT.policies },
  };
  const policyOverrides = overrides.get('policies') as Record<string, PolicyDocument> | undefined;
  if (policyOverrides) {
    for (const key of POLICY_KEYS) {
      if (policyOverrides[key]) merged.policies[key] = policyOverrides[key];
    }
  }
  return merged;
}

export function getPolicy(db: Db, key: string): PolicyDocument {
  if (!POLICY_KEYS.includes(key as PolicyKey)) throw notFound('Policy not found.');
  const policies = getSiteContent(db).policies;
  const policy = policies[key];
  if (!policy) throw notFound('Policy not found.');
  return policy;
}

export function setSiteContent(db: Db, key: ContentKey, value: unknown, actorId: string): void {
  queryOne(db, 'SELECT 1');
  db.prepare(
    `INSERT INTO site_content (key, value_json, updated_by) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  ).run(key, JSON.stringify(value), actorId);
}
