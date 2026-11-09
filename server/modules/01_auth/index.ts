/**
 * Module 01: Authentication & Authorization
 * Bounded Context: User identity, sessions, credentials, Google OAuth, password reset, Argon2id hashing.
 */
export * from '../../core/security/PasswordService.js';
export * from '../../core/security/RbacService.js';
export {
  createSession,
  destroySession,
  rotateSession,
  getSessionUser,
  buildSessionUser,
  sessionToken,
  SESSION_COOKIE,
  hasUsablePassword,
  verifyPassword,
  hashPassword,
} from '../../lib/auth.js';
