# Engineering roles and workflows

Read [AGENTS.md](../AGENTS.md) first. It owns the engineering and acceptance rules.
The profiles assign work without changing permissions or selecting a model.

## Agent profiles

| Profile in `.codex/agents/` | Responsibility                                                   | Write scope                            |
| --------------------------- | ---------------------------------------------------------------- | -------------------------------------- |
| `media-engineer`            | Playback, provider contracts, lyrics processing and cleanup      | Assigned implementation files          |
| `desktop-engineer`          | Native wallpaper windows, IPC, lifecycle and packaging           | Assigned desktop and native files      |
| `experience-engineer`       | Layout, queue, lyrics presentation, appearance and accessibility | Assigned implementation files          |
| `journey-verifier`          | Real browser/media journeys and observed evidence                | Assigned acceptance and evidence files |
| `playback-reviewer`         | Independent correctness, security, privacy and lifecycle review  | Read-only                              |
| `code-steward`              | Independent ownership, readability and dependency review         | Read-only                              |

Current [Codex custom agents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
use standalone project TOML files with `name`, `description` and
`developer_instructions`. The profiles inherit the parent's selected model and
permissions. `.codex/config.toml` caps concurrent subagents at three.

A host that cannot discover these files can read a profile and pass its
instructions through its agent tool. State that mapping honestly. A read-only
role is an instruction, not a separate operating-system sandbox. Do not claim
automatic loading, model diversity or capability isolation that was not observed.

Before parallel editing, give each worker its base revision, exclusive paths,
intended behavior and acceptance criteria. Serialize changes to shared contracts.
The coordinator reviews the combined diff and evidence before publication.

The desktop owner receives the player-to-wallpaper contract before editing.
Keep native window operations in `desktop/` and the Windows attachment module in
`native/`. The renderer owner controls presentation. The player remains the only
audio owner. IPC and storage changes need both owners to review their boundary.

## Pstack and Thermos

The [Pstack adapter](../.agents/skills/pstack/SKILL.md) routes all 54 upstream
skills from `cursor/plugins` 0.15.25, pinned at
`ac4e25a0064cd600afdd605208bad72748cb019a`. Unslop is part of that bundle. The
[Thermos adapter](../.agents/skills/thermos/SKILL.md) maps the pinned upstream
review prompts to the project's two independent review roles.

Both bundles preserve their MIT licenses and source inventories. Project rules
live in root AGENTS and adapters. Vendor tool names, model defaults, personal
settings and unit-test workflows do not override them. Optional upstream scripts
are reference resources, not application dependencies or verified commands for
this host. Inspect their effects before use.

For a full Pstack review, inspect every leaf, apply the relevant workflows and
record out-of-scope leaves in task evidence. Do not run unrelated workflows to
inflate coverage. Do not describe reading a leaf as executing its workflow.

Thermos reviewers receive the same revision, scope and existing evidence. Each
finding identifies a trigger, observable consequence and owning repair. The
implementation owner fixes confirmed defects and repeats affected journeys.
Subsequent rounds check repaired boundaries and new evidence. Keep review diaries
and screenshots in task artifacts, not the application source tree.

Review changes in separate rounds when new evidence or repairs change the scope.
Record the reviewed revision, finding, owning repair and affected journey. A
count of review rounds is not a substitute for resolving a defect. Do not count
the same unchanged diff as a fresh audit.

Verify pinned source hashes after changing either bundle:

```sh
node .agents/verify-vendor.mjs
```

The inventories record local adaptations. This command checks preserved vendor
bytes, not the correctness of the application or compatibility of vendor tools.
Refresh the revision, inventory, license and adaptations together.
