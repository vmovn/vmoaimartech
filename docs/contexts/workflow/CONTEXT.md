# Workflow Context

## Owns
Workflow definitions, triggers, conditions, actions, runtime, queue/runs/steps, retries and external execution contracts.

## Invariants
- Workflow engine invokes domain operations; it does not bypass authorization/data ownership.
- External calls are observable and retry-safe where possible.
- New provider actions register through existing node/action registry if available.
- Workflow runs preserve enough input/output/error metadata for debugging.
