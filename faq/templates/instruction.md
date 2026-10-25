# Operating instruction template

Use this to create a repeatable procedure in any FAQ category.

## Procedure identity

- ID: `<CATEGORY-RUN-001>`
- Title: `<verb + outcome>`
- Audience and required role: `<owner / manager / platform admin / deployment operator>`
- Last reviewed: `<date>`
- Evidence and applicable version: `<source / migration / provider guide>`
- Related FAQ IDs: `<IDs>`

## Objective and scope

Explain what this procedure accomplishes, which property/date range it affects and how the user will know it is finished.

## Required starting state

List permissions, configuration, provider access and information needed. State whether the procedure operates on live inventory, a sandbox, or an isolated preview. Never infer sandbox status from a test-looking guest name.

## Steps and checkpoints

| Step | Where | Action | Expected result | If it fails |
| --- | --- | --- | --- | --- |
| 1 | Exact page | A single concrete action | Observable state | Safe next diagnostic |

Use the actual UI label. Explain a switch's meaning before asking the user to change it. Do not ask a user to confirm something they cannot independently verify.

## Completion evidence

Separate saved data, queued work, provider acknowledgement and end-user-visible completion. Include a representative date/unit/record and an appropriate comparison against the source of truth.

## Retry, cancel and recovery

Describe what is preserved, which stage resumes, and what cancellation does. Give a stopping point for errors rather than instructing repeated clicking or repeated destructive resets.

## Escalation message

Prepare a short message with the property identifier, affected record/category, dates, expected result, observed result, stage and redacted error. Do not include credentials or unnecessary guest identity data.

## Suggested prompt for generating a first draft

> Use FAQ IDs <IDs> and implementation sources <paths> to write instructions for <audience> to achieve <outcome>. Start from <known state>. Use current UI labels and configured values. Include prerequisites, exact steps, success checks, safe retry/cancel behavior and escalation. Do not invent missing provider capabilities, defaults or completed actions. List unresolved facts separately. Ask only for missing facts that change the next action. Do not include destructive SQL or expose secrets. Produce a draft for factual review, not an assertion that anything has been deployed.
