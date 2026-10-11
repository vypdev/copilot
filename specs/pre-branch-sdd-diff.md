# Proposed change appendix: `/copilot sdd-diff`

- Status: Draft
- Date: 2026-10-11
- Catalog capability ID: `issue-start-and-sdd-readiness`
- Last verified: not applicable (prospective companion)
- Owners: Existing `issue-start-and-sdd-readiness` capability owners; individual names are not established by the issue.
- Scope: Add a deterministic, read-only command that compares the immutable first publication and current verified publication of the owning SDD for an eligible issue.
- Related issues/PRs: [Issue #464](https://github.com/OWNER/REPO/issues/464); live issue #454 is identified as human UX evidence, but its repository URL is not established here.
- Required review gates: product UX, architecture, testing, documentation, security/operations
- Open decisions blocking readiness: None from the supplied answers. Repository-specific command syntax, existing reply marker, current limits for SDD files, exact catalog evidence format, and coverage thresholds must be confirmed against the owning implementation before readiness; do not invent or weaken them.

> This is a prospective companion appendix. Preserve the owning SDD and its existing contract verbatim; append this proposed change. Repository-specific paths and contracts cited below must be reconciled with the existing capability before implementation.

## 1. Executive summary

Add `/copilot sdd-diff` with no arguments. Any GitHub participant permitted to comment may invoke it as a deterministic query, subject to the existing issue-start admission/profile policy. For an eligible issue, the command verifies the trusted gate record, exact admitted issue, owning catalogued SDD path, exact linked branch, immutable publications and current issue digest. It then compares the first and current published documents and presents bounded structural evidence with safe immutable links. It does not infer semantic requirement changes.

A ready comparison is permitted only when the digest matches, the current publication is verified and the final freshness fence succeeds. Stale, clarification-pending, initial-only, invalid, absent and unavailable evidence remain distinct. The command has no model or write capability.

```text
comment -> parse exact no-argument command -> resolve eligible target and trusted evidence
        -> verify digest, branch, publications and ancestry -> bounded immutable diff
        -> freshness fence -> update one correlated localized reply
```

## 2. Problem, current behavior, and evidence

### 2.1 Problem

Developers can inspect an SDD gate's first publication and later revisions, but cannot ask the conversation for a bounded structural comparison. Showing an unverified or pending revision as current requirements could mislead branch work.

### 2.2 Current behavior

1. The existing gate records first publication and subsequent revision information; the issue states that first-SDD commit preservation already exists.
2. No current `/copilot sdd-diff` behavior is asserted by the issue.
3. The proposed command uses existing admission, gate record, catalog ownership, linked-branch readiness and publication verification contracts; it introduces no new record store.

### 2.3 Evidence

- Code/workflow/documentation references: supplied answers identify `readSddGateRecord` schema v1, `PreBranchSddWorkspacePort.readSdd`, `verifyPublication`, `isAncestor`, `BoundLinkedBranchReadinessPort.getLinkedBranch`, command parsing/help and comment orchestration. Exact source paths are unprovided and remain to be confirmed.
- Incidents or concrete examples: issue #464 reports that developers cannot inspect bounded changes; issue #454 is named as a real first/revised SDD human UX fixture.
- External primary sources: not applicable; the contract is repository-owned.
- Unknowns: current implementation names, catalog evidence schema, exact existing SDD file limits, command catalogue syntax and repository coverage thresholds.

### 2.4 Retrospective classification (as-built baselines only)

Not applicable: this is a prospective specification, not a reconstruction of implemented behavior.

## 3. Actors, surfaces, and terminology

| Actor | Goal | Entry point | Visible surfaces |
|---|---|---|---|
| Issue participant | Inspect published SDD structure | Issue comment `/copilot sdd-diff` | One correlated issue reply and immutable links |
| PR participant | Query only an explicitly linked eligible issue | PR comment | One correlated PR reply, or not-applicable/ambiguous/unavailable result |
| Maintainer | Preserve trust and operability | Catalog, docs, checks | Capability evidence and validation output |

**First publication** is the immutable `commitSha`/`baseSha` pair. **Current publication** is `revisionSha`/`revisionBaseSha` when present. **Structural diff** means added/removed lines and changed section titles; it makes no claim about semantic requirements. **Stale** means the current normalized issue digest differs from the trusted record. **Pending-revision** means the digest matches an awaiting-answer record while the verified first publication remains available; the requested revision is not yet published.

## 4. Goals

### 4.1 Goals

1. Provide a deterministic, read-only comparison for eligible targets.
2. Identify exact immutable first/current SHAs and verified owning SDD path.
3. Keep state distinctions honest and output bounded under hostile or excessive input.
4. Reuse existing gate ownership and correlated-comment behavior without changing the gate contract.

### 4.2 Non-goals

1. Semantic analysis, model calls, requirement inference, or content excerpts.
2. Editing source or SDDs, creating branches, changing approvals, labels, checks, or lifecycle state.
3. Arbitrary paths/refs, branch scans, PR-number equivalence, or user-provided URLs.

### 4.3 Fixed product/safety invariants

1. No current-comparison claim or counts without exact identity, valid trusted record, matching digest, verified publications/ancestry, exact linked branch and successful final freshness fence.
2. No writer capability; no model; no source content in replies.
3. Files and computation are bounded: per document at most 70,000 UTF-16 characters, 280,000 UTF-8 bytes and 2,000 lines; at most 2,000,000 line-comparison steps. Reply at most 6,000 characters.
4. At most eight changed section titles, each at most 120 characters, with omitted-title count disclosed. These fixed limits cannot be configured.

## 5. Current versus proposed product journey

| Stage | Current | Proposed | User/operator effect |
|---|---|---|---|
| Issue query | No diff command asserted | Parse exact no-argument command | Predictable entry |
| Target proof | Existing gate policy | Exact issue admission; PR native closing-issue relationship only | No guessed target |
| Evidence | Gate retains publication records | Verify record, digest, linked branch, immutable publication and ancestry | Trustworthy state |
| Comparison | No conversation comparison asserted | Bounded line diff and section titles | Structural changes visible |
| Reply | Existing orchestration | Localized, replay-safe single correlated reply | No duplicate noise |

```mermaid
flowchart LR
    A[Comment] --> B[Resolve exact eligible issue]
    B --> C[Verify record, digest, branch, publications]
    C --> D[Bounded structural diff]
    D --> E[Freshness fence]
    E --> F[One localized correlated reply]
```

Text equivalent: comment -> exact target and evidence verification -> bounded comparison -> freshness check -> correlated reply.

## 6. Functional behavior and state model

### 6.1 Happy path

1. Parse `/copilot sdd-diff` with no arguments using the existing deterministic parser. Invalid arguments follow existing help behavior and do not invoke a model.
2. On an issue, apply existing admission/profile policy: feature issues and admitted branch-bearing contract-change issues for which the SDD gate applies are eligible. Unsupported, exempt and help targets return not-applicable without writes other than the correlated query reply.
3. On a PR, query the exact event PR's native GitHub `closingIssuesReferences` relationship through a narrow read-only projection. Validate same-repository canonical PR identity and pagination completeness. Verify each candidate issue's admission/profile before considering it. Zero eligible linked issues is not-applicable; multiple eligible links or disagreeing authoritative identity is ambiguous/unavailable. Incomplete/unreadable authority is unavailable. Never infer from equal numbers, body text, branch scans, or a newest candidate.
4. Read the latest configured-bot-owned valid schema-v1 gate record for the exact issue. Confirm current catalog ownership and its allowlisted SDD path. Preserve `commitSha`/`baseSha` as first publication; use `revisionSha`/`revisionBaseSha` as current publication when present. Do not weaken schema or create another store.
5. Verify exact branch linkage and live branch name/head using existing readiness proof. Verify publication and ancestry at immutable SHAs. A missing, deleted, mismatched or unverifiable branch/publication cannot support a current comparison.
6. Compute the same digest as the gate from current normalized title, visible human body, admitted kind, profile and original recorded base. Digest mismatch takes precedence and reports stale. A digest-matching awaiting-answer record with verified first publication reports pending-revision. Neither permits current counts. A current comparison requires matching digest and verified current publication.
7. Read only the catalogued SDD at the two verified immutable SHAs. Apply all fixed input and work limits. If exceeded, report bounded/unavailable with safe verified links and a specific limit explanation; never truncate and claim exact counts.
8. Recheck issue title/body, record, branch identity and relevant publication facts before replying. Any race invalidates current claims.
9. Use effective issue locale, or PR locale on the PR surface. Render complete English/Spanish catalogs; unsupported locale or invalid catalog uses atomic English fallback. Update/reuse the existing exact repository/target/source-comment correlated reply. Replays update one reply; a new source comment gets its own.

### 6.2 Alternative paths

- Eligible issue before first publication: `no-published-SDD`.
- Valid initial publication without revision: `initial-only`; no two-revision comparison.
- Pending clarification with matching digest and verified first publication: `pending-revision`; no current counts.
- Digest mismatch: `stale`, with SDD question-card link; not pending-revision.
- Forged, foreign, malformed or unknown-version record: invalid/unavailable, never a comparison.
- Missing branch/publication and provider read errors: distinct missing/unavailable states where evidence permits; do not fabricate facts.
- PR with no eligible native closing issue: not-applicable; ambiguity and authority failure are explicit.
- Changed documents that exceed limits: bounded/unavailable; safe verified revision links may be shown.

### 6.3 State machine

| State | Entered when | User-visible meaning | Allowed next states | Recovery/owner |
|---|---|---|---|---|
| Not-applicable | Target unsupported/exempt or no eligible PR link | This command does not apply | None | User selects applicable issue |
| No-published-SDD | Eligible issue has no first publication | No SDD has been published | Compared after gate publication and retry | Issue owner |
| Initial-only | First publication verified, no revision | Only first version exists | Compared after verified revision | Issue owner |
| Current comparison | Digest, branch, publications and fence all verify | Structural comparison is current | Re-run on new source comment | Gate/application |
| Pending-revision | Matching digest; trusted record awaits answers; first publication verified | Revision is being clarified; no current diff | Compared after publication; stale after issue edit | Issue owner |
| Stale | Current digest differs | Issue changed since gate record | Re-run after gate refresh | Issue owner |
| Invalid/unavailable | Trust, linkage or provider evidence fails | Current comparison cannot be verified | Retry when evidence available | Maintainer/operator |
| Bounded | Document or work limit exceeded | Exact comparison unavailable within safety bound | None until input changes | Issue/spec owner |

Duplicate requests follow correlated replay rules. Out-of-order events must pass the final fence or lose current status. Cancellation/provider failure creates no lifecycle mutation; partial provider success is reported only as retained verified facts.

## 7. User-facing configuration

| Input | Type | Recommended default | Allowed values/range | Scope/persistence |
|---|---|---|---|---|
| Command | Exact comment text | `/copilot sdd-diff` | No arguments | Per source comment; no durable setting |
| Diff limits | Fixed policy constants | Limits in §4.3 | No user overrides | Repository contract |
| Locale | Existing effective locale | Issue locale; PR locale on PR | English, Spanish; atomic English fallback | Existing locale policy |

Validation rejects arguments and invalid command forms through existing parser/help. No arbitrary path, ref, URL, limit, or credential is accepted. Existing repository admission/profile precedence applies; the command does not snapshot a new configuration. Limits, read-only behavior, exact identity, and verification requirements are intentionally not configurable. A recommended invocation is `/copilot sdd-diff`; meaningful alternative is the same command on a PR whose native relationship identifies exactly one eligible issue.

## 8. Clean Architecture

### 8.1 Responsibilities and dependency direction

| Layer/boundary | Owns | Must not own/import |
|---|---|---|
| Domain/pure policy | Eligibility result, state precedence, digest decision, line diff bounds, title sanitization | GitHub DTOs, SDKs, I/O |
| Application | Read-only comparison use case, ordered verification and freshness fence | Concrete provider SDK/process concerns or writer ports |
| Adapters/data | Map semantic reads and provider failures; exact PR closing-issue projection | Product state policy |
| Infrastructure/composition | Wire narrowed read ports and existing comment reconciler | Business decisions or extra credentials |
| Entrypoints | Adapt issue/PR event and comment to command input | Duplicate orchestration or inferred identity |
| Presentation | Localized bounded view models and Markdown renderer | Publication mutation or state transitions |

```mermaid
flowchart LR
    E[Comment entrypoint] --> A[Read-only application use case]
    A --> D[Pure trust, state and diff policies]
    A --> P[Semantic read ports]
    I[GitHub and workspace adapters] --> P
    A --> V[Localized presentation]
    V --> R[Existing correlated reply reconciler]
```

### 8.2 Contracts, state, and trust boundaries

- Pure decisions: target applicability, digest precedence, state mapping, bounded diff/counts, changed-heading extraction, output escaping.
- Application contracts: immutable event identity and operation result; no provider DTOs. Separate comparison reads from reply publication orchestration; the use case receives no write-capable workspace/comment port.
- Semantic ports: reuse/narrow `readSdd`, `verifyPublication`, `isAncestor`, exact `getLinkedBranch`, bound issue comment/title/description/catalog readers. Add a typed read-only PR closing-issue projection through existing GraphQL transport if no exact semantic port exists. Include repository identity and pagination completeness; stop after finding a second eligible issue.
- Durable state/schema ownership: existing bot-owned `readSddGateRecord` schema v1 only. No schema/store changes.
- Concurrency/idempotency: repository, exact target and source-comment correlation through existing reconciler; final issue/record/branch fence immediately before rendering/publishing current claims.
- Trusted inputs: authenticated event identity, canonical repository identity, configured bot ownership, catalog ownership, validated SHA/path and provider-verified linkage/publication. Untrusted: issue/PR/comment text, record content until validated, headings, provider errors and URLs in bodies.
- Provider errors map to bounded unavailable states; raw errors are never echoed.

### 8.3 Executable architecture constraints

Architecture tests MUST prove the use case cannot depend on writer ports, model clients, source-edit/branch/approval/lifecycle services, or provider DTOs. Contract tests MUST assert schema-v1 compatibility and exact PR identity/pagination behavior. Dependency/cycle checks and adapter contract fixtures MUST be added to existing repository checks; exact command names are an implementation discovery item.

## 9. UI/UX and content contract

### 9.1 Information hierarchy

Show current status first, verified facts next, then consequence/action, impact and safe evidence links; technical IDs are secondary. Counts and changed titles appear only for a verified current comparison. Historical links in stale/pending states must be explicitly labelled historical.

### 9.2 Representative primary view

```markdown
<!-- Use existing stable command-reply marker and correlation policy. -->

# 🔎 SDD structural comparison

> **Current status:** Compared verified published revisions
>
> **Action required:** No action required

## Changes

- First publication: `FIRST_SHA`
- Current publication: `CURRENT_SHA`
- Added lines: 12 · Removed lines: 4
- Changed sections: “Scope”, “Failure and recovery”

This is a structural diff. It does not infer semantic requirement changes.

## Links

[First SDD](SAFE_IMMUTABLE_DOCUMENT_URL) · [Current SDD](SAFE_IMMUTABLE_DOCUMENT_URL) · [Compare commits](SAFE_COMPARE_URL)
```

Concrete variants:

- **Pending/no action:** “No SDD revision has been published yet” (`no-published-SDD`) or “Only the first SDD publication is available” (`initial-only`); no current comparison claim.
- **Action required:** stale: “The issue description changed after this SDD record. Refresh the SDD gate before comparing.” Link to verified question card; historical publication links only if all required publication/path/ancestry checks pass.
- **Blocked/failed:** “A current comparison is unavailable because the linked branch could not be verified. Retry after the issue’s linked branch is available.” Retain only verified facts; no counts.
- **Partially complete:** “The published documents were verified, but the comparison exceeded the fixed work limit. Exact counts are unavailable.” Provide only safe verified links.
- **Completed unchanged:** “The verified documents have no structural line changes.” Show both SHAs and safe links, zero counts, and the structural-only caveat.

### 9.3 Issue, PR, and comment behavior

- Deterministic title: localized equivalent of “SDD structural comparison”; purpose is query result, not a gate/status card.
- Merge/close/retry causes no lifecycle effect. Retrying the same source comment updates its correlated reply; a new source comment creates its own reply.
- One reply per source comment; no extra status cards, notifications, labels or checks. Preserve waiting labels.
- Links are built from policy-owned canonical repository identity plus validated SHA/path. No body-derived URL. Link document, commit and compare evidence descriptively.

### 9.4 Accessibility, localization, and responsive behavior

English and Spanish catalogs are complete and selected by existing effective-locale rules; unsupported or invalid catalogs fall back atomically to English. Use textual status, logical headings, short lists and descriptive links; tables are not required in the reply. Must remain readable on narrow screens and light/dark GitHub themes. Escape and bound titles to 120 characters; neutralize mentions, Markdown, control characters and HTML/command markers. Do not echo document contents, raw provider errors or untrusted URLs. Mermaid has the textual flow equivalent in §5.

## 10. Failure, recovery, and cleanup

| Failure/partial state | User impact | Retained facts | Automatic retry | Required action | Cleanup |
|---|---|---|---|---|---|
| No publication | No comparison yet | Exact eligible target | On a new command only | Publish SDD through existing gate | None |
| Initial only | No revision pair | Verified first SHA if safe | No | Publish revision | None |
| Stale digest | Current counts withheld | Digest mismatch; safe historical links only after verification | No | Refresh gate/question card | Preserve labels |
| Pending answers | Requested revision is not current | Verified first publication | No | Answer existing clarification | Preserve labels |
| Record/owner/path invalid | Trust cannot be established | Sanitized state only | Bounded provider retry only | Maintainer review | No record repair by command |
| Branch/publication missing | Current comparison withheld | Independently verified facts | Bounded read retry per existing policy | Restore/fix linkage or retry later | None |
| Provider unavailable/incomplete PR pagination | Target/evidence unavailable | Safe event identity only | Existing bounded retry policy | Retry later | None |
| Input/work bound exceeded | Exact diff unavailable | Verified SHAs and safe links | No | Reduce/change SDD within existing constraints | None |
| Final fence changes | Race invalidates current claim | No current counts | Re-run on new event | Retry command | No stale reply claim |

Errors use `impact -> cause -> action -> retained state`; a failed read must not imply publication or lifecycle failure.

## 11. Security, permissions, and privacy

1. Reuse existing least-privilege read permissions and comment-reply authority; comparison workflow itself has no writer port. Confirm exact workflow permission declarations during implementation.
2. Treat comments, issue/PR content, records and headings as untrusted. Bind repository and target to authenticated event; enforce exact admission, bot ownership, catalog path, branch and publication proofs.
3. Read only allowlisted spec content at immutable verified SHAs. Never accept arbitrary refs/paths/URLs or expand local setup credentials. Do not log or reply with file contents, tokens, PII beyond existing issue identity, or raw provider errors.
4. Resist replay/forgery through validated record ownership, exact source-comment correlation, bounded processing, output escaping, and final freshness fencing.

## 12. Observability and operational UX

- User-facing states are the state table in §6.3; distinguish not-applicable, stale, pending, invalid, missing and unavailable.
- Job Summary is not needed for a comment query; do not add one absent an existing operational convention.
- Logs may record correlation ID, state category, validated SHAs and bound outcome, but not document content or raw errors. Metrics should use bounded state labels; exact existing telemetry is unknown.
- Provider unavailability is not a failed SDD publication. Respect existing rate-limit/retry policy; no unbounded retries.
- Noise budget is one correlated reply per source comment, no notifications/status cards.

## 13. Compatibility, migration, rollout, and rollback

- Existing gate records and in-flight operations remain unchanged. Schema v1 is read as-is; malformed/foreign/unknown version fails closed.
- No config or record migration, deprecation, or feature flag is proposed. Existing command help/parser and orchestration are extended compatibly.
- Rollout adds command/docs/catalog evidence after acceptance checks. Rollback removes command dispatch while retaining existing gate records and behavior; no irreversible SDD or lifecycle effects are introduced.

## 14. Testing strategy and numeric budget

Minimum: 30 distinct risk-derived cases, meeting the supplied minimum of 24. Each case counts once; parameter rows count only when behavior is distinct.

| Area | Minimum distinct cases | Behaviors/risks covered |
|---|---:|---|
| Domain/configuration/pure planning | 6 | eligibility, digest precedence, state mapping, bounds, diff counts, unsafe titles |
| State/application/idempotency/races | 6 | no publication, initial-only, pending, stale, fence races, replay correlation |
| Adapters/provider contracts | 5 | schema-v1 ownership, exact branch, immutable publication/ancestry, PR pagination/link identity, provider errors |
| Workflows/setup/schema | 3 | read-only permissions, no writer/model wiring, existing record compatibility |
| UI/UX/localization/sanitization | 6 | English/Spanish, atomic fallback, links, escaping, omission disclosure, reply budget |
| Integration/security/migration | 4 | no-write end-to-end, forged/foreign record, excessive input/work, compatibility with gate |
| **Total** | **30** | No double counting |

Keep all existing SDD gate coverage and budgets unchanged; shared helper changes require documented justification and regression coverage. Preserve repository-wide thresholds and meet or exceed them; exact thresholds are repository-specific and must be copied from current policy before Ready. New pure policies target at least 90% branch coverage. Changed modules must meet repository thresholds with no unexplained coverage decrease. Use deterministic clocks, IDs and fakes; no real waits/live services. Add table-driven state/bound tests, replay/race tests, adapter contracts and structural workflow permission checks. Golden replies require semantic assertions for states, links, counts, localization and forbidden content. Human UX evidence must review #454 first/revised SDD output and narrow-screen readability; do not rely on snapshots alone.

Required distinct risk coverage includes eligibility/identity (4), record/ownership/publication trust (5), digest/revision races (4), diff/count/bounded work (5), and localization/sanitization/replay/no-write (6), totaling at least 24 cases within the 30-case distribution.

## 15. Documentation and discoverability

| Audience | Artifact/page | Required content | Validation/navigation |
|---|---|---|---|
| User | `docs/issues/comment-commands.mdx` | Exact command, eligible targets, examples, states and links | Command catalog and link checks |
| Issue owner | `docs/issues/pre-branch-sdds.mdx` | First/current revision distinction, stale/pending recovery, structural-only caveat | Examples checked against fixtures |
| Operator | Same SDD guide | Invalid/unavailable evidence, retry and permission boundaries | State decision table review |
| Contributor | Capability SDD and catalog evidence | Ports, trust boundaries, 30-case budget, workflow checks | `pnpm run validate:specifications`; catalog generation/check as repository requires |

Docs must explain PR exact-link rules, limits, no-write behavior and that line/title differences do not establish semantic requirement changes. Update the capability catalogue evidence and owning SDD or this approved bounded companion before branch creation. Keep documentation examples synchronized with fixtures.

## 16. Acceptance

1. Given an admitted eligible issue with a valid schema-v1 record, matching digest, exact linked branch, verified first/current publications and successful final fence, when a participant comments `/copilot sdd-diff`, then one localized reply shows both SHAs, safe immutable links, exact added/removed line counts and at most eight changed titles, and states that the result is structural only.
2. Given an eligible issue with no publication, when queried, then it reports `no-published-SDD` without calling it invalid or ready.
3. Given a verified first publication and no revision, when queried, then it reports `initial-only` and does not invent a comparison.
4. Given a matching digest and awaiting-answer record with verified first publication, when queried, then it reports pending-revision with no current counts.
5. Given any current digest mismatch, including an awaiting-answer record, when queried, then stale takes precedence over pending; no current counts appear and the question-card link is provided.
6. Given a foreign, forged, malformed or unknown-version record, when queried, then no current comparison is claimed and no untrusted values are rendered as authority.
7. Given wrong owner/path, absent publication, deleted or mismatched branch, failed ancestry/publication proof, when queried, then the result is invalid, missing or unavailable as supported by verified facts, never current-ready.
8. Given a PR with exact native same-repository closing-issue authority to zero eligible issues, when queried, then it reports not-applicable; with two eligible issues or disagreeing identity it reports ambiguous/unavailable.
9. Given incomplete PR pagination or unreadable authority, when queried, then it reports unavailable and does not fall back to body numbers or equal PR/issue numbers.
10. Given a document over any character, byte or line limit, or computation over 2,000,000 steps, when compared, then it reports bounded/unavailable without truncation or guessed counts.
11. Given more than eight changed section titles or unsafe headings, when rendered, then only up to eight escaped, bounded titles appear and the omitted count is explicit; mentions/control/Markdown injection is inert.
12. Given a document with no line changes, when queried, then it reports zero structural changes with verified links.
13. Given replay of the same source comment, when processed again, then the existing correlated reply is updated; a distinct source comment receives its own reply.
14. Given issue, record or branch mutation between collection and publication, when the final fence runs, then current counts and ready claims are withheld.
15. Given provider errors, when rendered, then raw error text and document contents are absent and impact/cause/action/retained-state order is used.
16. Given unsupported locale or invalid locale catalog, when rendered, then a complete English response is used atomically; supported issue/PR locales use English/Spanish catalogs respectively.
17. Given any invocation, when inspecting effects, then no model, source edit, branch, approval, label, lifecycle mutation, extra status card or notification occurred.
18. Given the implementation, when architecture/workflow checks run, then application dependencies contain no writer/model capability and exact PR identity and read-only permissions are structurally verified.
19. Given docs and catalog updates, when repository specification validation runs, then links/evidence are current and examples agree with executable fixtures.
20. Given issue #454's real first and revised SDD, when reviewers inspect the generated UX fixture, then the structural-only distinction and immutable navigation are understandable without inferring semantic requirements.

## 17. Requirements traceability

| Requirement | Policy/use case/adapter/presentation | Test or evidence | Documentation |
|---|---|---|---|
| Exact target and admission | Entry adapter, admission policy, PR-link port | Identity/admission and pagination contracts | Command guide |
| Trusted record and current readiness | Gate reader, digest/publication/branch policies | Forgery, owner, ancestry, race cases | SDD guide |
| Bounded structural result | Pure diff policy, read-only use case | Character/byte/line/step and count tests | Both user pages |
| Safe correlated reply | Renderer/reconciler | Locale, sanitization, replay tests | Command guide |
| Read-only architecture | Application ports/composition | Dependency and workflow permission checks | Contributor SDD |

## 18. Implementation sequence

1. Confirm existing parser, gate record schema, catalog ownership/evidence and repository coverage/workflow contracts; add exact PR closing-issue semantic projection if absent.
2. Define immutable read-only contracts and enforce absence of writer/model dependencies.
3. Implement pure eligibility, state precedence, bounded diff and sanitization policies with tests.
4. Implement ordered application reads, exact linkage/publication checks and final freshness fence.
5. Add adapter mappings and structural PR identity/pagination tests.
6. Add localized states and correlated reply integration with golden and semantic fixtures.
7. Update both issue docs, capability catalogue evidence and this companion/owning SDD before branch creation.
8. Complete 30-case minimum, all existing gate budgets, #454 UX review, architecture/workflow checks and specification validation.

## 19. Definition of Done

- [ ] Every normative requirement maps to acceptance and traceability.
- [ ] Existing SDD gate contract, record schema and budgets remain unchanged.
- [ ] Exact issue/PR identity, owner, path, branch, digest, publications and final fence are verified.
- [ ] Read-only architecture is enforced; no model, source, branch, approval or lifecycle capability is reachable.
- [ ] All fixed input/work/output limits and state distinctions pass.
- [ ] At least 30 distinct risk-derived cases pass, including all 24 named minimum risk categories; coverage meets repository thresholds and new pure policy branch target.
- [ ] English/Spanish, fallback, sanitization, replay, link safety and comment budget pass.
- [ ] Docs and catalog evidence are current; #454 human UX evidence is reviewed.
- [ ] Failure, race, unavailable, bounded and recovery behavior passes without false current claims.
- [ ] `pnpm run validate:specifications` passes and catalog output is current according to repository workflow.
- [ ] No readiness-blocking decision remains unresolved.

## 20. References and decisions

- Primary sources: Issue #464 and its explicit answer rounds supplied with this request; existing repository contracts named in those answers, pending source-path confirmation.
- Related specs/ADRs/issues/PRs: owning `issue-start-and-sdd-readiness` SDD; live issue #454 as UX evidence; exact URLs and catalog identifiers beyond the supplied capability ID remain to be confirmed from repository metadata.
- Decisions: companion SDD under the existing capability; exact native same-repository PR closing-issue relationship is authoritative; digest mismatch always reports stale; pending-revision requires matching digest and verified first publication; first publication fields remain immutable; no arbitrary paths, refs, body URLs, semantic inference, model, writes or new record store.
- Follow-up outside this spec: any broader semantic SDD analysis, changes to gate lifecycle/record schema, or general PR-to-issue discovery.