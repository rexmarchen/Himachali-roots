import { SqliteAdapter } from './SqliteAdapter.js';
import { PostgresAdapter } from './PostgresAdapter.js';
import type { DatabasePort } from './DatabasePort.js';
import type { DatabaseSync } from 'node:sqlite';

export * from './DatabasePort.js';
export * from './SqliteAdapter.js';
export * from './PostgresAdapter.js';

let defaultPort: DatabasePort | null = null;

export function setDatabasePort(port: DatabasePort): void {
  defaultPort = port;
}

export function getDatabasePort(): DatabasePort {
  if (!defaultPort) {
    throw new Error('DatabasePort has not been initialized. Call initDatabasePort() first.');
  }
  return defaultPort;
}

export function createDatabasePort(config: { driver: 'sqlite' | 'postgres'; sqliteDb?: DatabaseSync; connectionString?: string }): DatabasePort {
  if (config.driver === 'postgres' && config.connectionString) {
    return new PostgresAdapter(config.connectionString);
  }
  if (!config.sqliteDb) {
    throw new Error('SqliteAdapter requires an initialized DatabaseSync instance.');
  }
  return new SqliteAdapter(config.sqliteDb);
}

