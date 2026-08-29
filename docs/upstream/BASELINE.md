# Upstream Baseline

## Seed
- Vendor product: Swiffer
- Baseline: 4.4.6
- Product fork version: 1.0.0

## Policy
Do not rewrite Product history to match vendor version numbers.
Do not import a vendor release wholesale without review.

## Review priority
1. Security/RLS/auth
2. Database migrations/invariants
3. Bug fixes affecting inherited code
4. Architecture improvements
5. Useful features
6. Dependencies/performance
7. Irrelevant/global-market features
