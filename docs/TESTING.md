# Checks and phase evidence

## P00 executable checks

- `npm run doctor`: required runtime and project file availability; no credentials/probes.
- `npm run check`: roadmap/state/module consistency, required documentation,
  JavaScript syntax, static module boundaries and a conservative secret-pattern guard.
- `npm test`: real tests of the project guards, context selection and evidence integrity.
- `npm run verify:evidence -- P00`: hashes/results match the checked preparation inputs.
- `npm run verify:prep`: doctor, check, tests and explicit P00 evidence verification.

The list above describes the historical P00 snapshot. After P01 implementation,
verify:prep only runs current preparation checks/tests; old P00 hashes intentionally
do not match the new implementation. Use the current phase's runner below.

## P01 executable gates

- `npm ci --ignore-scripts --no-audit --no-fund`: clean, integrity-checked locked install.
- `npm run doctor` and `npm run check`: repository/state/script/secret guards and
  compiler-resolved module graph, including aliases, import types and declarations.
- `npm run typecheck`: pinned strict TypeScript with unchecked-index/optional/unused checks.
- `npm run lint`: pinned ESLint with type-aware TypeScript rules and zero warnings.
- `npm test`: clean TypeScript build, followed by every existing Node test file.
  Tests exercise built domain/config/compiler/app code and negative architecture fixtures.
- `npm run audit`: registry advisory check, fails on high/critical findings.
- `npm run verify`: the current validation gates above except the explicit install.
- `npm run demo`: built parse -> validate -> render pipeline for the synthetic fixture.
- `npm run evidence -- P01`: real clean install and current phase gates with exact
  input hashes/versions/test counts; feasibility acceptance initially needs review.
- `npm run verify:evidence -- P01`: current manifest, expected acceptance IDs and
  required command records. This verifies the record, not provider permission or
  an independent rerun. CI separately executes npm run verify.

Fake clock/random/in-memory repositories are test-only ports. Credential-policy
tests are metadata-policy checks, not token/password verification or durable storage.
The P01 sing-box fixture was tested byte-for-byte. P02 adds the real core parser
and loopback connection checks below; desktop GUI/import and Internet connectivity
still require their corresponding permitted trials.

## Partial local P02 gates

`npm run evidence -- P02` runs locked install and all local strict build/type/lint/
module/tests/audit gates, then records P02-A1 pass and P02-A2/A3 not_run with
scope local_partial and phase_readiness blocked. `npm run verify:local-evidence`
checks those specific local claims, hashes, required commands and positive test
counts. It cannot turn missing live permission/free-egress checks into passes.
`npm run verify:evidence -- P02` must reject the incomplete live phase.

Existing tests cover every incomplete VLESS prefix, all header fragmentation
boundaries, IPv4/domain/IPv6, owned Buffer payload, unsupported addons/commands,
auth-before-dial, shared handshake deadline, late connect disposal, bidirectional
backpressure/half-close, idle/lifetime/cancellation limits, malformed/big/empty
frames, safe failures, no partial-write replay and bounded cleanup.
Actual loopback TCP and a Node native WebSocket client against a ws test server
exercise composed forwarding and disposal. Those peers bind only 127.0.0.1.
Verified loopback TLS adds a generated, short-lived CA and server certificate,
explicit trusted-CA/name verification, and untrusted-CA/wrong-name rejection
before entering a VLESS session. No system certificate store is changed.
Loopback tests are not an ISP trial, production deployment or a native Windows pass. Port adapters must enforce their own queue bounds,
authentication and destination restrictions before a live runtime is considered.

`npm run test:core` builds the core and runs eight controlled connection cases plus
the unchanged renderer-output parse check against official sing-box 1.12.0. The
artifact tool fetches the matching Windows/Linux x64/arm64 release, verifies the
pinned upstream archive digest before extracting/executing, and rejects tampering.
It needs curl/tar and HTTPS access to github.com/release-assets.githubusercontent.com
on first use; a verified archive can be reused offline. This command is separate
from `npm test` so ordinary unit/TLS tests do not download an executable. It is
required by the partial P02 evidence runner and configured on both CI platforms.
The actual HTTP request passes through the core's loopback mixed proxy, VLESS,
verified WSS and RouteVela's handler into a restricted, owned loopback destination.
The response body must match exactly; denied credentials, destinations and wrong
TLS names must never reach that destination. No permissive production dialer,
Internet egress, GUI app or live provider is tested. Temporary config/test trust
is removed with the child process and servers. The exact rendered config is checked
unchanged; connection cases explicitly override only loopback ports/address/path,
the local CA/name, and credentials in the negative case. No insecure TLS option is used.

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

