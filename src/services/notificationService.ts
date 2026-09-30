import type { NotificationPreferences } from '../types.js';

let scheduler: number | null = null;
let lastSentKey = '';

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

export async function showLocalNotification(title: string, body: string): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration?.showNotification) {
      await registration.showNotification(title, { body, icon: '/pwa-192x192.png', badge: '/pwa-192x192.png' });
      return;
    }
  }
  new Notification(title, { body });
}

function matchesTime(target: string | undefined, now: Date): boolean {
  if (!target) return false;
  const [hours, minutes] = target.split(':').map(Number);
  return now.getHours() === hours && now.getMinutes() === minutes;
}

async function checkReminders(preferences: NotificationPreferences): Promise<void> {
  if (!preferences.enabled || typeof document === 'undefined' || document.visibilityState === 'hidden') return;
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);
  const send = async (key: string, title: string, body: string) => {
    const dedupe = `${dateKey}:${key}`;
    if (lastSentKey === dedupe) return;
    lastSentKey = dedupe;
    await showLocalNotification(title, body);
  };
  if (preferences.breakfastReminder && matchesTime(preferences.breakfastTime, now)) {
    await send('breakfast', 'NutriShake', 'Kahvaltını kaydetme zamanı.');
  }
  if (preferences.shakeReminder && matchesTime(preferences.shakeTime, now)) {
    await send('shake', 'NutriShake', 'Günün shake porsiyonunu kontrol etme zamanı.');
  }
  if (preferences.weightReminder && preferences.weightDay === now.getDay() && matchesTime(preferences.weightTime, now)) {
    await send('weight', 'NutriShake', 'Kilo takibini güncelleme zamanı.');
  }
}

export function startReminderScheduler(preferences: NotificationPreferences): () => void {
  if (scheduler !== null) window.clearInterval(scheduler);
  void checkReminders(preferences);
  scheduler = window.setInterval(() => void checkReminders(preferences), 60_000);
  return () => {
    if (scheduler !== null) window.clearInterval(scheduler);
    scheduler = null;
  };
}

export async function subscribeToPushNotifications(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const publicKey = (import.meta as any).env?.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined;
  if (!publicKey) return null;
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: publicKey,
  });
  const response = await fetch('/api/notifications', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'subscribe', subscription }),
  });
  if (!response.ok) throw new Error('Bildirim aboneliği kaydedilemedi.');
  return subscription;
}
