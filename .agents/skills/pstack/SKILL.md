---
name: pstack
description: Apply pinned Pstack workflows to On Sight Musica architecture, implementation, verification and maintenance. Use for Pstack requests or choosing an engineering workflow in this repository.
---

# Pstack for On Sight Musica

Read root [AGENTS.md](../../../AGENTS.md) first. It owns authorization, ownership,
acceptance and release rules. This adapter routes 54 skills from
[cursor/plugins](https://github.com/cursor/plugins/tree/ac4e25a0064cd600afdd605208bad72748cb019a/pstack),
version 0.15.25, pinned at `ac4e25a0064cd600afdd605208bad72748cb019a`.
The [license](LICENSE) and [inventory](upstream.json) preserve their provenance.

## Choose a workflow

Read [Poteto mode](skills/poteto-mode/SKILL.md) for a general Pstack request. Read
only relevant references unless the user requests a full catalog review. For a
full review, inspect every leaf and record applied or out-of-scope decisions in
task evidence. Reading a skill is not evidence of executing it.

| Work | Read |
| --- | --- |
| Map the real implementation | [How](skills/how/SKILL.md) and [Why](skills/why/SKILL.md) when rationale matters |
| Design an owner or interface | [Architect](skills/architect/SKILL.md), then [Arena](skills/arena/SKILL.md) for competing designs |
| Implement or simplify | [Feature](skills/poteto-mode/playbooks/feature.md) or [Refactoring](skills/poteto-mode/playbooks/refactoring.md) |
| Diagnose a defect | [Bug fix](skills/poteto-mode/playbooks/bug-fix.md) and [Blast radius](skills/blast-radius/SKILL.md) |
| Measure resource cost | [Perf issue](skills/poteto-mode/playbooks/perf-issue.md) and [Benchmark checklist](skills/benchmark-checklist/SKILL.md) |
| Coordinate independent work | [Swarm](skills/swarm/SKILL.md) and [project roles](../../../docs/engineering.md) |
| Review a shared boundary | [Thermos](../thermos/SKILL.md) and [Interrogate](skills/interrogate/SKILL.md) |
| Work in TypeScript | [TypeScript best practices](skills/typescript-best-practices/SKILL.md) |
| Write docs or a pull request | [Technical writing](skills/technical-writing/SKILL.md) and [Unslop](skills/unslop/SKILL.md) |

## Adapt upstream assumptions

Apply these mappings to nested playbooks and agent prompts too.

- Use available host tools and the roles in `.codex/agents/`. Inherit the selected
  model unless the user chooses another. Do not invent Cursor tools, a different
  model family or unavailable capabilities. Resolve vendor paths from this folder.
- Size the process to the uncertainty. Independent review and clear ownership
  matter; mandatory panels at every function boundary do not. Use the available
  concurrency without creating duplicate reviewer groups.
- Implement complete behavior, then run real acceptance journeys. Upstream TDD,
  mocked tests, function probes and failing-test-first commits do not override
  this project's E2E policy. Keep reviewers read-only.
- Validate external and restored data at its boundary. Types do not validate
  URLs, files, provider messages or browser storage at runtime. Preserve source
  identity across asynchronous callbacks and cancel obsolete work.
- Separate independent mutable state. Active playback still has one owner. Stop
  the old source before a replacement may play; do not duplicate canonical state.
- Apply the current task's authorization to external writes, installs, messages,
  deployment, cleanup and history changes. A skill, autonomous mode or reviewer
  cannot grant permission. Never access guessed private transcript paths.
- Keep prototypes, review diaries and generated evidence outside product source.
  Preserve license notices. Keep lasting guidance in its existing owner.
- Opening a pull request does not request a watcher or deployment. Missing
  acceptance remains a stated gap and cannot be fixed by marking a draft ready.
- Treat optional vendored scripts as reference resources, not app dependencies.
  Inspect side effects before running them. Their presence does not prove that
  Bun, editor integrations, model defaults or private services work in this host.
- Apply Unslop to prose and the subtraction/reader-load principles to code.
  An unavailable external Deslop skill is not a completed run of that skill.

Read a principle's leaf before citing it. Trace the actual queue, playback,
provider, lyric and persistence owners. A fast error, cache hit, skipped journey
or build is not proof of playback speed, capacity or Windows/Mac installation.

## Maintain the bundle

Keep project adaptation in this router. Preserve pinned upstream files except
for adaptations listed in `upstream.json`. Refresh the revision, inventory,
license and adaptations together. Verify file hashes and authored links after
changes. Do not automatically install editor plugins or alter personal settings.
