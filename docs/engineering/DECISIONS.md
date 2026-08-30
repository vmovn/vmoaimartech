# Engineering Decision Log

Use for small decisions not important enough for a full ADR.

| Date | Area | Decision | Why | Revisit when |
|---|---|---|---|---|
| 2026-08-30 | Environment | Keep executable environment metadata in `src/lib/environment/environment-catalog.json`; evaluate values only in server code and enforce drift with `npm run env:audit`. | One inventory now drives setup readiness, deployment docs and `.env.example` without importing server secrets into the browser. | The runtime/config architecture changes or Supabase Edge Functions are added. |
