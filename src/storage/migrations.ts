import type { StorageMigration } from './schema.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Versioned, additive local-storage migrations. Migrations must never discard an
 * unknown field: this lets newer app versions preserve data written by older ones.
 */
export const STORAGE_MIGRATIONS: StorageMigration[] = [
  {
    // Fresh installs and legacy installs without a schema marker start at v0.
    // Keep this step additive/no-op so the existing v3-to-v4 migration still runs.
    fromVersion: 0,
    toVersion: 1,
    migrate: (_key, value) => value,
  },
  {
    fromVersion: 1,
    toVersion: 2,
    migrate: (_key, value) => value,
  },
  {
    fromVersion: 2,
    toVersion: 3,
    migrate: (_key, value) => value,
  },
  {
    fromVersion: 3,
    toVersion: 4,
    migrate: (key, value) => {
      const record = asRecord(value);
      if (!record) {
        if (Array.isArray(value)) {
          return value.map((item) => {
            const row = asRecord(item);
            return row ? { ...row, schemaVersion: 4 } : item;
          });
        }
        return value;
      }

      if (key === 'nutrishake_profile') {
        return {
          ...record,
          favoriteIngredientIds: Array.isArray(record.favoriteIngredientIds) ? record.favoriteIngredientIds : [],
          forbiddenIngredientIds: Array.isArray(record.forbiddenIngredientIds) ? record.forbiddenIngredientIds : [],
          goalSettings: asRecord(record.goalSettings) ?? {},
          schemaVersion: 4,
        };
      }

      if (key === 'nutrishake_notification_preferences') {
        return {
          ...record,
          enabled: Boolean(record.enabled),
          breakfastReminder: Boolean(record.breakfastReminder),
          shakeReminder: Boolean(record.shakeReminder),
          weightReminder: Boolean(record.weightReminder),
          lowStockReminder: Boolean(record.lowStockReminder),
          schemaVersion: 4,
        };
      }

      const mapKeys = new Set([
        'nutrishake_daily_plans',
        'nutrishake_user_stock',
        'nutrishake_preferences',
      ]);
      if (mapKeys.has(key)) {
        const migratedEntries: Record<string, unknown> = {};
        for (const [entryKey, entryValue] of Object.entries(record)) {
          const entry = asRecord(entryValue);
          migratedEntries[entryKey] = entry ? { ...entry, schemaVersion: 4 } : entryValue;
        }
        return migratedEntries;
      }
      return { ...record, schemaVersion: 4 };
    },
  },
];

export function migrateStoredValue(key: string, value: unknown, fromVersion: number, toVersion: number): unknown {
  let current = value;
  let version = Math.max(0, Math.floor(fromVersion));
  while (version < toVersion) {
    const migration = STORAGE_MIGRATIONS.find((item) => item.fromVersion === version && item.toVersion === version + 1);
    if (!migration) {
      // Fail closed: preserve the original data if a migration path is incomplete.
      return value;
    }
    current = migration.migrate(key, current);
    version = migration.toVersion;
  }
  return current;
}
