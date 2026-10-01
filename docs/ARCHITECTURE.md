# NutriShake Professional Architecture

## Target layers

1. **UI** — views/components only; no business calculations or provider secrets.
2. **Application** — user-facing workflows/use-cases such as generating a shake, confirming a meal, updating stock, and loading Today.
3. **Domain** — deterministic nutrition, goal, meal, shake, recipe, inventory, cost, and progress rules.
4. **Infrastructure** — HTTP/API, database/storage, authentication, AI providers, payment, rewards, push, and external services.

## Current migration strategy

The existing working engines/services are preserved. The professional architecture is introduced through stable boundaries first; implementation is moved behind those boundaries only when there is a concrete benefit. This avoids a risky big-bang rewrite.

### Domain boundaries

- User / Profile / Goal / Activity
- Nutrition
- Meal / Meal Analysis
- Shake / Recipe
- Ingredient / Inventory / Cost
- Progress
- Subscription / Entitlement / Usage / Rewards
- Notifications

### Critical dependency rule

`UI -> Application -> Domain -> Infrastructure`.

Infrastructure must never become a dependency of domain calculation code. AI, payment, advertising, and push providers are adapters, not business rules.

## AI boundary

`AI Service -> Provider -> Parser -> Validator -> Deterministic fallback`.

The server owns provider keys, rate limits, entitlement checks, and usage accounting.

## Data boundary

Server persistence is the source of truth for account data. Local storage is used for offline/cache/temporary state and pending mutations. Storage migrations are versioned and conservative.

## Security boundary

- Authentication is separate from authorization.
- Entitlement is verified server-side.
- Reward credits are server-controlled.
- Webhook requests are verified.
- User ownership is derived from the authenticated session.
- Secrets are never committed to the repository.
