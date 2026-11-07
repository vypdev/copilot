### Is there an existing issue or feature request for this?

- [x] This is the Domus consumer adoption issue. Issue #23 and PR #29 retain task and recurrence work.

### What area does this improvement affect?

User Interface

### Description of the idea or improvement

Adopt the exact published [ha-ui npm core version 0.1.0-next.1](https://www.npmjs.com/package/@vypdev/ha-ui/v/0.1.0-next.1) and validate the existing Overview and Household in Ingress and standalone. Gateway adoption is deferred. The artifact integrity is sha512-MfY1sHgx8pbAOOATiPG2Pf5Qhp9T7CzMPBTzXphuqs66G2ck1zf+Y9GzOLwWeBUzZfY8+VAJObkjVWUvP/wd7w==.

**Native ownership route:** action update; capability ID application-experience; selected existing owner `specs/application-experience.md`. Append the focused change to this registered owner. Preserve the existing document bytes and the other owner specification. GitHub Actions publishes the official SDD.

Use the maintainer draft for the exact Overview and Household scope. The isolated consumer candidate passed the Ingress and standalone journeys, the ARM64 image journeys and complete frontend coverage. The native publication and hosted implementation checks remain separate.

<!-- copilot:sdd-seed -->
# Proposed change: Shared presentation adoption in Domus

- Status: Draft
- Date: 2026-11-06
- Catalog capability ID: application-experience
- Last verified: Not applicable; prospective consumer change.
- Owners: Domus maintainers
- Related issue: [Domus issue 30](https://github.com/vypdev/domus/issues/30)
- Required review gates: product, architecture, security, documentation, CI and native review.
- Open decisions blocking drafting: none.

## 1. Executive summary

The existing Domus overview and household administration gain a shared upper navigation bar. The browser location selects a real destination; the package renders it, and Domus remains the authority for routes and all household facts.

## 2. Problem, current behavior, and evidence

The verified develop revision 0170085f283ea5775f41e77a2f8c8d9cc69f20b7 has working entry and administration surfaces without shared tabs. The public package was installed and bundled in the isolated local candidate d1c8f361545ff2cd6c2b6b3daaed371cce73f7e2. That candidate passed 91 Chromium journeys across both modes and 36 in the ARM64 image. The managed implementation and hosted review remain pending.

## 3. Actors, surfaces, and terminology

A verified participant may navigate Overview and Household. Household means the existing administration surface; each control retains the permissions already enforced. Ingress is the Supervisor App entry; standalone is the independently served authenticated entry.

## 4. Goals, non-goals, and fixed invariants

| Requirement | Behavior |
|---|---|
| G-01 | Install and lock the exact public npm version and integrity, retaining its published license notices in the compiled distribution. |
| G-02 | Render shared, localized Overview and Household navigation against the current real surfaces. Domus owns destination selection and access. |
| G-03 | Preserve relative links, focus, history and reload in Ingress and standalone. Unknown fragments never select a new destination. |
| G-04 | Preserve access, household drafts and original-operation recovery while moving between destinations. |
| G-05 | Support keyboard use, localized labels and overflow controls, and narrow and wide light/dark layouts and reduced motion. |
| G-06 | Deliver the verified assets in the wheel and current-source image, with complete global and per-file frontend coverage. |

This adoption does not implement task, calendar, supplies, points or Gateway workflows. It does not alter authentication, mutations, schemas, recovery, hosting, channels or first-release requirements.

## 5. Current versus proposed product journey

Open the same entry URL and authenticate if needed. With current household access, start at Overview, reach Household through the shared bar and return through browser history or the Overview link. Both destinations use the existing surfaces. Inactive or closed sessions retain their existing guidance and expose no protected navigation.

## 6. Functional behavior and state model

Domus recognizes the two fixed fragments, #overview and #household. An absent or unknown fragment leaves Overview selected without rewriting the URL. Selection has no authority; do not expose protected surfaces without current application evidence. Same-context fragment changes preserve mounted draft state, while existing session retirement and context replacement still clear drafts.

## 7. User-facing configuration

No new settings. Use the existing Domus language and theme precedence and the public component's styling hooks. Install and lock the exact public ha-ui core package version 0.1.0-next.1.

## 8. Clean Architecture design

Presentation uses the library's public navigation contract and component. Browser composition maps the current fragment to a known Domus destination. Controllers, ports, adapters, authorization, validation, commands and original-operation recovery keep their existing dependencies. Dependency Cruiser enforces that runtime imports of the package stay in presentation. The shared component receives view data and does not access the host frame, application authority or credentials.

## 9. UI/UX and content contract

Overview and Household are visible text labels in English; Inicio and Hogar are the corresponding Spanish labels. Use the shared indicator, keyboard support and accessible localized overflow controls. Normal links work within the current deployment base. Focus follows deliberate navigation to the existing content; narrow, wide, light, dark and reduced motion are covered.

## 10. Failure, recovery, and cleanup

Unknown fragments keep a valid default selection. Missing proof or an unavailable context uses the existing loading, closed or recovery states. No navigation sends commands, retries a write, reads unrelated storage or changes request identity. The existing application owns draft retirement and lifecycle cleanup.

## 11. Security, permissions, and privacy

Fragments are untrusted local presentation input. The server remains authoritative for permission, origin and session checks. Neither URL fragments nor component events grant access. Do not inspect the HA host DOM or private assets; do not render future or inaccessible surfaces.

## 12. Observability and operational UX

Use existing status, recovery and correlation evidence. Package pin, notices, coverage, browser receipts and built-artifact identity provide review evidence. Do not log private drafts or add telemetry.

## 13. Compatibility, migration, rollout, and rollback

Use the existing Lit runtime and public package integrity. Bundle the release and retain its published license and third-party notices. No data or configuration migration. Reverting the consumer change restores the prior UI with the same database and runtime contracts. Gateway adoption and production rollout are separate.

## 14. Testing strategy and numeric budget

Cover 12 distinct cases in addition to the retained regression suite.

{{SDD_CASE_BUDGET}}

| Case ID | Area | Requirements | Scenario |
|---|---|---|---|
| domus-shared-nav-C01 | Package | G-01 | A frozen install resolves the exact public npm version and recorded integrity with one existing Lit runtime. |
| domus-shared-nav-C02 | Package | G-01, G-06 | The built navigation assets and wheel carry the installed package license and third-party notices and load through the packaged bundle contract. |
| domus-shared-nav-C03 | Navigation | G-02, G-03, G-05 | An active member starts with the existing overview and can reach the actual household administration using named keyboard-operable links. |
| domus-shared-nav-C04 | Navigation | G-02, G-03 | Empty and unrecognized fragments select Overview without rewriting the URL or reaching a foreign surface. |
| domus-shared-nav-C05 | Navigation | G-02, G-04 | Closed, unverified and replaced contexts cannot reveal protected destinations or use a fragment to grant access. |
| domus-shared-nav-C06 | Ingress | G-02, G-03, G-06 | In the current-source Ingress image, keyboard navigation, reload and back/forward preserve selection and the non-root deployment path. |
| domus-shared-nav-C07 | Standalone | G-02, G-03, G-06 | In the current-source standalone image, keyboard navigation, reload and back/forward preserve selection and the standalone deployment path. |
| domus-shared-nav-C08 | Household workflow | G-04 | Switching between existing areas leaves an unsent same-context administration draft intact and issues no write. |
| domus-shared-nav-C09 | Household workflow | G-04 | Existing authorization and original-operation browser regressions still pass on the compiled consumer. |
| domus-shared-nav-C10 | Presentation | G-02, G-05 | English and Spanish destinations retain accessible names and a visible selected indicator in wide light and narrow dark states. |
| domus-shared-nav-C11 | Presentation | G-05 | Constrained navigation exposes the localized overflow controls, retains keyboard reachability and honors reduced motion. |
| domus-shared-nav-C12 | Coverage | G-06 | The independent frontend source inventory verifies complete statements, branches, functions and lines for every authored runtime file and globally. |

## 15. Documentation and discoverability

Record the dependency boundary, user-visible navigation, roadmap status and actual verification receipts. The existing owner specifications are retained.

| Path | Change |
|---|---|
| `frontend/tests/e2e/workspace-navigation.spec.ts` | create |
| `docs/evidence/shared-presentation-adoption.json` | create |
| `frontend/src/composition/entry-page.ts` | update |
| `frontend/src/presentation/domus-app.ts` | update |
| `frontend/src/presentation/messages.ts` | update |
| `frontend/src/presentation/styles.ts` | update |
| `frontend/tests/page.test.ts` | update |
| `frontend/playwright.entry.config.ts` | update |
| `frontend/vite.config.ts` | update |
| `frontend/vitest.config.ts` | update |
| `architecture/frontend.mjs` | update |
| `tests/node/architecture.test.mjs` | update |
| `frontend/package.json` | update |
| `pnpm-lock.yaml` | update |
| `.github/workflows/ci_check.yml` | update |
| `tests/packaging/test_ui_wheel.py` | update |
| `tests/containers/test_app_ui.py` | update |
| `docs/architecture.md` | update |
| `docs/roadmap.md` | update |
| `docs/user-guide.md` | update |
| `specs/application-experience.md` | update |
| `specs/household-entry-interface.md` | reference |
| `specs/catalog.json` | reference |

## 16. Acceptance scenarios

The exact public tarball installs on a frozen lock, the compiled product and current-source image carry the package and its notices, and both deployment paths preserve keyboard navigation, focus, selection, reload, browser history and protected household operations. EN and ES, light and dark, narrow and wide, reduced motion and overflow are verified. The required CI and native review must complete on the implementation head; publishing this specification proves no runtime acceptance.

## 17. Requirements traceability

{{SDD_REQUIREMENT_CASES}}

## 18. Implementation sequence

After branch readiness, apply the locally verified candidate with its regression tests, exact package pin, shared navigation and bundled notices. Run focused and retained regressions, verify the wheel and image in both modes, and record review evidence.

## 19. Definition of Done

All listed cases and existing gates pass. Every authored frontend runtime file and the global report reach complete supported coverage. Exact current-head CI passes and Bugbot has no pending findings. Keep package publication, Domus verification and human UX evidence distinct.

## 20. References and decisions

The common implementation, API, adapters, catalog and publication remain with [ha-ui issue 7](https://github.com/vypdev/ha-ui/issues/7). Domus owns the consumer and household experience. Gateway remains deferred. The Action appends this proposed change to the existing application-experience specification and preserves the existing content.
<!-- /copilot:sdd-seed -->

### Current limitations or challenges

The development base still has the original surfaces without the shared navigation. The local candidate pins the public package and exercises those real surfaces. Its evidence is separate from acceptance on the managed branch.

### Expected impact

Domus consumes a public exact shared release on its real existing routes, with full coverage and packaged browser verification in both deployments. No new authorization, schema, deployment or Gateway work.

### Additional context or comments

The Action owns the SDD, catalog and managed branch. The above is a proposed contract, not a claim of branch readiness or tested adoption. Do not modify any Copilot resources.

<!-- copilot-configuration-start
{
    "schemaVersion": 3,
    "branchType": "feature",
    "workingBranch": "feature/30-share-gateway-presentation-components-and-establish-the-domus-household-navigation",
    "parentBranch": "develop"
}
copilot-configuration-end -->

