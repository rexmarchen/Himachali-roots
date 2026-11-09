import crypto from 'node:crypto';

export class PasswordService {
  /**
   * Hashes a password using Argon2id (RFC 9106) with memory hardness and timing safety.
   */
  static hash(password: string): string {
    const salt = crypto.randomBytes(16);
    const isTest = process.env.NODE_ENV === 'test';
    // Production: 64MB memory, 3 passes. Test: 1MB memory, 1 pass for fast automated test suites.
    const memory = isTest ? 1024 : 65536;
    const passes = isTest ? 1 : 3;

    const hash = crypto.argon2Sync('argon2id', {
      message: Buffer.from(password),
      nonce: salt,
      parallelism: 1,
      memory,
      passes,
      tagLength: 32,
    });
    return ['argon2id', memory, passes, 1, salt.toString('hex'), hash.toString('hex')].join('$');
  }

  /**
   * Verifies a plain text password against either an Argon2id or legacy scrypt hash.
   */
  static verify(password: string, stored: string): boolean {
    if (!stored || typeof stored !== 'string') return false;

    try {
      const parts = stored.split('$');
      const scheme = parts[0];

      if (scheme === 'argon2id') {
        const [, m, t, p, saltHex, hashHex] = parts;
        if (!m || !t || !p || !saltHex || !hashHex) return false;

        const expected = Buffer.from(hashHex, 'hex');
        const actual = crypto.argon2Sync('argon2id', {
          message: Buffer.from(password),
          nonce: Buffer.from(saltHex, 'hex'),
          parallelism: Number(p),
          memory: Number(m),
          passes: Number(t),
          tagLength: expected.length,
        });

        return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
      }

      if (scheme === 'scrypt') {
        const [, n, r, p, salt, hashHex] = parts;
        if (!n || !r || !p || !salt || !hashHex) return false;

        const expected = Buffer.from(hashHex, 'hex');
        const actual = crypto.scryptSync(password, salt, expected.length, {
          N: Number(n),
          r: Number(r),
          p: Number(p),
          maxmem: 64 * 1024 * 1024,
        });

        return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Returns true if the stored hash should be upgraded to Argon2id upon next successful login.
   */
  static needsRehash(stored: string): boolean {
    return !stored.startsWith('argon2id$');
  }
}
