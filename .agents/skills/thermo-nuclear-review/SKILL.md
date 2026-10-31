---
name: thermo-nuclear-review
description: Review On Sight Musica changes for concrete playback, security, privacy and lifecycle failures.
---

# Playback correctness review

Read root [AGENTS.md](../../../AGENTS.md), [architecture](../../../docs/architecture.md)
and the pinned [upstream review](../thermos/vendor/correctness.md). Apply the
[Thermos host mapping](../thermos/SKILL.md). Stay read-only.

Establish the reviewed revisions and assigned delta. Trace changed owners and
callers through real user entry points. Check queue identity, source switching,
late callbacks, actual clocks, provider capabilities, input validation, storage,
transcription cancellation, user-media privacy and bounded resource cleanup.
Verify required attribution and controls remain visible.
For native desktop changes, follow IPC sender checks, preload exposure, local
asset access, window placement and teardown. Confirm a wallpaper does not create
an independent audio owner or hide a provider that requires visible controls.

Report defects introduced or worsened by the change. Each finding needs severity,
file/line, trigger, observable impact and owning repair. Check nearby consumers
needed to prove that path. Separate a proven defect from missing acceptance.
For docs, verify actual commands, links and claims instead of inventing product
journeys. Do not demand unrelated cleanup or speculative features.

Return prioritized findings or no actionable findings, with the reviewed scope
and evidence gaps. The implementation owner repairs confirmed defects and repeats
the affected journey before re-review.
