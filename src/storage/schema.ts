export interface StorageMigration {
  fromVersion: number;
  toVersion: number;
  migrate: (key: string, value: unknown) => unknown;
}

/** Single authoritative version for persisted browser data. */
export const STORAGE_SCHEMA_VERSION = 4;
