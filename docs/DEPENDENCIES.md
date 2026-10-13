# Dependency and artifact policy

P01 has no third-party application runtime dependencies. Node.js 24 and Git are
prerequisites. The development tools below are exact pins. CI actions are pinned;
a pin
improves reproducibility but does not prove the pinned code trustworthy.

Before adding or upgrading a direct dependency, record its exact version, source,
license, reason, maintenance/advisory review date and an alternative considered.
Assess actual maintenance and provenance; release age or maintainer count alone
does not prove safety. Routine in-scope tooling changes need no repeated owner
approval; incompatible licensing, a new cost or a changed goal needs a decision.

| Package | Exact version | Source/license | Purpose and alternative | Maintenance/advisory review |
|---|---|---|---|---|
| typescript | 6.0.3 | registry.npmjs.org; microsoft/TypeScript; Apache-2.0 | Strict checking, build and architecture parser; native stripping alone cannot typecheck | Reviewed 2026-10-13; published 2026-04-16; selected because typescript-eslint supports TS <6.1, not latest TS 7 |
| eslint | 10.12.0 | registry.npmjs.org; eslint/eslint; MIT | Maintained lint runner; custom partial rules were rejected | Reviewed 2026-10-13; published 2026-10-02; Node 24 supported |
| typescript-eslint | 8.71.2 | registry.npmjs.org; typescript-eslint/typescript-eslint; MIT | Type-aware TS rules; plain JS lint cannot inspect unsafe typed operations | Reviewed 2026-10-13; published 2026-10-12; peers accept pinned ESLint 10/TS 6.0 |

Registry metadata was fetched over verified HTTPS. None of these direct packages
declares preinstall/install/postinstall hooks; installation disables hooks globally
through .npmrc. The lockfile records package integrity. Its 95 transitive/direct
development entries declare MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC or
BlueOak-1.0.0 licenses; all are permissive, with notices to retain for redistribution.
The P01 audit result and exact input hashes belong to evidence/P01.json. Development
tools are not bundled into the dependency-free core output. Audit and pins do not
establish malware safety or an independent legal review.

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
