/**
 * Module 02: User Management
 * Bounded Context: User entities, roles (customer, seller, admin), account status.
 */
import type { Db } from '../../db.js';
import { queryAll, queryOne, execute } from '../../db.js';
import type { Role } from '../../../shared/types.js';

export class UserService {
  static getRoles(db: Db, userId: string): Role[] {
    return queryAll<{ role: Role }>(db, 'SELECT role FROM user_roles WHERE user_id = ?', userId).map((r) => r.role);
  }

  static assignRole(db: Db, userId: string, role: Role): void {
    const existing = queryOne(db, 'SELECT 1 FROM user_roles WHERE user_id = ? AND role = ?', userId, role);
    if (!existing) {
      execute(db, 'INSERT INTO user_roles (user_id, role) VALUES (?, ?)', userId, role);
    }
  }

  static setAccountDisabled(db: Db, userId: string, disabled: boolean): void {
    execute(db, 'UPDATE users SET is_disabled = ? WHERE id = ?', disabled ? 1 : 0, userId);
  }
}
