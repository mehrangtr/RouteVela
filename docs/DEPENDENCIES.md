# Dependency and artifact policy

Current baseline: no third-party npm runtime/build dependencies. Node.js 24 and
Git are prerequisites. CI action references are pinned in the workflow; a pin
improves reproducibility but does not prove the pinned code trustworthy.

Before adding or upgrading a direct dependency, record its exact version, source,
license, reason, maintenance/advisory review date and an alternative considered.
Assess actual maintenance and provenance; release age or maintainer count alone
does not prove safety. Routine in-scope tooling changes need no repeated owner
approval; incompatible licensing, a new cost or a changed goal needs a decision.

| Package | Exact version | Source/license | Purpose and alternative | Maintenance/advisory review |
|---|---|---|---|---|
| None yet | N/A | N/A | Dependency-free preparation tooling | Review starts with P01.01 |

P01.01 must pin real compiler/build/lint tools and commit the lockfile, prove clean
`npm ci`, and run `npm audit --audit-level=high` in CI. A registry/network failure
is unrun/blocked, not a clean audit. Investigate high/critical findings; fix or
document a specific reviewed applicability/mitigation decision, with owner approval
before shipping an exception. Never use blind `npm audit fix --force`.

Audit output is neither a malware detector nor a license review. Review lifecycle
scripts and transitive changes. Keep package integrity and TLS verification on.
Do not install new tools solely to produce a green badge.

When fetching client cores or release artifacts, pin versions/platforms and verify
against authenticated upstream checksums/signatures. A hash computed only after
download does not authenticate the source. Never execute an unverified download.

Ideas are distinct from copying code. Before copying or redistributing third-party
code, check the actual license and integration obligations; retain required notices.
Do not change RouteVela's LICENSE merely because an attached review recommends it.
P08 expands the inventory into the release SBOM and attribution record.
