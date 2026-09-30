import type { Request, Response } from 'express';
import { getSyncSnapshot, saveSyncSnapshot } from '../src/server/accountStore.js';
import { requireAccount } from '../src/server/authHttp.js';

function sanitizeSnapshot(input: any) {
  const profile = input?.profile && typeof input.profile === 'object'
    ? { ...input.profile, entitlement: undefined }
    : null;
  return {
    schemaVersion: Number(input?.schemaVersion || 1),
    clientUpdatedAt: typeof input?.clientUpdatedAt === 'string' ? input.clientUpdatedAt : new Date().toISOString(),
    profile,
    stock: input?.stock && typeof input.stock === 'object' ? input.stock : {},
    stockTransactions: Array.isArray(input?.stockTransactions) ? input.stockTransactions.slice(0, 500) : [],
    dailyPlans: input?.dailyPlans && typeof input.dailyPlans === 'object' ? input.dailyPlans : {},
    meals: Array.isArray(input?.meals) ? input.meals.slice(0, 500) : [],
    weights: Array.isArray(input?.weights) ? input.weights.slice(0, 500) : [],
    preferences: Array.isArray(input?.preferences) ? input.preferences.slice(0, 200) : [],
  };
}

export default async function handler(req: Request, res: Response) {
  try {
    const session = await requireAccount(req, res);
    if (!session) return;

    if (req.method === 'GET') {
      const snapshot = await getSyncSnapshot(session.account.id);
      return res.status(200).json({ snapshot });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const snapshot = sanitizeSnapshot(req.body?.snapshot);
    const saved = await saveSyncSnapshot(session.account.id, snapshot);
    return res.status(200).json({ snapshot: saved, syncedAt: new Date().toISOString() });
  } catch (error) {
    console.error('[Sync API]', error);
    return res.status(500).json({ error: 'Senkronizasyon gerçekleştirilemedi.' });
  }
}
