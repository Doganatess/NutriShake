import React, { useState } from 'react';
import { Download, Share2, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (isInstalled || dismissed) {
    return null;
  }

  if (!isInstallable && !isIOS) {
    return null;
  }

  return (
    <>
      <div className="mx-4 mt-2 mb-3 bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-emerald-950">NutriShake’i Ekrana Ekle</p>
            <p className="text-[11px] text-emerald-700">iPhone ve masaüstünde uygulama gibi kullanın</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {isInstallable && (
            <button
              onClick={install}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium active:scale-95 transition"
            >
              <Download className="w-3.5 h-3.5" />
              Yükle
            </button>
          )}

          {isIOS && (
            <button
              onClick={() => setShowIOSGuide(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium active:scale-95 transition"
            >
              <Share2 className="w-3.5 h-3.5" />
              Nasıl Eklenir?
            </button>
          )}

          <button
            onClick={() => setDismissed(true)}
            className="p-1 text-emerald-700 hover:text-emerald-900"
            aria-label="Kapat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showIOSGuide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-stone-900 text-base">iPhone’a Yükleme</h3>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="p-1 text-stone-400 hover:text-stone-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-stone-600 mb-4">
              NutriShake uygulamasını tam ekran ve internet kesintisinde de çalışacak şekilde ana ekranınıza ekleyebilirsiniz:
            </p>

            <ol className="space-y-3 text-xs text-stone-700">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-800 font-bold flex items-center justify-center shrink-0">1</span>
                <span>Safari tarayıcısının altındaki <strong className="text-stone-900">Paylaş (Kare ve yukarı ok)</strong> simgesine dokunun.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-800 font-bold flex items-center justify-center shrink-0">2</span>
                <span>Menüyü aşağı kaydırıp <strong className="text-stone-900">"Ana Ekrana Ekle"</strong> seçeneğini seçin.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-800 font-bold flex items-center justify-center shrink-0">3</span>
                <span>Sağ üstteki <strong className="text-emerald-700">"Ekle"</strong> butonuna basın.</span>
              </li>
            </ol>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="mt-6 w-full py-3 rounded-2xl bg-stone-900 text-white font-medium text-xs active:scale-98 transition"
            >
              Anladım
            </button>
          </div>
        </div>
      )}
    </>
  );
};
