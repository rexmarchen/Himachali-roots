import { OAuth2Client } from 'google-auth-library';
import { env } from '../env.js';
import { AppError } from './http.js';

/**
 * Google Identity Services ID-token verification.
 *
 * The browser receives a signed ID token from Google and posts it here. We
 * verify it with Google's official library (signature, issuer, audience and
 * expiry) and then re-check the claims we make security decisions on. An
 * unverified JWT is never decoded and trusted.
 */

const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const VERIFY_TIMEOUT_MS = 10_000;

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

export interface GoogleTokenClaims {
  iss?: string;
  aud?: string;
  exp?: number;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

/** Pure claim checks, separated so they can be tested without network access. */
export function profileFromClaims(payload: GoogleTokenClaims, expectedAudience: string): GoogleProfile {
  if (!payload.iss || !GOOGLE_ISSUERS.has(payload.iss)) throw invalidToken();
  if (payload.aud !== expectedAudience) throw invalidToken();
  if (!payload.exp || payload.exp * 1000 <= Date.now()) throw invalidToken('That Google sign-in has expired. Please try again.');
  if (!payload.sub || payload.sub.length < 6 || payload.sub.length > 255) throw invalidToken();
  if (!payload.email) {
    throw new AppError(403, 'google_email_missing', 'Google did not share an email address for this account.');
  }
  if (payload.email_verified !== true) {
    throw new AppError(
      403,
      'google_email_unverified',
      'Google has not verified that email address. Verify it with Google, then try again.',
    );
  }
  return {
    sub: payload.sub,
    email: payload.email.trim().toLowerCase(),
    emailVerified: true,
    name: payload.name?.trim().slice(0, 120) || null,
    picture: payload.picture?.trim().slice(0, 500) || null,
  };
}

let client: OAuth2Client | null = null;

function googleClient(): OAuth2Client {
  if (!client) client = new OAuth2Client(env.googleClientId);
  return client;
}

function invalidToken(message = 'That Google sign-in could not be verified. Please try again.'): AppError {
  return new AppError(401, 'google_token_invalid', message);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('google_verification_timeout')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function verifyGoogleIdToken(credential: string): Promise<GoogleProfile> {
  if (!env.googleClientId) {
    throw new AppError(
      503,
      'google_not_configured',
      'Google sign-in is not configured on this server. Use email and password, or contact support.',
    );
  }
  if (typeof credential !== 'string' || credential.length < 20 || credential.length > 8192) {
    throw invalidToken();
  }

  let payload;
  try {
    const ticket = await withTimeout(
      googleClient().verifyIdToken({ idToken: credential, audience: env.googleClientId }),
      VERIFY_TIMEOUT_MS,
    );
    payload = ticket.getPayload();
  } catch {
    // Never surface library errors or token contents to the client or logs.
    throw invalidToken();
  }

  if (!payload) throw invalidToken();
  return profileFromClaims(payload as GoogleTokenClaims, env.googleClientId);
}
