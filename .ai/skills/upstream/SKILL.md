# Skill: Upstream Release Review

Compare vendor old → new, not Product → vendor.
Classify every relevant change:
SECURITY / RLS / MIGRATION / BUGFIX / ARCHITECTURE / FEATURE / DEPENDENCY.

Decision vocabulary only:
ADOPT / ADAPT / REIMPLEMENT / IGNORE / REPLACE.

Security and database changes reviewed first.
Record results under `docs/upstream/`.
Do not merge vendor release wholesale by default.
