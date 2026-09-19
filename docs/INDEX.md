# Documentation map

Use this map to find the document that owns a decision. Current code and checked-in configuration define implemented behavior; a dated audit or design proposal does not prove a feature is live.

## Start here

| Question | Authority |
| --- | --- |
| How do I run the project? | [README](../README.md) and [environment template](../.env.example) |
| How should an agent work? | [AGENTS.md](../AGENTS.md) |
| What is implemented, held, or deferred? | [Release status](STATUS.md) |
| Where is the system boundary? | [Architecture](ARCHITECTURE.md) and [API reference](API_SPECS.md) |
| How do I deploy, verify, or recover? | [Operations](OPS.md); dated results are evidence, not reusable production sign-off |
| What should the web UI preserve? | [Design](DESIGN.md), [CSS tokens](../app/globals.css), and active components |
| What can we claim publicly? | [Positioning and claim status](POSITIONING.md); [brand identity](BRAND_GUIDELINES.md) owns visual direction, not web overrides |

## Focused implementation policies

- UI: [admin responsive patterns](ADMIN_RESPONSIVE_PATTERNS.md), [route shells](ROUTE_SHELL_POLICY.md), and [optional design-tool usage](UI_UX_PRO_MAX.md).
- Application boundaries: [client components](CLIENT_BOUNDARY_POLICY.md), [cache/revalidation](CACHE_REVALIDATION_POLICY.md), and [type safety](TYPE_SAFETY_RATCHET.md).
- Data and operations: [category taxonomy](CATEGORY_TAXONOMY.md), [request-board hardening](REQUEST_BOARD_HARDENING.md), and [dependency upgrades](DEPENDENCY_UPGRADE_POSTURE.md).
- Performance: [bundle budgets](performance/BUNDLE_BUDGETS.md), [dated bundle baseline](performance/BUNDLE_ANALYSIS_BASELINE.md), and [dependency audit](performance/DEPENDENCY_AUDIT.md).
- Analytics: [dashboard definitions](analytics/posthog-dashboards.md) and [implementation verification](analytics/posthog-implementation-verification.md). A recorded verification is limited to its stated configuration/date.

## Contracts and evidence

| Document | Role and boundary |
| --- | --- |
| [Phase 1 contract and 32-finding register](PHASE_1_TRUSTWORTHY_RETRIEVAL_CONTRACT.md) | Acceptance requirements and per-finding delivery status; implementation links do not close unrelated requirements. |
| [Access/export design](PHASE_1_ACCESS_PATH_DESIGN.md) | Reviewed design, including broader obligations beyond the delivered export slice. |
| [Original blind-spot audit](NETFLUX_BLIND_SPOTS_2026-09-08.md) | Historical findings as observed on 8 September; consult the register for subsequent delivery. |
| [Database readiness tracker](DATABASE_PRODUCTION_READINESS.md) | DB work items, unresolved decisions, and dated verification evidence; OPS owns release execution. |
| [Security remediation tracker](SECURITY_REMEDIATION.md) | Security findings, risk acceptance, and dated evidence; completed checks are not perpetual sign-off. |
| [Responsive audit](RESPONSIVE_FUTURE_PROOFING.md) | Original issues and subsequent implementation evidence; current UI policies and test configuration are linked separately. |

## Maintenance

Update the owning document when behavior or a decision changes; link to it instead of copying its rules elsewhere. Label a document or section as current reference, contract, proposal, or dated evidence. Record the commit/date actually inspected, not a new verification date for old results. Preserve historical findings and failed experiments. Revalidate them only when the relevant code, inputs, environment, or release gate requires it.

A merge, passing CI, production deployment, and authenticated production smoke are distinct events. Record only the event supported by the linked evidence. Keep unfinished branch work out of shipped-feature claims.
