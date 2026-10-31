# On Sight Musica engineering

On Sight Musica is the app in `Custom-Music-Player-OS`. Read this file before editing the
app or its engineering resources. It owns project rules. Skills and agent roles
add workflows, not permissions.

## Working agreement

- Finish requested behavior and relevant verification. Make routine reversible
  decisions without waiting for confirmation. Report only concrete blockers.
- Assign exclusive write paths before parallel work. Preserve unrelated and
  concurrent changes. The coordinator owns integration and the final diff.
- A request for a pull request permits publishing that pull request. It does not
  authorize merging, deployment, force-pushes or deletion of user data.
- Keep credentials, private source, account sessions and personal media out of
  commits and evidence. Do not read ignored secret files to check configuration.

## Ownership and product behavior

- Give queue state, active playback, provider integration, lyrics and appearance
  one owner each. Fix the first incorrect owner. Migrate callers and delete
  replaced code in the same change.
- Keep native window placement and application lifecycle in `desktop/`. The
  wallpaper receives presentation state from the player. It must not open a
  second audible player or a second provider connection.
- Treat preload and native messages as untrusted boundaries. Expose named
  operations, validate the sender and payload, and keep Node access out of
  renderer pages. Never give remote provider frames a privileged bridge.
- Keep the app understandable to a first-time contributor. Use existing
  dependencies where they suffice. Add an abstraction only when it owns a real
  boundary or removes repeated behavior. Avoid generic utility buckets,
  pass-through wrappers and speculative extension systems.
- Verify current official provider documentation before changing an integration.
  Distinguish official embeds, authenticated SDKs, previews, external handoffs and
  local media in code and user-facing claims. An iframe loading does not prove
  that a full song played.
- Preserve provider controls and attribution. Do not scrape streams, proxy
  protected media, bypass DRM or hide required player UI. Advertise synchronized
  lyrics or background video only for sources that support and permit them.
- Keep local media on the user's device. Treat imported lyrics as untrusted text,
  never HTML. Do not bundle recordings or lyrics without redistribution rights.
- Make transcription opt-in. State the model download and processing location
  before starting. Bound work, allow cancellation and label inferred lyrics as
  estimates. Never upload a recording as an implicit fallback.
- Validate URLs, files, restored state and provider messages at their owning
  boundary. Use precise types for loading, ready, blocked and failed behavior.
  Scope late callbacks to the source that created them.
- Give timers, subscriptions, script loaders, object URLs, workers and media
  elements an explicit cleanup owner. Stop previous playback before switching.
  Bound queues, imports, requests, polling, retries and saved data. Do not mask
  repeated failures with retry loops or fabricated success states.
- Prefer CSS for visual effects. Keep text readable, respect reduced motion and
  preserve keyboard focus. Pause unnecessary animation and work when inactive.
- Name code for what it does. Avoid silent coercion, swallowed errors,
  disconnected controls and TODO implementations. Do not add explanatory source
  comments. Preserve required license notices.

## Verification

Establish intended behavior and plausible failure paths before implementation.
Consider invalid URLs, unavailable media, denied autoplay, rapid source changes,
late events, queue exhaustion, reloads, storage failures and cleanup. Implement
complete behavior before adding acceptance journeys.

No unit tests or mocked acceptance. Exercise the real running application under
`tests/e2e/` with media the project may redistribute. Document fixture provenance.
Do not substitute provider responses, fake SDK events, patch browser media clocks
or relabel imported-function checks as E2E.

Prove media time advances, pauses, seeks and ends where relevant. Check lyrics
against the actual playback clock. Exercise desktop and narrow layouts, keyboard
navigation, focus, persistence, empty/error states and console/network failures.
Keep local-media evidence distinct from live-provider and OS installation proof.
For desktop work, run the packaged application on the target OS. Check wallpaper
placement relative to desktop icons, click-through, display changes, exit and
restore behavior. A fullscreen window or Linux browser pass is not proof of
Windows or macOS wallpaper behavior.

Static checks do not establish product behavior. Keep runnable commands in
`package.json`. Record revision, runtime/browser versions, exact commands,
scenario and observed outcome with relevant screenshots or logs. Keep transient
review diaries and generated evidence out of product source. A missing prerequisite,
zero selected tests, unexpected skip or failed journey is not a pass. Leave the
pull request draft when required acceptance remains blocked.

## Skills and review

Use the [Pstack adapter](.agents/skills/pstack/SKILL.md). Read a principle's leaf
before claiming it shaped a decision. Full-catalog requests require inspecting
all leaves and recording which apply or are out of scope. Use bundled Unslop for
docs and pull request prose. Vendor defaults never override this file or the user.

Use [Thermos](.agents/skills/thermos/SKILL.md) for shared playback/provider changes
and explicit review requests. Give independent correctness/security and
maintainability reviewers the same revision, scope and actual evidence. Keep
reviewers read-only. Repair grounded findings at the owner, re-run affected
journeys and re-review changed boundaries until no actionable findings remain.
Reviewer agreement does not prove live playback.

The [engineering guide](docs/engineering.md) describes project roles and workflow
resources. Keep durable guidance in its owner instead of copying rules into every
profile, skill or dated task log.
