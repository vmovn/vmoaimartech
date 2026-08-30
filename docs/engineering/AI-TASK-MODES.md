# AI Task Modes — Cost-Controlled Vibecoding

## SURGICAL (default)
Use when goal, owner and acceptance criteria are clear.

Prompt contract:
```
MODE: SURGICAL
GOAL: one result
CONTEXT: read CONTEXT-MAP → one owner context
START: documented entry points
DO NOT: repo-wide audit, unrelated refactor, dependency upgrade
MAX CHANGE SURFACE: state expected files/module
VALIDATE: narrowest relevant check
STOP WHEN: acceptance criteria pass
```

## DIAGNOSE → PATCH
Use when there is a specific failure but root cause is unknown.

1. reproduce/inspect evidence;
2. locate root cause from mapped owner;
3. smallest valid patch;
4. targeted verify;
5. stop.

Do not "fix all warnings" discovered along the way.

## DEEP
Use only for architecture/cross-context/security/data-contract changes. Produce an impact map, but keep discovery within relevant contexts.

## AUDIT
Use only when audit is the requested deliverable. Persist durable findings into context memory so the next implementation task does not repeat the audit.

## Reset context when domain changes
Continue the same agent session inside one problem domain. When moving to a different domain, checkpoint verified state and start with the new owning context instead of carrying unrelated investigation noise.
