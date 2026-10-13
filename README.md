# RouteVela

A personal connectivity project focused on reliable connections, clear diagnostics,
recoverable configuration and a polished Persian/English interface.

**Current implementation: strict local core, user/credential policies, profile
validation/config rendering, bounded VLESS TCP parsing and timed byte relay.
Controlled loopback TCP/WebSocket integration works. Live VPN and panel are not
shipped; P02 external feasibility gates remain unresolved.**
The next implementation task is selected from `STATE.json`; do not infer progress from this README.

## Start with Codex

Use Node.js 24. Run from the repository root:

```sh
npm ci
npm run doctor
npm run context
npm run verify
npm run demo
```

Ask Codex to follow `AGENTS.md`, read `STATE.json`, and implement the next task
listed by `npm run context`. `CONTINUE.md` explains recovery after an interruption.
A paid AI API, Cloudflare credential and domain are unnecessary for P00/local P01.
`verify` runs strict type checking, type-aware lint, resolved module boundaries,
compiled integration/unit tests and dependency audit. `demo` builds and renders
the synthetic example through the real validation/compiler pipeline; it performs
no network requests and its example.invalid endpoint is not a working connection.
The output target is a sing-box 1.12.0 schema fixture; actual core/device validation
belongs to P03. `verify:prep` runs basic preparation checks/tests without claiming
the historical P00 evidence matches changed inputs.

## Project files

- `PROJECT.txt`: the English product and construction specification.
- `AGENTS.md`: concise coding-agent contract, including publication and token efficiency.
- `ROADMAP.json`: phase dependencies, tasks and acceptance criteria.
- `STATE.json`: current checkpoint, next task and unresolved blockers.
- `docs/ARCHITECTURE.md` and `module-map.json`: module ownership and allowed dependencies.
- `docs/TESTING.md`: meaningful checks, evidence and phase closure.
- `evidence/P00.json`: the historical preparation snapshot, retained unchanged.
- `evidence/P01.json`: historical local-foundation snapshot.
- `evidence/P02.json`: partial local parser/stream evidence; live connection and
  provider/cost acceptance are explicitly unrun.
- `docs/DEPENDENCIES.md`: dependency provenance, licensing and audit policy.

The revised design brings feasibility review into P01, adds a small profile library,
safe config preview and staged diagnostics, and defers optional bootstrap integration
until after the core release. Offline installation help is planned for P06. These
are roadmap requirements. The local core and controlled connection slice are
implemented; there is no UI profile library, production authentication or database yet.

Current local validation: `npm run verify` and `npm run verify:local-evidence`.
The latter checks only partial P02 evidence; it cannot close P02 or establish a
permitted free Internet connection. Mobile native apps are deferred; development
continues for Windows/Linux. A native Windows run is not yet observed here.

Repository text is English. The product still targets Persian/English and RTL;
future localized resources use escaped Unicode, with decoded-text tests.

## Windows and Linux targets

RouteVela targets both Windows and Linux. The intended service runs on the
operator's permitted cloud account; its web panel is accessed in a browser and
the connection is used through a compatible client on either desktop OS.
The current implementation is the local Node.js foundation, not that finished UI.

For development, install Node.js 24 and Git, open the checkout in PowerShell on
Windows or a shell on Linux, and run the same commands shown above. WSL and Bash
are not requirements on Windows. Paths/processes use Node APIs; test discovery
does not rely on shell glob expansion. CI is configured for ubuntu-latest and
windows-latest. A configured job is not an observed Windows pass.

Real desktop browser/client import, connection, update and recovery must be tested
on both systems in P03/P06 before publishing supported versions. Initial release
documentation must name the tested Windows version and Linux distribution; CI
runner coverage alone cannot establish desktop GUI or network compatibility.

## Important boundaries

End-user connections must be free; the creator's required recurring external
expense is limited to at most two domain registrations/renewals. Free quotas,
availability and provider terms still constrain delivery. A management panel
without a working, permitted, free connection does not fulfill the product goal.

Cloudflare's ordinary Self-Serve agreement restricts VPN/similar proxy services
unless expressly permitted in writing. Pages Functions share Workers resources;
Pages is not a permission exception. Local development can proceed; publishing
this repository is distinct from deploying a VPN service on Cloudflare.

## Ownership

This is a public, **restricted-use source repository**, not an open-source license
grant. See `LICENSE`. Public visibility permits viewing/forking under GitHub terms;
it cannot prevent copying. No copy-protection tracking, central kill switch or
hidden activation service is planned. Third-party rights remain separate.