Windows and Linux are required targets. Automated CI uses windows-latest and
ubuntu-latest, with independent results (fail-fast disabled). Each job runs the
same locked install, strict build/type/lint/module tests, audit and evidence check.
Record observed jobs; a Linux pass or simulated Windows command plan is not an
executed Windows pass. CI Windows Server coverage does not replace desktop testing.
The platform tests cover literal process arguments, paths with spaces and test
discovery without shell globs; architectural fixtures also use a spaced directory.

P03 must include actual Windows and Linux client import/connect/update checks;
P06 must include the web installer/help/keyboard/RTL flows on both. Record Windows
version, Linux distribution, architecture, browser and client/core versions. Test
path/permission differences, interrupted setup and cleanup where an OS helper is
used; basic panel use must not require elevated privileges or WSL.

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

The relay now enforces one maxSessionBytes allowance across both directions,
including the initial VLESS payload. The default is 16 MiB per session; explicit
positive safe integers up to 1 GiB are accepted. Invalid/absent values fail closed.
A whole chunk is reserved before awaiting a write, so concurrent directions cannot
spend the same allowance. Over-budget chunks are not partially forwarded and the
session closes with RV-TRANS-008, without automatic reconnect or replay. Initial
payload already above the limit is rejected before authorization/dial/success reply.
Exact-boundary, concurrent pending-write, initial-payload and cleanup regressions
exercise this behavior, including an actual-core over-budget HTTP response trial.
These are application forwarding limits, not account-wide billing quotas: protocol
framing and bytes received into an adapter are excluded, and ports still need their
own queue/connection limits before production deployment.

The real-core parallel-isolation case holds destination responses until six
independent sessions are active. Five requests receive distinct expected bodies;
the sixth exceeds its session byte budget. All five healthy sessions must still
succeed, exactly one session must report RV-TRANS-008, and all twelve source/peer
ports must close. A response barrier proves overlap without fragile timing checks.
This bounded local concurrency check is not a production capacity benchmark.

Actual-core interruption recovery destroys the source stream after the target
receives its first request. That session must fail safely, both ports must close,
and an explicitly requested fresh session must succeed. Exactly two requests and
sessions rule out automatic replay. A separate repeated-session case runs twenty
requests through one running core, verifies a distinct response and zero active
sessions after every request, and checks all retained source/peer ports are closed.

`npm run profile:core` builds then repeats the full core suite three times in fresh
Node hosts. Each host runs with --test-isolation=none and a preload RSS/CPU observer,
so measurement covers the actual test host rather than an idle runner parent.
CPU user/system time and 10 ms sampled RSS, baseline/final heap and RSS, wall time,
positive clean test counts and fresh run IDs are stored in ignored .tmp/core-profile.json.
The P02 runner validates the fresh profile ID/input manifest and records these
observations in evidence/P02.json; CI is configured to run the profile on both OSes.
They include Node test/TLS setup/adapters and exclude the separate sing-box child,
build time, cloud runtime and ISP. Sampling can miss brief peaks. No memory leak,
production capacity, billing or throughput conclusion follows from these numbers.

CI failure annotations expose only source basenames/line numbers, known core case
names, stable error/stage codes and small numeric/boolean assertions. They omit
raw exception/config/payload strings. This permits diagnosis from public job
annotations when GitHub log authentication is unavailable. Full logs remain under
GitHub's normal access rules; no access controls or tests are bypassed.

Native CI exposed a test-adapter shutdown race: the generic ws stream finalizer
could wait for TCP finish after the client had already closed the WebSocket.
The WebSocket port now awaits the public ws close API/event and acknowledges an
already-closed transport, while read/write errors and session deadlines remain
strict. TCP port end similarly acknowledges a previously finished writer and
rejects an abruptly destroyed unfinished writer immediately. Regressions cover
both states and peer-first WebSocket close; no test expectation or budget is relaxed.

`npm run test:lab` executes the bounded loopback CLI harness in a child process.
Smoke, one-second auto-stop and stdin stop cases require the exact owned response,
zero failed/active sessions, closed proxy/WSS/target ports and no leftover temporary
config or extracted executable. Argument tests reject public bind/destination
options and unbounded durations. Native CI runs this alongside core/profile tests;
it is also required in partial P02 evidence. The persistent cached archive is
intentionally retained and reverified. No external provider or GUI is involved.

Local-lab startup rollback is exercised at target_ready, tls_ready and client_ready
using a test-only lifecycle observer. Injected failures must never report ready;
owned ports/config/extracted executable and process signal listeners must disappear,
and an immediate fresh smoke run must succeed. Direct API calls validate bounded
options before allocating resources and snapshot them before asynchronous startup;
mutating caller input cannot alter the validated lifetime. Failure injection is not exposed as a CLI flag
and observations contain only stage names and loopback port numbers.
