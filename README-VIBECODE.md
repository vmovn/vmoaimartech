# AI VibeCode Engineering Environment

This overlay turns the repository into an AI-maintainable product codebase.
It does not change application code. Copy these files into repository root.

## Goal

A human should be able to issue short product instructions while coding agents consistently:
1. reload product intent and architecture;
2. inspect existing implementation before editing;
3. preserve UI/design conventions;
4. preserve tenant/RLS/data ownership;
5. record architectural decisions and change history;
6. keep upstream Swiffer releases usable as external R&D intelligence.

## Authoritative order

1. `AGENTS.md` — execution constitution.
2. `PRODUCT.md` — product direction and non-goals.
3. `ARCHITECTURE.md` — system boundaries and invariants.
4. `DESIGN.md` — UI constitution.
5. `GLOSSARY.md` — domain language, especially Vietnamese localization.
6. `CONTEXT-MAP.md` + relevant `docs/contexts/*/CONTEXT.md`.
7. Relevant `.ai/skills/*/SKILL.md`.
8. `docs/adr/*` — historical architecture decisions.
9. `docs/upstream/*` — vendor intelligence ledger.

## Daily usage

Prompt normally, for example:

> Việt hóa màn Contacts theo thuật ngữ hiện tại, không thay đổi layout hoặc business logic.

or:

> Tích hợp Zalo OA vào Inbox, giữ Customer làm source of truth và đảm bảo RLS theo workspace.

Agent must discover and obey repository guidance automatically.

## Never put secrets in these files

No production keys, tokens, passwords, purchase codes, private customer data, or real tenant data.
