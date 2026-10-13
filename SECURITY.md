# Security and privacy

No production VPN/panel is released in P00. Do not deploy preparation tooling as a VPN.

## Initial threat model

These protections must be implemented and tested; they are not assurances about
a product that already exists. Refine this model in P01 and before P04 identity work.

| Actor or failure | Assets/boundary | Required mitigation and evidence |
|---|---|---|
| Anonymous or malicious subscription user | Admin API, other users, shared quota | Purpose-separated auth, authorization, bounded login/stream resources; cross-user negative tests |
| Stolen link/session or replay | Subscription/connection access | Rotation, expiry, active-session revocation bound and recovery tests; no admin escalation |
| Malformed profile, stream or hostile target | Parser, memory, network adapter | Input/count/byte/time limits, safe rendering, backpressure, target/redirect/loop restrictions |
| Old/corrupt backup or failed migration | Data and revoked credentials | Atomic activation, independent revocation state, fresh restore and fail-safe rotation tests |
| Compromised package, artifact or distribution domain | Build/install trust | Pins, provenance/license review, authenticated integrity and independent trust recovery; audit alone is insufficient |
| Malicious bootstrap relay/catalog or filtered network | Provider login and availability | Verified end-to-end TLS, no root CA/password interception, explicit trust/expiry, offline guidance and bounded failures |
| Lost owner device | Sessions and encrypted backups | Session revocation, tested recovery and independent backup secret |

Provider/OS/account compromise and traffic correlation remain trust assumptions
and residual risks; app data minimization cannot promise protection against them.
Local execution alone does not imply privacy. Public endpoints and distribution
artifacts are untrusted until validated; a domain allowlist is not authentication.
P02/P03 prototypes remain controlled authenticated trials. Do not expose public
admin controls while production identity/recovery are still pending.

Secrets: never commit Cloudflare/API/OAuth credentials, subscription links, connection
keys, cookies, raw backups, private signing keys or real user/traffic data. Use local
ignored secret files and provider secret bindings. Generated examples contain labels,
not working credentials. A pattern check is only a first guard, not a comprehensive scan.

Required implementation protections: unique admin bootstrap; admin/subscription
isolation; secure session cookies and CSRF defenses where applicable; expiry/revoke
checks; recovery tests; cryptographic randomness; vetted crypto/password libraries;
strict protocol input bounds; SSRF/loop/unsupported-target rejection appropriate to
the adapter; bounded resources; verified TLS; graceful failure with no insecure fallback.

Privacy: collect only data needed for account/config operations. No browsing-history,
packet/payload/destination logs or central network analytics by default. Diagnostic
exports are allowlisted, locally previewed and explicitly sent by the user. Provider
infrastructure visibility is separate from the app's storage claims. Backups require
an independent recovery secret and must not restore revoked credentials as active.

Ownership: restricted LICENSE and attribution protect permitted use; public source
cannot prevent copying. Do not add spyware, tracking identifiers, destructive anti-copy
behavior, license locks requiring a paid service or an owner backdoor. Protect live
installations through authentication, authorization and secret handling.

Report a vulnerability through this repository's Security Advisories/private reporting
if available. If unavailable, contact the maintainer using a verified GitHub contact;
public issues must omit exploit secrets and identifying data. Do not invent a contact
address. Private reporting/branch protection still require repository settings setup.

Before beta, verify a functioning private reporting channel and record its status;
do not invent an email address or response-time commitment. Review available branch
protection, secret scanning and dependency alerts in actual repository settings.
CODEOWNERS is not enforcement, and this document does not enable those settings.

P04 administrative audit events use an allowlist (event type, time, opaque actor,
outcome) with documented bounded retention and owner-only access. Exclude passwords,
session tokens, full URLs, payloads and browsing destinations. Test redaction and
retention, not just log creation. P06 must publish the field-level privacy inventory
with purpose, reader, retention and deletion behavior before beta.
