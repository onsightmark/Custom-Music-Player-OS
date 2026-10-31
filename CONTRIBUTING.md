# Contributing

On Sight Musica welcomes improvements to playback, accessibility, performance and the
listening experience. Read the [README](README.md) for setup and
[architecture](docs/architecture.md) for ownership. Coding agents also follow
[AGENTS.md](AGENTS.md).

Create a branch from `main`. Keep one understandable problem or feature in a
pull request. Explain the user-visible result, why the change belongs in its
chosen owner, how you verified it and any remaining limits.

Run the relevant commands from `package.json`. Verify behavioral changes in the
real running app on desktop and narrow layouts. Check keyboard focus, empty and
error states, persistence and cleanup. Use browser/media journeys rather than
unit tests or mocked providers. Include the revision, browser/runtime versions,
commands and observed outcomes. Label provider or OS checks that you could not run.

For native changes, build and launch the Electron app on Windows or macOS. Use
`npm run desktop:build` and `npm run test:e2e:desktop`. Keep packaging and runtime
acceptance separate. Check that there is one audio session, and that track,
seek, lyric and appearance changes reach the wallpaper.

Before distributing desktop packages, manually verify placement behind desktop
icons, click-through, tray recovery, monitor changes, lock and wake, and clean
exit on the target machine. Confirm that exiting restores the existing desktop.
Record the OS version and display scaling. Native CI that lacks a usable desktop
session must report that failure instead of skipping it and claiming a pass.

Do not commit credentials, account state, personal recordings, generated test
reports or media without redistribution rights. Document fixture provenance.
Respect provider controls, attribution and supported playback capabilities.

A new dependency should remove a concrete maintenance burden or provide a needed
capability. Prefer a clear owner and a small interface over another abstraction.
Remove replaced code and update its callers in the same change.

For defects, include reproduction steps, browser/OS versions and the observed
result. Remove private URLs, cookies and local media from attachments. Report
security problems using [SECURITY.md](SECURITY.md).

Contributions are provided under the project's [MIT license](LICENSE). Third-party
resources retain their own notices.
