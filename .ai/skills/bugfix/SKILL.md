# Skill: Bug Fix

Do not patch symptom first.

1. Reproduce or establish evidence.
2. Identify violated invariant/root cause.
3. Inspect all writers/readers of affected shared state.
4. Fix at owning layer.
5. Avoid unrelated refactor.
6. Add regression test/check if feasible.
7. Record reusable lesson when bug class can recur.
