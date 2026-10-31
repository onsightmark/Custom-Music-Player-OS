# Security

## Report a vulnerability

Use GitHub's private vulnerability reporting for this repository when it is
available under the Security tab. If it is unavailable, open an issue asking the
maintainer for a private contact method. Do not publish exploit details,
credentials, account sessions or personal media in that request.

Include the affected revision, browser and OS versions, reproduction steps and
observable impact in the private report. Share the smallest reproducible input
that demonstrates the issue without exposing someone else's data.

## Boundaries

On Sight Musica runs in a browser or an Electron desktop app and does not require
a backend account or an application API secret. Local media stays on the user's device. Provider
players communicate with their own services and remain subject to those
services' privacy behavior and restrictions.

Electron loads the bundled application through the `musica://app` origin. Its
protocol handler must stay inside the built application directory. Renderer
pages have no Node integration. The preload exposes named wallpaper operations
and player visibility; IPC validates both the sender and the message. Remote provider frames must
not gain access to that bridge.

The wallpaper is a read-only presentation of the current local track. It must
not open another audible player, extract protected media or accept arbitrary
filesystem paths from renderer messages. Native attachment changes the app's
own window placement, not the user's saved wallpaper preferences.

Treat file contents, lyric text, URLs, provider messages and browser storage as
untrusted inputs. Keep playback resources and transcription work bounded. Do not
add remote code evaluation, media extraction, a general URL proxy or implicit
uploads as a convenience fallback.

Unsigned development packages have not passed Windows signing or macOS
notarization. A package build does not establish installation or operating-system
trust. Do not publish signing keys, certificates or notarization credentials in
the repository or build artifacts.

## Dependency maintenance

The 2026-10-31 review of this lockfile found 31 affected dependency entries in
`npm audit`: 29 moderate and two low, with no high or critical entries. They trace
to three advisories in the build, lint and packaging dependency graph:

- [deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4): untrusted merge
  input can affect the prototype of a returned object.
- [glob](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4): an aborted traversal
  can continue consuming filesystem and CPU resources.
- [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249): certain untrusted
  patterns can cause excessive CPU and memory use during optimization.

The separate `npm audit --omit=dev` run reported zero advisories. That result
uses npm's dependency classification. Electron is a development dependency
that ships as the desktop runtime, so the result is not a desktop security
certification. The tooling advisories above remain unresolved in this lockfile;
31 affected entries do not mean 31 independent vulnerabilities.

Review current compatible upstream fixes before changing the dependency graph.
The audit's automatic suggestions include major downgrades of build tooling;
do not apply them blindly. Re-run the relevant build, browser and desktop
acceptance after dependency changes, and update this status when the lockfile
or advisory results change.

Only the current `main` branch is maintained. There is no promised response time
or long-term support for older revisions. A public preview or draft pull request
is not a security certification.
