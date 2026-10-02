# Production Readiness Checklist

This is a deployment checklist, not a claim that every item is already complete.

## Code and data
- [ ] Install dependencies from the lockfile in a clean environment.
- [ ] Run TypeScript validation and production build after installing dependencies.
- [ ] Verify v3-to-v4 local-storage migration against representative existing user data.
- [ ] Verify account isolation for every authenticated API route.
- [ ] Confirm local browser storage is treated as a cache/offline store, not as the server database.
- [ ] Verify malformed persisted JSON is preserved and does not crash app startup.

## Environment
- [ ] Configure Gemini and/or OpenRouter server-side API keys.
- [ ] Configure Upstash Redis REST URL and token.
- [ ] Configure APP_URL to the production origin.
- [ ] Configure iyzico keys, merchant/plan reference, and provider-side callbacks.
- [ ] Configure long random webhook secrets and provider dashboard endpoints.
- [ ] Configure rewarded-ad provider credentials and verify server-side reward callbacks.
- [ ] Never place private keys or provider secrets in `VITE_*` variables.

## Notifications
- [ ] Configure public/private VAPID keys and subject.
- [ ] Implement and deploy a server-side push sender/worker.
- [ ] Verify subscription, delivery, expiry and unsubscribe end-to-end.
- [ ] Until sender delivery is verified, describe notifications as subscription-ready, not fully delivered.

## Release controls
- [ ] Review logs for credentials, session cookies, raw meal photos and sensitive user data.
- [ ] Verify error responses do not expose stack traces or secrets in production.
- [ ] Verify rate limits, usage limits, entitlement checks and webhook replay protection.
- [ ] Verify backup/restore and account-data deletion procedures.
- [ ] Verify PWA install, offline behavior, service-worker update and cache invalidation.
- [ ] Perform only the final tests required by the changed code before release.
