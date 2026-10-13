# RouteVela coding-agent contract

## Read only what is needed

1. Read this file and `STATE.json`; inspect `git status --short` and the current diff.
2. Run `npm run context` to obtain the active phase, next task and relevant files.
3. Read the selected roadmap task and relevant architecture/specification sections.
   Do not load the entire repository, previous chats or historical research by default.
4. Check for local checkpoint commits and unfinished changes before editing. Never
   discard user changes, reset branches, or repeat successful external operations blindly.

## Protected product requirements

- Preserve free end-user access and at most two domains as the creator's mandatory
  external expense. No mandatory VPS, paid API/plan, quota evasion or multi-account rotation.
- Deliver a working connection, not just a configuration-management substitute.
- Preserve Persian/English RTL, mobile usability, polished UI, recovery and privacy.
- Preserve independent admin/subscription credentials and revocation across rollback/restore.
- Separate protocol, transport, provider, formatter and storage. Follow `module-map.json`.
- New material cost, changed user goals, destructive actions or external messages
  need specific authorization. Routine reversible coding, tests, local checkpoints
  and publication of a fully closed phase are already authorized by the owner.
- Never treat a local permission flag, OAuth consent or a disclaimer as provider permission.
  No live Cloudflare VPN deployment without applicable documented permission.
  Independent local work may continue while external permission remains unresolved.

## Implement a small vertical task

- Select one bounded task with one observable outcome; aim for 30–90 minutes of
  work, splitting larger tasks as necessary. This is a sizing guide, not a deadline.
- Before editing, identify the existing function/module to extend and its callers.
  Use `rg` and bounded reads. Reuse an existing test harness or utility when suitable.
- Add a regression test for a real bug. For new behavior, test relevant invariants,
  failure paths and integration boundaries; avoid tests that merely mirror code.
- Prefer TypeScript strict mode for application code. P00 contains only dependency-free
  Node tooling; establish pinned compiler/build tooling in P01 before claiming type safety.
- Inject clock, random source, repositories and I/O through small ports where needed.
  No DI framework, microservices, generic plugin engine or custom cryptography.
- Keep security changes readable. Do not hide code through obfuscation for ownership.
- Expose only public module contracts. No UI/database shortcut, provider-specific API
  in domain/compiler, or raw production secrets in fixtures, diffs or logs.

## Checks and evidence

- Run affected tests during work. At phase closure run all required gates in
  `docs/TESTING.md`; add real application/type/build/compatibility checks as code appears.
- A cached pass is valid only for identical relevant inputs and tool versions.
  Rerun after relevant changes or failures; do not repeat an unchanged green suite needlessly.
- Local syntax/import checks are not a TypeScript type checker or a live-network test.
- Record commands, exit codes, input hashes, versions and outcomes in one concise
  `evidence/Pxx.json`. Do not invent execution, coverage, permissions or benchmarks.
- Manual import/connect tests require actual client/core versions and environment.
  `not_run` is not `pass`. Failed/missing acceptance criteria prevent phase closure.
- Keep detailed temporary logs locally/CI artifacts; keep secrets out of both.

## Checkpoint and resume

- Update `STATE.json` at task boundaries and before interruption/context handoff:
  phase, completed task IDs, exact next task, changed paths, checks, blocker and safe resume action.
- If no Git commit captures the checkpoint, retain the working tree and identify
  it explicitly. Local WIP commits are allowed; do not publish an unfinished phase.
- On resume inspect diff/checkpoint first, then continue the next incomplete action.
  Do not reinstall dependencies if lockfile/runtime are unchanged and installation is healthy.
- Limit an identical failing retry to two attempts. Then classify the cause and
  change the approach or record a specific blocker; no unbounded retry loops.

## Publication and reporting

- Publish to GitHub only after a phase is fully closed, unless the owner explicitly
  requests earlier publication. Do not push every small task or create report-only commits.
- Before publishing: review diff, run closure checks, update evidence/state, scan
  tracked files for secrets and confirm the remote head. Preserve concurrent changes;
  never force-push. Verify the resulting remote tree/head and CI status honestly.
- Default to one coherent phase commit. If branch rules require a PR, create it
  with concise problem/result/validation text; follow actual repository rules.
- Each phase gets one short result (roughly 3–6 bullets) plus machine-readable evidence.
  Do not create daily reports, duplicate handoff files, analysis diaries or transcripts.
- `PROJECT.txt` owns requirements, `ROADMAP.json` owns tasks, `STATE.json` owns
  progress, and evidence owns test outcomes. Update those in place; avoid rival authorities.
- Respond to the owner in Persian with English identifiers isolated in code spans.
  Keep source identifiers and technical repository guides in clear English.

## Token efficiency and code review

- Use targeted searches, file slices, concise tool output and the generated context pack.
  Read lockfiles/generated bundles only to diagnose a relevant problem.
- Keep fixed rules short and stable; keep changing progress in STATE. Prefer code,
  tests and small schemas over repeated prose. No claimed percentage token savings.
- Do not downgrade security, quality or tests to save tokens. Use deeper reasoning
  for protocol/auth/migration decisions; use focused edits for routine changes.
- Flag credential leaks, revocation resurrection, unbounded buffering/retries,
  provider imports in the core, paid dependencies, deceptive connectivity claims,
  and provider-policy bypasses. Check behavior rather than naming or formatting only.
