/**
 * Safe client-side configuration accessors.
 * Server secrets must only be read in server modules via process.env.
 */
export function getPublicAppConfig() {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return {
    appUrl: env?.VITE_APP_URL || (typeof window !== 'undefined' ? window.location.origin : ''),
    webPushPublicKey: env?.VITE_WEB_PUSH_PUBLIC_KEY || '',
    rewardedAdPlacementId: Number(env?.VITE_AYET_PLACEMENT_ID || 0),
    rewardedAdSlotName: env?.VITE_AYET_REWARDED_ADSLOT_NAME || '',
  };
}

export function isProductionEnvironment(): boolean {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return env?.MODE === 'production';
}
