# Daily VibeCoding Workflow

## User can prompt briefly
Examples:

- `Việt hóa phần Deals cho tự nhiên với người Việt, giữ nguyên business logic.`
- `Fix lỗi message Zalo bị duplicate.`
- `Thêm action Workflow gửi Zalo ZBS.`

## Agent automatically does
1. Preflight docs/rules/skills.
2. Inspect relevant implementation.
3. Classify risk.
4. Identify source of truth and context owner.
5. Make scoped plan.
6. Implement.
7. Run narrow quality checks.
8. Update durable repository memory if lesson/decision is reusable.
9. Report result + rollback.

## User should only need long prompts when defining new product behavior, not to remind AI how to engineer.
