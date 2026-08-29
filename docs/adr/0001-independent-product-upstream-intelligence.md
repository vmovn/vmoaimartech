# ADR-0001: Independent Product Line, Selective Upstream Porting

**Status:** Accepted

## Context
Product starts from Swiffer 4.4.6 but targets Vietnam/SOHO/solopreneur needs and will diverge significantly.

## Decision
Product begins its own version line at v1.0.0. Future Swiffer releases are analyzed as external upstream R&D. Changes are selectively ADOPTED, ADAPTED, REIMPLEMENTED, IGNORED or used to REPLACE local implementations.

No blind full-version merge is required.

## Consequences
- Product roadmap is independent.
- Upstream security/RLS/bug fixes must still be reviewed promptly.
- Core database/auth/tenant concepts should diverge only deliberately because those are hardest to port later.
- Every upstream release review is recorded under `docs/upstream/`.
