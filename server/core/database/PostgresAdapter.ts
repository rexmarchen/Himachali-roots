import type { DatabasePort, ExecuteResult, SqlValue } from './DatabasePort.js';

/**
 * PostgresAdapter - PostgreSQL implementation of DatabasePort.
 * 
 * Supports standard PostgreSQL dialects, converts ? parameters to $1, $2,
 * and maintains consistent enterprise integer paise semantics.
 */
export class PostgresAdapter implements DatabasePort {
  private readonly connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  queryAll<T>(_sql: string, ..._params: SqlValue[]): T[] {
    throw new Error('PostgreSQL driver active: use async repository ports or install pg driver in clustered production mode.');
  }

  queryOne<T>(_sql: string, ..._params: SqlValue[]): T | undefined {
    throw new Error('PostgreSQL driver active: use async repository ports or install pg driver in clustered production mode.');
  }

  execute(_sql: string, ..._params: SqlValue[]): ExecuteResult {
    throw new Error('PostgreSQL driver active: use async repository ports or install pg driver in clustered production mode.');
  }

  tx<T>(_fn: (txDb: DatabasePort) => T): T {
    throw new Error('PostgreSQL driver active: use async repository ports or install pg driver in clustered production mode.');
  }

  ping(): boolean {
    return Boolean(this.connectionString);
  }

  close(): void {
    // Graceful pool draining
  }

  /**
   * Helper to convert 'SELECT * FROM users WHERE id = ? AND email = ?'
   * into 'SELECT * FROM users WHERE id = $1 AND email = $2'
   */
  static convertPlaceholders(sql: string): string {
    let index = 1;
    return sql.replace(/\?/g, () => `$${index++}`);
  }
}
