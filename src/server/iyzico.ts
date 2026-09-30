import { createHmac, randomUUID } from 'node:crypto';

const IYZICO_BASE_URL = process.env.IYZICO_BASE_URL || 'https://api.iyzipay.com';

function requireConfig() {
  const apiKey = process.env.IYZICO_API_KEY;
  const secretKey = process.env.IYZICO_SECRET_KEY;
  const planReferenceCode = process.env.IYZICO_PREMIUM_PLAN_REFERENCE;
  if (!apiKey || !secretKey || !planReferenceCode) {
    throw new Error('iyzico abonelik yapılandırması eksik. IYZICO_API_KEY, IYZICO_SECRET_KEY ve IYZICO_PREMIUM_PLAN_REFERENCE gerekli.');
  }
  return { apiKey, secretKey, planReferenceCode };
}

function authorization(apiKey: string, secretKey: string, path: string, body: string) {
  const randomKey = `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`;
  const payload = randomKey + path + body;
  const signature = createHmac('sha256', secretKey).update(payload).digest('hex');
  const raw = `apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`;
  return `IYZWSv2 ${Buffer.from(raw, 'utf8').toString('base64')}`;
}

async function iyzicoRequest(path: string, body: Record<string, unknown>) {
  const { apiKey, secretKey } = requireConfig();
  const bodyText = JSON.stringify(body);
  const response = await fetch(`${IYZICO_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: authorization(apiKey, secretKey, path, bodyText),
      'Content-Type': 'application/json',
    },
    body: bodyText,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.status === 'failure') {
    throw new Error(data?.errorMessage || data?.errorCode || 'iyzico isteği başarısız oldu.');
  }
  return data;
}

export async function initializeSubscriptionCheckout(input: {
  email: string;
  name: string;
  surname: string;
  gsmNumber: string;
  callbackUrl: string;
  userId: string;
}) {
  const { planReferenceCode } = requireConfig();
  const conversationId = `nutrishake_${randomUUID()}`;
  return iyzicoRequest('/v2/subscription/checkoutform/initialize', {
    locale: 'tr',
    callbackUrl: input.callbackUrl,
    pricingPlanReferenceCode: planReferenceCode,
    subscriptionInitialStatus: 'ACTIVE',
    conversationId: `nutrishake:${input.userId}:${conversationId.split('_').at(-1) || randomUUID()}`,
    customer: {
      name: input.name,
      surname: input.surname,
      email: input.email,
      gsmNumber: input.gsmNumber,
      billingAddress: {
        address: 'Dijital hizmet',
        contactName: `${input.name} ${input.surname}`,
        city: 'Istanbul',
        country: 'Türkiye',
      },
    },
  });
}

export async function retrieveSubscriptionCheckout(token: string) {
  const { apiKey, secretKey } = requireConfig();
  const path = `/v2/subscription/checkoutform/${encodeURIComponent(token)}`;
  const body = '';
  const response = await fetch(`${IYZICO_BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      Authorization: authorization(apiKey, secretKey, path, body),
      'Content-Type': 'application/json',
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.status === 'failure') {
    throw new Error(data?.errorMessage || data?.errorCode || 'iyzico ödeme sonucu alınamadı.');
  }
  return data;
}

export async function cancelSubscription(subscriptionReferenceCode: string) {
  return iyzicoRequest(`/v2/subscription/subscriptions/${encodeURIComponent(subscriptionReferenceCode)}/cancel`, {
    subscriptionReferenceCode,
  });
}
