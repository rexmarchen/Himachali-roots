import type { DatabaseSync } from 'node:sqlite';
import type { DatabasePort, ExecuteResult, SqlValue } from './DatabasePort.js';

export class SqliteAdapter implements DatabasePort {
  private readonly db: DatabaseSync;
  private txDepth = 0;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  get raw(): DatabaseSync {
    return this.db;
  }

  queryAll<T>(sql: string, ...params: SqlValue[]): T[] {
    const sanitized = this.sanitizeParams(params);
    return this.db.prepare(sql).all(...sanitized) as T[];
  }

  queryOne<T>(sql: string, ...params: SqlValue[]): T | undefined {
    const sanitized = this.sanitizeParams(params);
    return this.db.prepare(sql).get(...sanitized) as T | undefined;
  }

  execute(sql: string, ...params: SqlValue[]): ExecuteResult {
    const sanitized = this.sanitizeParams(params);
    const result = this.db.prepare(sql).run(...sanitized) as { changes: number; lastInsertRowid: number | bigint };
    return {
      changes: result.changes,
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  tx<T>(fn: (txDb: DatabasePort) => T): T {
    const depth = this.txDepth;
    const savepoint = `sp_${depth}`;
    this.db.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
    this.txDepth = depth + 1;
    try {
      const result = fn(this);
      this.db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${savepoint}`);
      return result;
    } catch (error) {
      try {
        this.db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
      } catch {
        // SQLite may already have marked transaction as failed
      }
      throw error;
    } finally {
      this.txDepth = depth;
    }
  }

  ping(): boolean {
    try {
      const row = this.db.prepare('SELECT 1 as alive').get() as { alive: number } | undefined;
      return row?.alive === 1;
    } catch {
      return false;
    }
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      // Ignored if already closed
    }
  }

  private sanitizeParams(params: SqlValue[]): (string | number | null | Uint8Array)[] {
    return params.map((p) => {
      if (p === undefined || p === null) return null;
      if (typeof p === 'boolean') return p ? 1 : 0;
      if (p instanceof Date) return p.toISOString();
      return p;
    });
  }
}

