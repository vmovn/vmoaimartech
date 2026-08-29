# Install into Product v1.0.0 Repository

1. Copy this overlay into repository root.
2. Commit as one governance-only commit before major customization.
3. Do not rename `AGENTS.md` — Codex and several agent workflows recognize it.
4. Keep tool-specific files thin; `AGENTS.md` remains authority.
5. Run:
   - `node scripts/ai/preflight.mjs`
   - `node scripts/ai/check-doc-memory.mjs`
6. Update `PRODUCT.md` when product positioning changes.
7. Update `DESIGN.md` only for deliberate design-system changes.
8. Update glossary whenever Vietnamese terminology becomes stable.
9. Create ADRs for expensive-to-reverse decisions.
10. Create one upstream review file per vendor release studied.

Recommended first follow-up work after installing overlay:
- generate a real current architecture inventory from Swiffer 4.4.6;
- inventory existing route/module/table ownership;
- build missing P0 regression tests referenced by `docs/quality/REGRESSION-MATRIX.md`;
- establish private Git repository + protected main branch + staging deployment.
