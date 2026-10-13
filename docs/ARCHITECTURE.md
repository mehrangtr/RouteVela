# Module boundaries

Use one repository and a modular application, not a distributed service per module.
Windows and Linux are desktop/development targets. The cloud runtime is separate
from the OS of a panel user. The web UI and existing compatible connection clients
form the initial desktop experience; core code has no dependency on a desktop OS.
`module-map.json` is the machine-readable import contract. Directories are created
when their first implementation is added in P01+, not filled with dummy classes now.

| Module | Responsibility | Boundary |
|---|---|---|
| contracts | Small shared DTOs/ports, capabilities, typed errors | No I/O/provider dependencies |
| domain | Users, expiry, policy and credential-generation state | No Cloudflare APIs |
| security | Admin identity, sessions, recovery, credential verification | Separate token purposes |
| config | Schema/semantic/capability validation and revisions | No transport implementation |
| compiler | Deterministic client-format output | No database or admin identity calls |
| subscriptions | Subscription lifecycle and representation delivery | Uses compiler/domain ports |
| protocols | VLESS parsing/commands, later protocols if justified | Transport-neutral parser |
| transports | WebSocket/stream lifecycle, flow control and cleanup | Protocol-neutral I/O ports |
| providers | Cloudflare/local adapters and capability detection | Injects provider implementations |
| storage | D1 adapter, migrations and transaction implementation | Fulfils core repository ports |
| diagnostics | Allowlisted errors and timed health measurements | No payload/browsing log |
| installer | Preflight, resource inventory, resume and selective removal | Owner-authorized changes only |
| ui | Persian/English UI and safe API client | No DB/provider privileged imports |
| app | Composition and HTTP routing | Wires modules, minimal business logic |

The P01 guard in tools/architecture.mjs uses the pinned TypeScript parser and
resolver for static imports, aliases, re-exports, import types, declarations and
reference directives. It checks real paths, public index.ts boundaries and cycles,
rejects dynamic/require loading and source files outside the build. It is an import
contract check, not a security sandbox. Typecheck/lint/build are separate gates.

Core ports: Clock, RandomSource, UserRepository, CredentialRepository,
ConfigRepository, ProtocolParser, TransportSession, ProviderAdapter, ClientFormatter.
Use narrow argument/return types. Inject dependencies in composition; avoid a DI container.

Separate logical planes without requiring extra paid hosting: UI/admin/subscription
operations are control traffic; socket streaming is data traffic. Separate auth,
routes and error budgets. They may initially share a deployment/resource quota;
module isolation alone does not guarantee process/security/failure isolation.

Credential families: admin session, subscription download token, connection credential,
installer delegation credential and backup encryption secret. Each has a distinct
purpose, lifecycle and recovery policy. Public URLs must not grant admin access.

Config publication: draft -> validate -> preview -> atomic activate -> known-good.
Rollback selects a config revision; it never rewinds credential revocations.
Restore must preserve/reconcile revocation generations; if revocation freshness
cannot be proven, rotate/invalidate affected credentials before reconnecting.

P02 traffic path to evaluate: client TLS/WebSocket -> edge adapter -> outbound TCP
where permitted/technically supported -> destination. An optional egress adapter
must have a trusted, genuinely free and permitted backend; a required paid/unknown
ProxyIP is a failed budget/viability gate. A hostname is not an independent exit.

Use bounded streaming, backpressure, cancellation and timeouts. No full connection
buffer, per-packet SQL write, frequent central probes or uncapped retry. Authentication
and revocation policy need a measured staleness bound; storage consistency must match
that bound. Never promise immediate distributed revocation from eventual-consistency KV.

Detailed health is admin-only. Public liveness reveals minimal information.
Readiness, client import and end-to-end ISP connection are distinct checks.
Errors identify component/stage/code/retryability; raw secrets and traffic are excluded.

## API, errors and profile ownership

The UI contains an HTTP API client using shared contracts. The server routes live
in app; UI never imports app or privileged backend modules. Protocol parsers remain
pure and return typed results. Transports emit observations through an injected
contracts port; composition connects diagnostics. No transports -> diagnostics
import is needed merely to describe timeouts or cleanup errors.

Define the stable RV-MODULE-NNN error catalog with typed contracts in P01.03.
Diagnostics maps safe fields to user explanations and recovery actions. Unknown
browser network errors must not be labeled as confirmed DNS/TLS/CPU failures.

