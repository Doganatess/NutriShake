import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { SyncSnapshot } from '../types/index.js';

export interface ServerEntitlement {
  plan: 'free' | 'premium';
  status: 'active' | 'trial' | 'expired' | 'cancelled';
  trialStartedAt?: string;
  trialExpiresAt?: string;
  expiresAt?: string;
  provider?: string;
  productId?: string;
  customerId?: string;
  subscriptionId?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
}

export interface ServerAccount {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  entitlement: ServerEntitlement;
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const TRIAL_DAYS = 7;

function assertStoreConfigured() {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error('Server-side account store is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
  }
}

async function redis(command: string, ...args: string[]): Promise<any> {
  assertStoreConfigured();
  const restUrl = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const encoded = [command, ...args].map((value) => encodeURIComponent(value));
  const response = await fetch(`${restUrl}/${encoded.join('/')}`, {
    headers: { Authorization: `Bearer ${restToken}` },
  });
  if (!response.ok) throw new Error(`Redis request failed (${response.status}).`);
  const payload = await response.json() as { result?: unknown; error?: string };
  if (payload.error) throw new Error(payload.error);
  return payload.result;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function accountKey(id: string) { return `nutrishake:account:${id}`; }
function emailKey(email: string) { return `nutrishake:account-email:${normalizeEmail(email)}`; }
function subscriptionKey(subscriptionId: string) { return `nutrishake:subscription:${subscriptionId}`; }
function customerKey(customerId: string) { return `nutrishake:customer:${customerId}`; }
function sessionKey(tokenHash: string) { return `nutrishake:session:${tokenHash}`; }
function usageKey(userId: string, feature: string, period: string) { return `nutrishake:usage:${userId}:${feature}:${period}`; }
function rewardKey(userId: string) { return `nutrishake:reward:${userId}`; }
function rewardConversionKey(userId: string, conversionId: string) { return `nutrishake:reward-conversion:${userId}:${conversionId}`; }
function syncSnapshotKey(userId: string) { return `nutrishake:sync:${userId}`; }
function notificationSubscriptionKey(userId: string) { return `nutrishake:notifications:${userId}`; }

function hashPassword(password: string, salt = randomBytes(16).toString('hex')): string {
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, encoded: string): boolean {
  const [salt, stored] = encoded.split(':');
  if (!salt || !stored) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(stored, 'hex');
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function initialEntitlement(now = new Date()): ServerEntitlement {
  const trialStartedAt = now.toISOString();
  const trialExpiresAt = new Date(now.getTime() + TRIAL_DAYS * 86400000).toISOString();
  return {
    plan: 'premium',
    status: 'trial',
    trialStartedAt,
    trialExpiresAt,
  };
}

export function resolveEntitlement(entitlement: ServerEntitlement): ServerEntitlement {
  if (entitlement.status === 'trial' && entitlement.trialExpiresAt) {
    if (Date.now() >= new Date(entitlement.trialExpiresAt).getTime()) {
      return { ...entitlement, plan: 'free', status: 'expired' };
    }
  }
  if (entitlement.status === 'active' && entitlement.expiresAt) {
    if (Date.now() >= new Date(entitlement.expiresAt).getTime()) {
      return { ...entitlement, plan: 'free', status: 'expired' };
    }
  }
  return entitlement;
}

export async function createAccount(email: string, password: string): Promise<{ account: ServerAccount; sessionToken: string }> {
  const normalizedEmail = normalizeEmail(email);
  const existing = await redis('GET', emailKey(normalizedEmail));
  if (existing) throw new Error('Bu e-posta adresi zaten kayıtlı.');

  const now = new Date().toISOString();
  const account: ServerAccount = {
    id: `usr_${randomUUID()}`,
    email: normalizedEmail,
    passwordHash: hashPassword(password),
    createdAt: now,
    updatedAt: now,
    entitlement: initialEntitlement(),
  };

  await redis('SET', emailKey(normalizedEmail), account.id);
  await redis('SET', accountKey(account.id), JSON.stringify(account));
  const sessionToken = await createSession(account.id);
  return { account, sessionToken };
}

export async function authenticateAccount(email: string, password: string): Promise<{ account: ServerAccount; sessionToken: string } | null> {
  const normalizedEmail = normalizeEmail(email);
  const userId = await redis('GET', emailKey(normalizedEmail));
  if (!userId) return null;
  const raw = await redis('GET', accountKey(String(userId)));
  if (!raw) return null;
  const account = JSON.parse(String(raw)) as ServerAccount;
  if (!verifyPassword(password, account.passwordHash)) return null;
  account.entitlement = resolveEntitlement(account.entitlement);
  await redis('SET', accountKey(account.id), JSON.stringify(account));
  return { account, sessionToken: await createSession(account.id) };
}

export async function getAccount(userId: string): Promise<ServerAccount | null> {
  const raw = await redis('GET', accountKey(userId));
  if (!raw) return null;
  const account = JSON.parse(String(raw)) as ServerAccount;
  const resolved = resolveEntitlement(account.entitlement);
  if (JSON.stringify(resolved) !== JSON.stringify(account.entitlement)) {
    account.entitlement = resolved;
    account.updatedAt = new Date().toISOString();
    await redis('SET', accountKey(account.id), JSON.stringify(account));
  }
  return account;
}

export async function updateEntitlement(userId: string, entitlement: ServerEntitlement): Promise<ServerAccount> {
  const account = await getAccount(userId);
  if (!account) throw new Error('Account not found.');
  account.entitlement = entitlement;
  account.updatedAt = new Date().toISOString();
  await redis('SET', accountKey(account.id), JSON.stringify(account));
  if (entitlement.subscriptionId) await redis('SET', subscriptionKey(entitlement.subscriptionId), account.id);
  if (entitlement.customerId) await redis('SET', customerKey(entitlement.customerId), account.id);
  return account;
}


export async function getAccountBySubscription(subscriptionId: string): Promise<ServerAccount | null> {
  const userId = await redis('GET', subscriptionKey(subscriptionId));
  return userId ? getAccount(String(userId)) : null;
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = scryptSync(token, 'nutrishake-session', 32).toString('hex');
  await redis('SET', sessionKey(tokenHash), userId);
  await redis('EXPIRE', sessionKey(tokenHash), String(SESSION_TTL_SECONDS));
  return `${token}.${tokenHash}`;
}

export async function getUserIdFromSession(sessionCookie: string): Promise<string | null> {
  const [token, tokenHash] = sessionCookie.split('.');
  if (!token || !tokenHash) return null;
  const expectedHash = scryptSync(token, 'nutrishake-session', 32).toString('hex');
  if (expectedHash !== tokenHash) return null;
  const userId = await redis('GET', sessionKey(tokenHash));
  return userId ? String(userId) : null;
}

export async function revokeSession(sessionCookie: string): Promise<void> {
  const [, tokenHash] = sessionCookie.split('.');
  if (tokenHash) await redis('DEL', sessionKey(tokenHash));
}

export async function consumeUsage(userId: string, feature: string, period: string, limit: number): Promise<{ allowed: boolean; used: number; limit: number }> {
  const key = usageKey(userId, feature, period);
  const used = Number(await redis('INCR', key));
  await redis('EXPIRE', key, String(feature.includes('weekly') ? 8 * 86400 : 2 * 86400));
  if (used > limit) {
    await redis('DECR', key);
    return { allowed: false, used: limit, limit };
  }
  return { allowed: true, used, limit };
}

export async function getUsage(userId: string, feature: string, period: string): Promise<number> {
  return Number(await redis('GET', usageKey(userId, feature, period)) || 0);
}

export async function getRewardCredits(userId: string): Promise<number> {
  return Number(await redis('GET', rewardKey(userId)) || 0);
}

export async function consumeRewardCredit(userId: string): Promise<number> {
  const credits = Number(await redis('GET', rewardKey(userId)) || 0);
  if (credits <= 0) return 0;
  await redis('DECR', rewardKey(userId));
  return credits - 1;
}

export async function hasRewardConversion(userId: string, conversionId: string): Promise<boolean> {
  return Boolean(await redis('EXISTS', rewardConversionKey(userId, conversionId)));
}

export async function markRewardConversion(userId: string, conversionId: string): Promise<boolean> {
  const result = await redis('SET', rewardConversionKey(userId, conversionId), '1', 'NX', 'EX', String(90 * 86400));
  return result === 'OK';
}

export async function grantRewardCredit(userId: string): Promise<number> {
  const credits = Number(await redis('INCR', rewardKey(userId)));
  return credits;
}

export async function getSyncSnapshot(userId: string): Promise<SyncSnapshot | null> {
  const raw = await redis('GET', syncSnapshotKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(String(raw)) as SyncSnapshot;
  } catch {
    return null;
  }
}

export async function saveSyncSnapshot(userId: string, snapshot: SyncSnapshot): Promise<SyncSnapshot> {
  const existing = await getSyncSnapshot(userId);
  const incomingTime = Date.parse(snapshot.clientUpdatedAt);
  const existingTime = existing ? Date.parse(existing.clientUpdatedAt) : -1;
  if (existing && Number.isFinite(existingTime) && Number.isFinite(incomingTime) && incomingTime < existingTime) {
    return existing;
  }
  const sanitized: SyncSnapshot = { ...snapshot, profile: snapshot.profile ? { ...snapshot.profile, entitlement: undefined } : null };
  await redis('SET', syncSnapshotKey(userId), JSON.stringify(sanitized));
  return sanitized;
}

export async function saveNotificationSubscription(userId: string, subscription: unknown): Promise<void> {
  if (!subscription || typeof subscription !== 'object') throw new Error('Geçersiz bildirim aboneliği.');
  await redis('SET', notificationSubscriptionKey(userId), JSON.stringify(subscription));
}

export async function getNotificationSubscription(userId: string): Promise<Record<string, unknown> | null> {
  const raw = await redis('GET', notificationSubscriptionKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function removeNotificationSubscription(userId: string): Promise<void> {
  await redis('DEL', notificationSubscriptionKey(userId));
}

export function accountPublicView(account: ServerAccount) {
  const { passwordHash: _passwordHash, ...publicAccount } = account;
  return publicAccount;
}
