import type { SessionUser, Role } from '../../../shared/types.js';
import { forbidden, unauthorized } from '../../lib/http.js';

export class RbacService {
  /**
   * Asserts user is authenticated
   */
  static assertAuthenticated(user: SessionUser | null | undefined): asserts user is SessionUser {
    if (!user) {
      throw unauthorized('Authentication required.');
    }
  }

  /**
   * Asserts user has a required role (e.g. 'admin', 'seller', 'customer')
   */
  static assertRole(user: SessionUser | null | undefined, requiredRole: Role): asserts user is SessionUser {
    RbacService.assertAuthenticated(user);
    if (!user.roles.includes(requiredRole)) {
      throw forbidden(`Access forbidden. Required role: ${requiredRole}.`);
    }
  }

  /**
   * Asserts tenant isolation for sellers:
   * Prevents Broken Object Level Authorization (BOLA).
   * Administrators bypass; sellers can ONLY view or modify their own tenant resources.
   */
  static assertSellerTenantAccess(user: SessionUser | null | undefined, sellerId: string): void {
    RbacService.assertAuthenticated(user);
    if (user.roles.includes('admin')) {
      return; // Administrator has multi-tenant operational visibility
    }
    if (!user.roles.includes('seller') || user.sellerId !== sellerId) {
      throw forbidden('Access denied: You cannot access or modify another seller’s resources.');
    }
  }

  /**
   * Asserts customer object-level access:
   * Customers can ONLY view or modify their own private orders, addresses, or profile data.
   */
  static assertCustomerAccess(user: SessionUser | null | undefined, targetUserId: string): void {
    RbacService.assertAuthenticated(user);
    if (user.roles.includes('admin')) {
      return; // Admin operational override
    }
    if (user.id !== targetUserId) {
      throw forbidden('Access denied: You cannot access another customer’s private records.');
    }
  }
}

