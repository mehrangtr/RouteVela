# Resume RouteVela

Run from the repository root:

```sh
git status --short
npm run context
npm run doctor
```

Read `AGENTS.md`, then the next task from `STATE.json`/the context output. Inspect
uncommitted changes and recent local checkpoint commits. Preserve unfinished work;
rerun only checks invalidated by changes. Continue from the first incomplete action.

Suggested owner prompt for Codex:

> Follow AGENTS.md. Inspect STATE.json and the working tree. Implement the next
> incomplete roadmap task in small tested steps. Preserve all product constraints.
> Keep checkpoints short. Publish only a fully closed phase, with truthful evidence.
> Continue authorized local work without repeated confirmation. Report a concrete
> blocker when a required external permission or credential is unavailable.

The current phase/next action belong only in STATE.json, not in this static guide.
A GitHub checkout cannot recover work that was never committed/pushed; keep the
same local workspace or transfer the local checkpoint when a session is interrupted.
Local commits also remain local until transferred. A wip branch in this public
repository is public; it is not an automatic or private backup mechanism.
`npm run check` always executes its guards; it does not report a cache as valid/stale.
For the current preparation baseline use `npm run verify:prep`. Application phases
must add their own actual gates and evidence runner before claiming completion.
