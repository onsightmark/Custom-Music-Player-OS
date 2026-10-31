---
name: thermo-nuclear-code-quality-review
description: Review On Sight Musica changes for duplicate ownership, incomplete replacement and avoidable maintenance cost.
---

# Maintainability review

Read root [AGENTS.md](../../../AGENTS.md), [architecture](../../../docs/architecture.md)
and the pinned [upstream review](../thermos/vendor/maintainability.md). Apply the
[Thermos host mapping](../thermos/SKILL.md). Stay read-only.

Establish the reviewed revisions and assigned delta. Trace changed owners and
direct callers. Look for duplicated playback state, scattered provider rules,
wrong-owner validation, lifecycle ambiguity, type erosion, unnecessary wrappers,
unused dependencies, disconnected controls and incomplete migrations.
For desktop changes, keep native behavior in its owner and presentation derived
from the active player. Flag duplicate clocks, queues or provider sessions whose
state must be kept in sync by callers.

Every finding needs a concrete maintenance or regression cost, file/line evidence
and a simpler design preserving the requested behavior. Fewer files alone do not
mean simpler ownership. Avoid formatting nits and unrelated rewrites. For docs
and skills, check duplicated policy, stale paths, unsupported commands and claims
that exceed actual evidence or authorization.

Return prioritized findings or no actionable findings, with exact scope and
evidence gaps. Re-review repaired boundaries after the implementation owner has
updated the code and affected acceptance evidence.
