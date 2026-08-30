# Validation Matrix

Choose checks by changed behavior, not by fear.

| Change class | Default validation | Escalate when |
|---|---|---|
| docs/copy only | diff/readback | generated docs/contracts depend on it |
| isolated UI presentation | targeted render/typecheck; `npm run typecheck` if practical | route/server contract changed |
| local pure logic | targeted test/typecheck | shared API behavior changed |
| setup presentation only | setup route compile + targeted manual view | Setup Secret/state/owner provisioning touched |
| setup security/bootstrap | targeted setup tests + setup lock verification + fresh-reset journey if needed | auth/tenant/data contract changed |
| auth/RBAC/RLS | focused security/auth tests + typecheck | schema/policy change → DB/security gates |
| DB migration | migration replay/targeted schema tests + RLS checks | destructive/data migration → Tier 3 |
| messaging provider edge | provider contract/webhook tests + normalized core regression | shared inbox/message schema changed |
| workflow runtime | workflow targeted tests + run/error persistence checks | node contract/shared execution changed |
| env/deployment metadata | env drift check + build/public-secret scan | runtime bootstrap changed |
| broad release | typecheck + build + security + relevant integration/regression matrix | only after feature work is complete |

Do not run repository-wide lint as a default acceptance gate for a small task; inherited vendor lint debt is baselined.
