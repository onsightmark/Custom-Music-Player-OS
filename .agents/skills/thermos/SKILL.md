---
name: thermos
description: Run independent playback correctness/security and maintainability reviews for On Sight Musica. Use for explicit Thermos requests, shared playback/provider changes and release review.
---

# Thermos for On Sight Musica

Read root [AGENTS.md](../../../AGENTS.md) and the [project roles](../../../docs/engineering.md).
This adapter uses the two-pass workflow in the pinned [upstream Thermos skill](vendor/thermos.md).
The [license](LICENSE) and [inventory](upstream.json) identify its source.

1. Establish the same base/head revisions, assigned working-tree delta, intended
   behavior and actual validation evidence for both reviewers.
2. Run independent `playback-reviewer` and `code-steward` agents with available
   host tools. Inherit the selected model. Keep both read-only.
3. Have the playback reviewer follow the [correctness adapter](../thermo-nuclear-review/SKILL.md).
   Have the code steward follow the [maintainability adapter](../thermo-nuclear-code-quality-review/SKILL.md).
4. Combine grounded findings, verify triggers against current source and assign
   repairs to the implementation owner. Reviewer agreement is not proof by itself.
5. Re-run affected journeys and re-review repaired boundaries. Finish when both
   responsibilities have no actionable findings in scope, or state the precise
   acceptance blocker. For requested repeated rounds, record each round's scope,
   reviewed revision, findings and changed evidence in task artifacts.

Do not claim independent review when only self-review ran. Do not invent model
or platform diversity. Upstream Cursor-specific commands and permissions map to
available host tools and root AGENTS. A clean source review does not establish
provider playback, Windows/Mac installation or scale.