Profile metadata belongs to domain; validation and revision belong to config;
rendering belongs to compiler; delivery and credential references belong to
subscriptions. Existing storage/app/ui modules implement persistence, API and
presentation. A profile library or playground does not require a new service.
Imports are bounded, validated and previewed before activation; importing a URL
does not automatically fetch it. Remote fetch, when implemented, needs explicit
intent and adapter-appropriate redirect/target/size limits. History references
credentials by purpose; it does not resurrect secrets on restore.

Observations include stage, outcome, client/core version, origin and time. Keep
parse/import/connect/update distinct; server readiness cannot assert device
connectivity. UI reports stale/unknown state rather than extrapolating a past pass.

## Optional bootstrap boundary

P06 offline guidance belongs to installer/ui and can ship without a relay. P09.05
may evaluate a reviewed tool catalog/local helper after the core is stable.
A browser cannot provide OS proxy control, arbitrary SNI probes or enforce a VPN
byte quota. Any helper must establish a trusted enforcement point, budget and
destination scope before claiming limited Cloudflare access. Verified TLS remains
end-to-end; do not introduce a root CA or intercept provider login.
Catalog provenance/expiry and endpoint health are separate checks. Updates must
not introduce a paid central service, mandatory unknown relay or public scraping.
Keep bootstrap credentials and control state separate from production credentials.

## Implemented local P01 slice

contracts defines safe Result/error catalog, DTOs and clock/random/repository ports.
domain creates immutable users and evaluates trusted expiry/purpose/generation
metadata; it does not verify a password/token or persist revocation. Atomic insert
is a repository contract exercised against the test-only in-memory implementation.
Production identity/storage adapters belong to later tasks.

config accepts bounded JSON for one VLESS/WS/TLS profile with exact keys, validated
DNS names, port, route path and connection-purpose UUID/generation. It canonicalizes
host/UUID case and freezes copied data. WeakSet provenance ensures only an unchanged
validated instance reaches compiler. The initial path/host subset is conservative;
IP literals, IDNs, other protocols and raw query/fragment paths are not supported.
No parse/render operation performs network I/O or establishes provider permission.

compiler emits one deterministic sing-box 1.12.0 schema fixture. This is a reviewed
output shape, not an executed core-parser/device compatibility claim; P03 must
validate and pin the actual supported client versions. Output contains a connection
credential intentionally, while diagnostic errors never include it. The synthetic
example uses example.invalid and a test UUID. Never reuse it as a production secret.
app composes parsing/rendering without a server or privileged I/O. npm run demo
executes this built pipeline against the synthetic fixture.

Portable developer tooling uses Node paths, file discovery and direct argument
arrays. npm subprocesses invoke npm-cli.js with process.execPath, avoiding .cmd
spawning and shell interpolation on Windows. Normalize real paths consistently
before comparing the TypeScript module graph. Later native/client/bootstrap
operations belong to OS adapters, not domain/config/compiler. Such adapters need
explicit platform/architecture selection, verified artifacts and cleanup tests
on the actual supported OS; they must not introduce mandatory admin privileges.

## Implemented local P02 slice (partial phase)

protocols implements a pure incremental VLESS v0 TCP header parser: UUID, empty
addons, TCP command, big-endian port and IPv4/domain/IPv6 address. It retains at
most 276 header bytes, accepts at most 65536 bytes per input frame and returns
an owned bounded payload. Unsupported versions, addons, UDP/Mux/reverse commands
and malformed/truncated input fail safely. Request UUID/destination are sensitive
I/O parameters, never diagnostic context. Parsing does not authorize a destination.

transports implements ByteDuplex pumping with one pending read/write per direction,
half-close/reverse drain, copied frame ownership, idle/lifetime deadlines, external
cancellation, empty-read limits and bounded cleanup. Adapter queues are an explicit
separate responsibility. Default limits are conservative local-development policy,
not measured production capacity or a promise of uninterrupted long sessions.
No automatic partial-write replay/reconnect occurs; requested fresh sessions have
independent state. An adapter that ignores cancellation/cleanup is a failed contract.

providers composes parser and transport through required authorize/dial ports.
It authorizes before opening a target, bounds the entire handshake (input/auth/dial),
closes late connections that ignored cancellation and sends the response header
only after successful authorization/dialing. There is no permissive runtime dialer,
Cloudflare deployment adapter or production credential verifier.

Tests supply loopback-only native TCP and library WebSocket adapters. Node native
stream iteration observes each readable half's EOF independently; generic Duplex
toWeb conversions were found to wait for both halves and deadlock graceful shutdown.
Those test adapters are not a released Windows/Cloudflare service. Plain TCP/ws
tests are confined to 127.0.0.1; production verified TLS remains unrun and mandatory.
