# Checks and phase evidence

## P00 executable checks

- `npm run doctor`: required runtime and project file availability; no credentials/probes.
- `npm run check`: roadmap/state/module consistency, required documentation,
  JavaScript syntax, static module boundaries and a conservative secret-pattern guard.
- `npm test`: real tests of the project guards, context selection and evidence integrity.
- `npm run verify:evidence -- P00`: hashes/results match the checked preparation inputs.
- `npm run verify:prep`: doctor, check, tests and explicit P00 evidence verification.

The check command also rejects raw Arabic-script text in repository files. This
enforces the owner's current English-file policy; it is not a general language
classifier. Localized UI data uses Unicode escapes, with decoded-text and RTL
tests. English documentation does not remove the Persian product requirement.

P00 intentionally has no application, TS type-checker, Worker build or live client
connection. Its passes prove preparation-tool behavior only. Do not call them VPN tests.

## Add with the corresponding module

P01: strict typecheck/build/lint, compiler-backed import/re-export/alias boundaries,
schema/semantic/capability negatives, bounded profile input, clock/expiry edge
cases, deterministic output and stable typed/redacted error-catalog tests. Review
dependencies and audit findings under docs/DEPENDENCIES.md; unavailable registry
checks are not passes. Record the early feasibility checkpoint separately from
the local automated gates, without requiring external permission to finish P01.
P02: protocol parsing of fragmented/truncated/malformed input; TCP/WS stream limits,
timeouts, cancellation, backpressure, reconnect and cleanup against controlled local
peers. Live Cloudflare tests only for a permitted, scoped free deployment.
P03: pinned sing-box/Mihomo core parse checks; subscription update/auth; actual device
import and connection matrix. No GUI/mobile test claimed from CLI parsing alone.
P04: admin/subscription separation, brute-force bounds, CSRF/cookies/session expiry,
credential rotation/revocation, recovery and active-session revocation policy.
P05: atomic config activation, failure injection, revoked-token rollback/restore,
wrong backup password, corruption, restore on fresh install and failed migrations.
P06: keyboard/mobile/RTL/a11y, novice installation, interrupted/repeated installer,
resource ownership/removal, clean diagnostics and permission transparency.
P07/P08: limited real-user matrix, controlled network performance, cold start,
resource/quota budget, publication integrity, dependency licenses and release provenance.
P09: native fallback/core capability, stale results, switching hysteresis, probe budget;
never assume arbitrary JS execution from a subscription or seamless TCP migration.
The optional bootstrap evaluation may be deferred with reasons. If implemented,
test authenticated catalog update, tampered/expired/revoked entries, offline first
use, bounded retries and quota/destination/time enforcement. Keep TLS verification;
test failure recovery without capturing provider login. A website-only proof
cannot establish device proxy control or an enforced relay byte quota.

## Human, device and network observations

P03 records each parse/import/connect/update separately for a named device, OS,
client and core version. A headless core invocation is not a mobile import test.
The observer may be an owner, tester or directly instrumented device runner;
record the actual method and artifact, not an invented identity. Privacy-preserving
network labels suffice; do not store identifying IP addresses or browsing data.

P06 minimum formative check: three first-time participants attempt the guided
install-to-first-connection flow without operator intervention. Record completion,
elapsed time, assistance, failures and external-account/permission blockers for
all attempts; required flows need three successful unassisted completions after
fixes, with previous failures retained. This is a small usability gate, not a
population success-rate estimate or a promised 15-minute install.
Check the declared mobile viewport down to 360 CSS px, keyboard-only core actions,
focus order, visible labels and decoded RTL text/technical identifiers. No blocking
overflow or inaccessible core action. Automated a11y checks supplement manual
review; a Lighthouse score alone cannot pass this gate.

P07 minimum limited-beta matrix: at least three distinct target networks and
three device/client-version combinations, with every claimed supported combination
actually tested. Identify untested cross-combinations; three networks plus three
devices do not imply nine combinations. Record tester/trial counts and denominators,
not a mandatory invented population of ten users or unsupported reliability claims.
Rerun failed required cells after fixes and retain failure history.

Profiles/playground tests must cover malformed/oversized input, unsupported fields,
HTML injection, explicit fetch/activation, redacted previews, stale observations and
credential revocation across profile history. Browser failures without observable
causes stay unknown; server health never becomes a user connectivity pass.

## Evidence contract

One JSON per closed phase: phase, UTC time, environment/tool versions, command/exit,
input SHA-256 manifest, acceptance IDs, results, limitations and explicit `not_run`.
Manual results include client version, network/ISP context, target category and time;
no IP/token/identifying raw data is committed. Keep private provider permission in
owner-controlled storage; the repo only contains its non-sensitive status/reference.
Record actual execution context and review method. CI, owner and agent labels are
provenance, not proof or a substitute for the underlying observation. Current CI
already reruns local gates independently of the local process; its status is
not observed until a real run is checked. It is not an independent code audit.

Before P02 can be marked closed, both CF_PERMISSION and FREE_EGRESS must have
exactly one resolved blocker entry and a nonempty evidence_ref. The guard rejects
missing/duplicate/unresolved entries. It checks structure, not the authenticity or
applicability of permission; review the referenced evidence before resolving it.

`npm run evidence -- P00` executes the P00 gates and writes evidence only when all
pass. It does not close a phase, grant permissions or publish. Other phase runners
must be added along with their actual tests; do not use P00 checks as substitute.
P00 documentation criteria are initially `needs_review`; after an actual review,
record the reviewer and short basis in the same evidence file before closure.
When preparation documents/guards change, regenerate and review P00 evidence for
the revised inputs; do not retain stale hashes or relabel old tests as new. The
previous record remains in Git history. Verification checks current file hashes,
not cached execution validity across arbitrary tool/runtime versions.
CI's P00 evidence verification must advance to the newly closed phase's actual
runner/gates when implementation changes these hashed inputs; historical evidence
is a snapshot, not a requirement to preserve every P00 file forever.

Before closing any implementation phase, run the full applicable gates and review
all acceptance criteria. Update STATE and evidence in the same local milestone.
Publish only that closed milestone; verify remote head/tree and classify CI as
passed/failed/not_observed. Never manufacture a successful remote CI result.

## Performance acceptance

Evaluate identical devices/core versions, ISP, targets, time window and settings.
Record connection success, setup time, median/p95 latency, download/upload throughput,
reconnect behavior, CPU/memory and probe overhead. ICMP ping alone is insufficient.
Choose the shortest reliably successful permitted path, then compare latency/speed.
Fragment, Mux, DNS, placement and ProxyIP are hypotheses for A/B tests, not defaults
that automatically improve every network. Do not disable TLS verification to win.

Critical security invariants must pass completely; a percentage coverage target is
not evidence that revocation, recovery or protocol parsing is safe. Tests must not
hit production users/accounts or unrelated network targets. Use controlled fixtures.
