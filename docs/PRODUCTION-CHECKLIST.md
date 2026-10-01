# Production Readiness Checklist

## Security
- [ ] Production secrets configured outside the repository
- [ ] Auth/session cookies verified in production
- [ ] Same-origin / CSRF protections verified
- [ ] Server-side entitlement checks enabled
- [ ] Reward verification enabled
- [ ] Payment webhook signatures/secrets configured
- [ ] User isolation verified
- [ ] AI rate limiting verified

## Data
- [ ] Production Redis/database configured
- [ ] Storage migration version matches application version
- [ ] Backup/recovery procedure documented
- [ ] Offline sync conflict behavior verified

## AI
- [ ] Primary provider configured
- [ ] Fallback provider configured if used
- [ ] Deterministic fallback available
- [ ] Raw photo retention policy verified
- [ ] Provider timeouts/rate limits verified

## Monetization
- [ ] Premium entitlement source configured
- [ ] Payment plan/reference configured
- [ ] Callback/webhook URLs configured
- [ ] Reward provider credentials configured
- [ ] Rewarded-ad verification tested with real provider

## PWA / Push
- [ ] Manifest/icons verified
- [ ] Service worker verified
- [ ] Offline shell verified
- [ ] Push subscription endpoint configured
- [ ] Server-side push sender/provider configured

## Observability
- [ ] Error tracking configured
- [ ] Request IDs present in logs
- [ ] API latency/error metrics available
- [ ] Payment/AI/webhook failures observable
