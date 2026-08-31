# Workflow Context — Tự động hóa

## Purpose
Owns workflow definitions, triggers, conditions, action registry, runtime execution, run/step state, variables, retries and external execution contracts.

## Primary Entry Points
- `src/lib/workflows/engine.server.ts`
- `src/lib/workflows/node-registry.ts`
- `src/lib/workflows/workflows.functions.ts`
- `src/lib/workflows/logic-eval.ts`
- `src/lib/workflows/variables.ts`
- `src/lib/workflows/variables.functions.ts`
- `src/lib/workflows/validation.ts`
- automation routes.

## Source of Truth
Workflow definition + run/step execution records. Domain state remains owned by the domain action invokes.

## Invariants
- workflow invokes domain operations; it does not bypass authorization/data ownership.
- provider/domain actions use the existing node/action registry when suitable.
- external calls are observable and retry-safe where possible.
- run/step records retain enough input/output/error context for debugging.

## Validation
Definition/registry change → registry/validation tests. Runtime change → focused execution/retry/run-state regression.

## Last Verified
- Runtime baseline: `v1.0.0-localhost-1.0.6.2`.
- Memory installation checkpoint: `v1.0.0-localhost-1.0.7` / `0f401975274490d0201581325a932d7865f73208`.
- Date: 2026-08-31.
- Verification scope: Primary Entry Point paths only; domain semantics were not re-audited.
