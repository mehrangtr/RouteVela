# Security and privacy

No production VPN/panel is released in P00. Do not deploy preparation tooling as a VPN.

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
