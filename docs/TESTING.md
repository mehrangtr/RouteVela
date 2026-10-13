# Checks and phase evidence

## P00 executable checks

- `npm run doctor`: required runtime and project file availability; no credentials/probes.
- `npm run check`: roadmap/state/module consistency, required documentation,
  JavaScript syntax, static module boundaries and a conservative secret-pattern guard.
- `npm test`: real tests of the project guards, context selection and evidence integrity.
- `npm run verify:evidence -- P00`: hashes/results match the checked preparation inputs.

P00 intentionally has no application, TS type-checker, Worker build or live client
connection. Its passes prove preparation-tool behavior only. Do not call them VPN tests.

## Add with the corresponding module

P01: strict typecheck/build, boundary parser, schema/semantic/capability negatives,
clock/expiry edge cases, deterministic output and typed/redacted error tests.
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

## Evidence contract

One JSON per closed phase: phase, UTC time, environment/tool versions, command/exit,
input SHA-256 manifest, acceptance IDs, results, limitations and explicit `not_run`.
Manual results include client version, network/ISP context, target category and time;
no IP/token/identifying raw data is committed. Keep private provider permission in
owner-controlled storage; the repo only contains its non-sensitive status/reference.

`npm run evidence -- P00` executes the P00 gates and writes evidence only when all
pass. It does not close a phase, grant permissions or publish. Other phase runners
must be added along with their actual tests; do not use P00 checks as substitute.
P00 documentation criteria are initially `needs_review`; after an actual review,
record the reviewer and short basis in the same evidence file before closure.
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
