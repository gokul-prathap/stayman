# FAQ entry template

Copy the block below into a category's `faq.md`. Replace placeholders; do not export an unfinished template.

```markdown
### CATEGORY-001 | A short question in the user's words?
<!-- faq: {"category":"category-slug","audience":["owner"],"status":"implementation-confirmed","last_reviewed":"YYYY-MM-DD","aliases":["Another way users ask this"],"related":["CATEGORY-002"]} -->

**Answer:** State the main answer in one or two plain sentences.

**Where:** Exact page and visible control names. Say when a label varies by provider or version.

**Before you start:** Required role, feature version, data and prerequisite state. Use actual configured values; examples are not defaults.

**Steps:**
1. One concrete action.
2. Expected result, then the next action.

**Verify:** The observable result that proves this step succeeded. Distinguish local save, queued work, provider acceptance and external completion.

**If it fails:** Exact error to capture, what is preserved, what to retry and when to stop.

**Escalate:** Who owns the unresolved part and the minimum redacted evidence they need.

**Evidence:** Source file/function, test, provider document or dated case observation.
```

Allowed status values:

- `implementation-confirmed`: verified in current local source/tests; not a production deployment claim.
- `case-confirmed`: an observation from a specific recorded incident, not a universal rule.
- `provider-verification-required`: a provider-dependent result or capability that Stayman alone cannot establish.

Keep one support intent per entry. Never write a generic destructive SQL answer that identifies records only by a guest's display name. Distinguish actions a chatbot can explain from actions that require an authorized operator.
