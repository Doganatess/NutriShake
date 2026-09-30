import type { Request, Response } from 'express';
import { consumeRewardCredit, consumeUsage, getRewardCredits, getUsage } from './accountStore.js';
import { requireAccount } from './authHttp.js';

export type AiUsageFeature = 'free_shake_weekly' | 'rewarded_ai_generation_daily';

const FREE_SHAKE_WEEKLY_LIMIT = 3;
const REWARDED_AI_DAILY_LIMIT = 3;

function periodFor(feature: AiUsageFeature): string {
  const now = new Date();
  if (feature === 'free_shake_weekly') {
    const day = now.getUTCDay() || 7;
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day + 1));
    return monday.toISOString().slice(0, 10);
  }
  return now.toISOString().slice(0, 10);
}

/**
 * Server-side authorization for AI features.
 * Premium/trial entitlement is authoritative; localStorage is never consulted.
 * Free users get the normal weekly shake allowance. If that allowance is
 * exhausted, a previously earned reward credit may authorize one extra AI use,
 * subject to the daily rewarded-use limit.
 */
export async function requireAiUsage(
  req: Request,
  res: Response,
  feature: AiUsageFeature,
) {
  const session = await requireAccount(req, res);
  if (!session) return null;

  const entitlement = session.account.entitlement;
  const premium = entitlement.plan === 'premium' && entitlement.status !== 'expired' && entitlement.status !== 'cancelled';
  if (premium) {
    return { account: session.account, source: 'premium' as const, feature, period: periodFor(feature) };
  }

  const period = periodFor(feature);
  const limit = feature === 'free_shake_weekly' ? FREE_SHAKE_WEEKLY_LIMIT : REWARDED_AI_DAILY_LIMIT;
  const normalUsage = await consumeUsage(session.account.id, feature, period, limit);

  if (normalUsage.allowed) {
    return { account: session.account, source: 'free_limit' as const, feature, period, used: normalUsage.used, limit };
  }

  // Once the normal free allowance is exhausted, a reward credit can unlock
  // one additional AI operation. Keep a separate daily ceiling for rewarded use.
  const rewardPeriod = periodFor('rewarded_ai_generation_daily');
  const rewardedUsage = await getUsage(session.account.id, 'rewarded_ai_generation_daily', rewardPeriod);
  if (rewardedUsage >= REWARDED_AI_DAILY_LIMIT) {
    res.status(429).json({
      error: 'Ücretsiz AI kullanım hakkınız doldu. Ödüllü kullanım hakkınızın günlük sınırına da ulaşıldı.',
      code: 'AI_USAGE_LIMIT_REACHED',
      feature,
      limit,
    });
    return null;
  }

  const availableCredits = await getRewardCredits(session.account.id);
  if (availableCredits <= 0) {
    res.status(429).json({ error: 'AI kullanım hakkınız bulunmuyor.', code: 'AI_USAGE_LIMIT_REACHED' });
    return null;
  }

  const creditLeft = await consumeRewardCredit(session.account.id);

  const rewarded = await consumeUsage(
    session.account.id,
    'rewarded_ai_generation_daily',
    rewardPeriod,
    REWARDED_AI_DAILY_LIMIT,
  );

  if (!rewarded.allowed) {
    // Defensive response; the credit is already consumed only in the unlikely
    // race where the daily rewarded-use ceiling changed between reads.
    res.status(429).json({ error: 'Ödüllü AI kullanım sınırına ulaşıldı.', code: 'AI_USAGE_LIMIT_REACHED' });
    return null;
  }

  return {
    account: session.account,
    source: 'reward_credit' as const,
    feature,
    period,
    used: normalUsage.used,
    limit,
    rewardCreditsRemaining: creditLeft,
  };
}
