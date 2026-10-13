# RouteVela

A personal connectivity project focused on reliable connections, clear diagnostics,
recoverable configuration and a polished Persian/English interface.

**Current milestone: P00 preparation. No VPN runtime, usable panel or deployment is shipped yet.**
The next implementation task is selected from `STATE.json`; do not infer progress from this README.

## Start with Codex

Use Node.js 24. Run from the repository root:

```sh
npm ci
npm run doctor
npm run context
npm run check
npm test
```

Ask Codex to follow `AGENTS.md`, read `STATE.json`, and implement the next task
listed by `npm run context`. `CONTINUE.md` explains recovery after an interruption.
A paid AI API, Cloudflare credential and domain are unnecessary for P00/local P01.

## Project files

- `PROJECT.txt`: the complete Persian product and construction specification.
- `AGENTS.md`: concise coding-agent contract, including publication and token efficiency.
- `ROADMAP.json`: phase dependencies, tasks and acceptance criteria.
- `STATE.json`: current checkpoint, next task and unresolved blockers.
- `docs/ARCHITECTURE.md` and `module-map.json`: module ownership and allowed dependencies.
- `docs/TESTING.md`: meaningful checks, evidence and phase closure.
- `evidence/P00.json`: actual preparation check results and file hashes.

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
