import type { SyncSnapshot } from '../types.js';
import {
  STORAGE_KEYS,
  getPendingMutations,
  acknowledgePendingMutation,
  getStoredProfile,
  getStoredStock,
  getStoredStockTransactions,
  getStoredDailyPlans,
  getStoredMeals,
  getStoredWeights,
  getStoredPreferences,
} from '../storage/storageAbstraction.js';

function latestLocalTimestamp(): string {
  const pending = getPendingMutations();
  const candidates = [
    ...pending.map((m) => m.createdAt),
    getStoredProfile()?.updatedAt,
    ...Object.values(getStoredDailyPlans()).map((p) => p.updatedAt || p.createdAt),
    ...getStoredMeals().map((m) => m.createdAt),
    ...getStoredWeights().map((w) => w.createdAt),
    ...Object.values(getStoredStock()).map((s) => s.updatedAt),
  ].filter(Boolean) as string[];
  return candidates.sort().at(-1) || new Date(0).toISOString();
}

export function buildLocalSyncSnapshot(): SyncSnapshot {
  return {
    schemaVersion: 3,
    clientUpdatedAt: latestLocalTimestamp(),
    profile: (() => {
      const profile = getStoredProfile();
      return profile ? { ...profile, entitlement: undefined } : null;
    })(),
    stock: getStoredStock(),
    stockTransactions: getStoredStockTransactions(),
    dailyPlans: getStoredDailyPlans(),
    meals: getStoredMeals(),
    weights: getStoredWeights(),
    preferences: getStoredPreferences(),
  };
}

function applyRemoteSnapshot(snapshot: SyncSnapshot): void {
  if (typeof window === 'undefined') return;
  if (snapshot.profile) {
    const current = getStoredProfile();
    const merged = current ? { ...snapshot.profile, entitlement: current.entitlement } : snapshot.profile;
    localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(merged));
  }
  localStorage.setItem(STORAGE_KEYS.USER_STOCK, JSON.stringify(snapshot.stock || {}));
  localStorage.setItem(STORAGE_KEYS.STOCK_TRANSACTIONS, JSON.stringify(snapshot.stockTransactions || []));
  localStorage.setItem(STORAGE_KEYS.DAILY_PLANS, JSON.stringify(snapshot.dailyPlans || {}));
  localStorage.setItem(STORAGE_KEYS.MEALS, JSON.stringify(snapshot.meals || []));
  localStorage.setItem(STORAGE_KEYS.WEIGHTS, JSON.stringify(snapshot.weights || []));
  localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(snapshot.preferences || []));
}

export interface SyncResult {
  status: 'synced' | 'remote_applied' | 'skipped' | 'offline' | 'error';
  pendingCount: number;
}

export async function syncNow(): Promise<SyncResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { status: 'offline', pendingCount: getPendingMutations().length };
  }

  const pending = getPendingMutations();
  const local = buildLocalSyncSnapshot();

  try {
    const remoteResponse = await fetch('/api/sync', { credentials: 'include' });
    if (remoteResponse.status === 401) {
      return { status: 'skipped', pendingCount: pending.length };
    }

    const remoteData = await remoteResponse.json().catch(() => ({}));
    const remote = remoteData.snapshot as SyncSnapshot | null;

    if (remote && new Date(remote.clientUpdatedAt).getTime() > new Date(local.clientUpdatedAt).getTime()) {
      applyRemoteSnapshot(remote);
      pending.forEach((mutation) => acknowledgePendingMutation(mutation.id));
      return { status: 'remote_applied', pendingCount: 0 };
    }

    if (!remote || pending.length > 0 || new Date(local.clientUpdatedAt).getTime() >= new Date(remote.clientUpdatedAt).getTime()) {
      const response = await fetch('/api/sync', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot: local }),
      });
      if (!response.ok) throw new Error('Sync request failed');
      const data = await response.json();
      const saved = data.snapshot as SyncSnapshot | undefined;
      if (saved && new Date(saved.clientUpdatedAt).getTime() > new Date(local.clientUpdatedAt).getTime()) {
        applyRemoteSnapshot(saved);
      }
      pending.forEach((mutation) => acknowledgePendingMutation(mutation.id));
      return { status: 'synced', pendingCount: 0 };
    }

    return { status: 'synced', pendingCount: pending.length };
  } catch (error) {
    console.warn('[Sync] deferred:', error);
    return { status: 'error', pendingCount: pending.length };
  }
}
