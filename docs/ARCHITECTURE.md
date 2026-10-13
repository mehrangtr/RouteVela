# Module boundaries

Use one repository and a modular application, not a distributed service per module.
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

P00 import checks catch declared static relative imports and disallowed shortcuts.
They are an early guard, not a sandbox or a full TypeScript parser. P01 must add
compiler-backed checking of aliases/re-exports and type/build gates before app code
is considered ready. Do not permit dynamic imports to bypass the contract.

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
