import crypto from 'node:crypto';

/**
 * MfaService - RFC 6238 Time-Based One-Time Password (TOTP) Implementation
 * Built with Node.js native crypto for zero third-party dependencies.
 */
export class MfaService {
  private static readonly BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  private static readonly STEP_SECONDS = 30;

  /**
   * Generates a secure random 20-byte Base32-encoded TOTP secret.
   */
  static generateSecret(byteLength = 20): string {
    const bytes = crypto.randomBytes(byteLength);
    return MfaService.base32Encode(bytes);
  }

  /**
   * Formats a standard otpauth URL for QR code generation or manual entry into authenticator apps.
   */
  static getOtpAuthUri(account: string, secret: string, issuer = 'Dear Hills'): string {
    const encodedIssuer = encodeURIComponent(issuer);
    const encodedAccount = encodeURIComponent(account);
    return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=${MfaService.STEP_SECONDS}`;
  }

  /**
   * Generates the 6-digit TOTP code for a given timestamp (defaults to current time).
   */
  static generateToken(secretBase32: string, timeMs = Date.now()): string {
    const counter = Math.floor(timeMs / 1000 / MfaService.STEP_SECONDS);
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigInt64BE(BigInt(counter), 0);

    const secretKey = MfaService.base32Decode(secretBase32);
    const hmac = crypto.createHmac('sha1', secretKey).update(counterBuf).digest();

    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const otp = (code % 1_000_000).toString().padStart(6, '0');
    return otp;
  }

  /**
   * Verifies a user-supplied 6-digit token against the secret.
   * Tolerates ±1 time step (±30 seconds) clock drift.
   */
  static verifyToken(secretBase32: string, token: string, windowSteps = 1): boolean {
    if (!token || !/^\d{6}$/.test(token.trim())) {
      return false;
    }
    const cleanToken = token.trim();
    const now = Date.now();

    for (let step = -windowSteps; step <= windowSteps; step++) {
      const checkTime = now + step * MfaService.STEP_SECONDS * 1000;
      const expected = MfaService.generateToken(secretBase32, checkTime);
      if (crypto.timingSafeEqual(Buffer.from(cleanToken), Buffer.from(expected))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Encodes a buffer to RFC 4648 Base32 without padding.
   */
  private static base32Encode(buffer: Buffer): string {
    let bits = 0;
    let value = 0;
    let output = '';

    for (let i = 0; i < buffer.length; i++) {
      value = (value << 8) | buffer[i];
      bits += 8;

      while (bits >= 5) {
        output += MfaService.BASE32_CHARS[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }

    if (bits > 0) {
      output += MfaService.BASE32_CHARS[(value << (5 - bits)) & 31];
    }

    return output;
  }

  /**
   * Decodes an RFC 4648 Base32 string to a Buffer.
   */
  private static base32Decode(encoded: string): Buffer {
    const cleaned = encoded.toUpperCase().replace(/=+$/, '');
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];

    for (let i = 0; i < cleaned.length; i++) {
      const idx = MfaService.BASE32_CHARS.indexOf(cleaned[i]);
      if (idx === -1) continue;

      value = (value << 5) | idx;
      bits += 5;

      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }

    return Buffer.from(bytes);
  }
}

