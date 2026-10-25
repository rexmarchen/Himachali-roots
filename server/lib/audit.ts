import type { Db } from '../db.js';
import { execute } from '../db.js';
import { newId } from './ids.js';
import type { SessionUser } from '../../shared/types.js';

const SENSITIVE_KEYS = /password|secret|token|hash|authorization|card|cvv|document|file_path/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEYS.test(key) ? '[redacted]' : redact(val, depth + 1);
    }
    return out;
  }
  return value;
}

/** Append-only audit trail for privileged and money-affecting actions. */
export function audit(
  db: Db,
  actor: Pick<SessionUser, 'id' | 'email'> | null,
  action: string,
  entityType: string,
  entityId: string,
  before?: unknown,
  after?: unknown,
): void {
  execute(
    db,
    `INSERT INTO audit_logs (id, actor_id, actor_email, action, entity_type, entity_id, before_json, after_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    newId('aud_'),
    actor?.id ?? null,
    actor?.email ?? null,
    action,
    entityType,
    entityId,
    before === undefined ? null : JSON.stringify(redact(before)),
    after === undefined ? null : JSON.stringify(redact(after)),
  );
}
