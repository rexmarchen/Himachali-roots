import crypto from 'node:crypto';
import { env } from '../env.js';

interface EncryptedEnvelope {
  __enc: 'v1';
  iv: string;
  tag: string;
  ct: string;
}

function derivedKey(): Buffer | null {
  if (!env.payoutEncryptionKey) return null;
  return crypto.createHash('sha256').update(env.payoutEncryptionKey).digest();
}

/**
 * Encrypts sensitive seller payout details using AES-256-GCM when
 * PAYOUT_ENCRYPTION_KEY is configured, while remaining backward-compatible with
 * deployments storing legacy plaintext JSON records.
 */
export function encryptPayoutDetails(details: Record<string, unknown>): string {
  const key = derivedKey();
  const plaintext = JSON.stringify(details);
  if (!key) return plaintext;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const envelope: EncryptedEnvelope = {
    __enc: 'v1',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ciphertext.toString('base64'),
  };
  return JSON.stringify(envelope);
}

export function decryptPayoutDetails(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Partial<EncryptedEnvelope>;
    if (candidate.__enc === 'v1' && candidate.iv && candidate.tag && candidate.ct) {
      const key = derivedKey();
      if (!key) return null;
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(candidate.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(candidate.tag, 'base64'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(candidate.ct, 'base64')),
        decipher.final(),
      ]).toString('utf8');
      const inner = JSON.parse(plaintext) as unknown;
      return inner && typeof inner === 'object' ? (inner as Record<string, unknown>) : null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
