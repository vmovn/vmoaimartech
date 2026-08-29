# CRM Context

## Owns
Company, Lead, Contact relationship, Deal, Pipeline/Stage, lifecycle, scoring, segmentation and revenue-facing customer state.

## Invariants
- Score meaning must be explainable; avoid one opaque AI number becoming source of truth.
- Prefer separate score dimensions when product reaches that stage: Fit, Intent, Engagement, Value, Health/Risk.
- Deal state and lifecycle state are separate concepts.
- Customer intelligence consumes events from other contexts but CRM owns business interpretation.
