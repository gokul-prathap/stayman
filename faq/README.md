# Stayman FAQ and instruction library

This is the source library for support answers, operating instructions and a future Stayman assistant. It is documentation, not a live status monitor or a chatbot integration.

Last reviewed: 2026-10-24. Current content describes local source through migration 048. It does not establish which migrations or frontend version a property has deployed.

## Categories

| Category | Content | State |
| --- | --- | --- |
| Aiosell | [FAQ](aiosell/faq.md), [operating instructions](aiosell/instructions.md), [setup incident record](aiosell/case-notes.md), [read-only diagnostics](aiosell/diagnostics.sql) | Initial reviewed documentation |
| Test data cleanup | [FAQ](data-cleanup/faq.md), [operator instructions](../scripts/admin/cleanup-test-bookings.md), [preview-first SQL script](../scripts/admin/cleanup-test-bookings.sql) | Operator-only; no live execution performed |
| Future categories | Use the templates below for reservations, guests, billing, expenses, inventory or other features | Not documented yet; do not infer answers |

## Start here

- Property owner: use the FAQ and owner instructions. No database editing is required for ordinary operations.
- Platform administrator: use setup/recovery instructions and the release document.
- Support engineer: capture the property, dates, exact error and current state before choosing a recovery procedure.
- Chatbot implementer: read [assistant rules](chatbot-guidelines.md) before importing any content.
- Documentation author: use [FAQ entry template](templates/faq-entry.md) and [instruction template](templates/instruction.md). Register new categories in [categories.json](categories.json).

The FAQ contains reusable answers. The incident record contains property-specific observations and unresolved questions; it is not a configuration default. Templates are writing aids, not finished instructions for an undocumented feature.

## Add a category

1. Create `faq/<category-slug>/` and add `faq.md` with the entry format used in Aiosell.
2. Add an entry to `categories.json`. Use a stable lowercase slug and a readable name.
3. Give each question a stable category-specific ID, for example `BILL-001`. Do not recycle an ID for a different question.
4. Verify the answer against the current implementation or an authoritative source. State limits and deployment dependencies.
5. Link procedures instead of copying risky operations into every answer. Never include passwords, tokens, guest documents or payment-card details.
6. Add concrete success checks and a stop/escalation condition. Include the user's natural-language question variants.
7. Run the exporter to validate the entry structure. Review links and facts separately.

## Export for chatbot retrieval

From the repository root:

```powershell
python faq/export_chatbot.py --output faq/generated/knowledge.jsonl
```

This creates one JSON object per FAQ entry, retaining its ID, category, question, evidence status, audience, aliases and complete answer. It makes no network calls and does not train or publish a model. Generated files are ignored by Git; Markdown remains the source of truth. The exporter excludes templates, diagnostics, incident notes and release documents deliberately. Those require separately scoped retrieval and administrator authorization.

For first implementation, retrieve relevant reviewed FAQ entries and cite their IDs instead of training on the entire raw support conversation. Historical suggestions in a conversation may have been corrected later.

## Maintenance

- Review affected entries whenever a migration, label, role, sync scope or provider capability changes.
- Keep a distinction between `implementation-confirmed`, `case-confirmed` and `provider-verification-required` evidence.
- Do not label an external integration fixed until the downstream result is verified.
- Update `last_reviewed` metadata after a factual review, not simply when exporting.
- Record deployment prerequisites, but never assume a successful local test means production has changed.

Related implementation documents: [release steps](../docs/DEPLOYMENT.md), [Aiosell capability boundaries](../docs/aiosell-capabilities.md).
