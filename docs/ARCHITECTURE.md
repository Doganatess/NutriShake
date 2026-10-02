# NutriShake Architecture

## Intent

This document describes the architecture boundary being introduced without replacing the existing, working engines. The migration is incremental: current engines and storage APIs remain the compatibility layer until each workflow can be moved safely.

## Current request/data flow

```text
React views and components
        │
        ▼
Application use cases (incremental entry points)
        │
        ▼
Existing deterministic engines ─────── Existing storage abstraction
        │                                          │
        └──────────────────┬───────────────────────┘
                           ▼
                  API / server services
                           │
             Redis REST, AI providers, iyzico
```

## Layer ownership

- `src/views` and `src/components`: presentation and user interaction.
- `src/application/use-cases`: workflow entry points used by UI; no UI rendering.
- `src/engines` and `src/utils`: existing deterministic domain calculations and validation. Keep these as the source of truth until an engine-specific migration is approved.
- `src/domain`: stable domain-facing types and policies. Avoid importing React or browser UI modules here.
- `src/storage` and `src/store`: local persistence and compatibility/migration behavior.
- `src/services`: browser-facing API clients and orchestration services.
- `src/server`: server-only provider, account, session and usage logic. Never import these modules from browser code.
- `api`: serverless HTTP entry points.
- `src/infrastructure`: environment/configuration adapters and infrastructure-specific integrations.

## Application entry points

- `getDailyNutritionSummary` is used by `src/App.tsx` to keep the daily summary calculation behind an application use case while retaining `calculateDailyNutrition` as the deterministic engine.
- `getShakePlanningContext` wraps the existing daily planning context for future UI migration. Existing shake generation behavior is intentionally preserved.

## Data and migration rules

- Browser storage remains local-first for the current application. It must not be described as the server database.
- Account, entitlement, usage, reward and sync persistence require the configured Upstash Redis REST credentials.
- Storage migrations are additive, versioned, and preserve unreadable data. Do not lower a schema version or overwrite a malformed value with an empty object.
- Server secrets must never use the `VITE_` prefix.

## API and security rules

- Derive user identity from the validated session, not a client-supplied `userId`.
- Validate request bodies and provider callbacks at the server boundary.
- Keep entitlement, usage and reward decisions server-side.
- AI output is untrusted input and must pass parsing, deterministic validation and fallback rules before being treated as an app result.

## Known production boundary

The notification API currently stores/removes push subscriptions. Subscription storage is not the same as push delivery: a server-side sender/worker and production VAPID configuration must be implemented and verified before push notifications are advertised as fully operational.

Payment and rewarded-ad code also require real provider credentials and dashboard-side webhook configuration before production activation.
