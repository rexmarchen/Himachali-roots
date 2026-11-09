/**
 * DatabasePort - Hexagonal Architecture Port for Database Operations
 * 
 * Defines the contract for all persistence operations across Dear Hills.
 * Implemented by SqliteAdapter (for local dev & fast tests) and PostgresAdapter (for production cluster).
 */

export type SqlValue = string | number | boolean | null | undefined | Uint8Array | Date;

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface ExecuteResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface DatabasePort {
  /** Execute a query returning multiple typed rows */
  queryAll<T>(sql: string, ...params: SqlValue[]): T[];

  /** Execute a query returning a single typed row or undefined */
  queryOne<T>(sql: string, ...params: SqlValue[]): T | undefined;

  /** Execute a mutating SQL statement (INSERT, UPDATE, DELETE) */
  execute(sql: string, ...params: SqlValue[]): ExecuteResult;

  /** Run a synchronous or asynchronous transaction with savepoint support */
  tx<T>(fn: (txDb: DatabasePort) => T): T;

  /** Check database connectivity and readiness */
  ping(): boolean;

  /** Close connection pool or database handle */
  close(): void;
}

