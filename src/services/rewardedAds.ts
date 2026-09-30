export interface AyetVideoSdk {
  init(placementId: number, externalIdentifier: string, optionalParameter?: string | null): Promise<void>;
  requestAd(adslotName: string, success: () => void, error: (message: string) => void): void;
  playFullscreenAd(): void;
  playFullsizeAd(): void;
  playInPageAd(elementId: string): void;
  isAdAvailable(): boolean;
  destroy(): void;
  setCustomParameter(name: string, value: string): void;
  callbackRewarded?: (details: Record<string, unknown>) => void;
  callbackError?: (error: unknown) => void;
}

declare global {
  interface Window {
    AyetVideoSdk?: AyetVideoSdk;
  }
}

let sdkPromise: Promise<AyetVideoSdk> | null = null;

function loadSdk(): Promise<AyetVideoSdk> {
  if (window.AyetVideoSdk) return Promise.resolve(window.AyetVideoSdk);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-nutrishake-ayet]');
    const script = existing || document.createElement('script');
    if (!existing) {
      script.src = 'https://cdn.ayet.io/offerwall/js/ayetvideosdk.min.js';
      script.async = true;
      script.dataset.nutrishakeAyet = 'true';
      document.head.appendChild(script);
    }
    script.addEventListener('load', () => window.AyetVideoSdk ? resolve(window.AyetVideoSdk) : reject(new Error('Rewarded video SDK yüklenemedi.')));
    script.addEventListener('error', () => reject(new Error('Rewarded video SDK yüklenemedi.')));
  });
  return sdkPromise;
}

export async function showRewardedVideo(userId: string, onReward: () => Promise<void>) {
  const placementId = Number(import.meta.env.VITE_AYET_PLACEMENT_ID || '0');
  const adslotName = String(import.meta.env.VITE_AYET_REWARDED_ADSLOT_NAME || '');
  if (!placementId || !adslotName) throw new Error('Rewarded Ads henüz yapılandırılmamış.');

  const sdk = await loadSdk();
  await sdk.init(placementId, userId, 'nutrishake_reward');
  sdk.setCustomParameter('custom_1', 'nutrishake_reward');

  await new Promise<void>((resolve, reject) => {
    const previousRewarded = sdk.callbackRewarded;
    const previousError = sdk.callbackError;
    let settled = false;
    sdk.callbackRewarded = async (details) => {
      try {
        if (!settled) {
          settled = true;
          const response = await fetch('/api/rewarded-ad', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(details),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || 'Reward doğrulanamadı.');
          await onReward();
          resolve();
        }
      } catch (error) {
        if (!settled) {
          settled = true;
          reject(error);
        }
      } finally {
        sdk.callbackRewarded = previousRewarded;
      }
    };
    sdk.callbackError = (error) => {
      if (!settled) {
        settled = true;
        sdk.callbackError = previousError;
        reject(new Error(typeof error === 'string' ? error : 'Ödüllü reklam başlatılamadı.'));
      }
    };
    sdk.requestAd(adslotName, () => sdk.playFullscreenAd(), (message) => {
      if (!settled) {
        settled = true;
        reject(new Error(message || 'Ödüllü reklam bulunamadı.'));
      }
    });
  });
}
