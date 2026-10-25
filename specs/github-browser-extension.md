# GitHub Browser Extension — Product, MVP and Roadmap

- Status: Ready for review — proposed, not implemented
- Date: 2026-10-25
- Catalog capability ID: `github-browser-extension`
- Last verified: 2026-10-25, repository/source research only; no extension execution
- Owners: Copilot maintainers (product, engineering, security and release)
- Scope: Personal improvements to github.com plus an optional Copilot context panel in desktop Chrome, Firefox and Safari.
- Related issues/PRs: [Issue #694](https://github.com/vypdev/copilot/issues/694)
- Required review gates: product UX, architecture, testing, documentation, security/operations
- Open decisions blocking design readiness: None. Implementation, platform evidence, account setup and store approval remain delivery gates, not completed facts.

## 1. Executive summary

The extension makes daily GitHub work easier and explains work coordinated by
Copilot where a developer is already reading it. Page-local improvements work
without the Action or a token. A separately enabled connection presents verified
Action publications, source links and requests prepared for human submission.

```text
Install → enable selected GitHub improvements → visit issue/PR
  → optionally connect repository → inspect current context/findings
  → prepare supported request → review and submit in GitHub → inspect Action result
```

The user owns personal settings and comment submission. GitHub owns native facts.
The Action owns automation policy, evidence and managed branch lifecycle. This
document defines product behavior; [integration](github-browser-extension-action-integration.md)
defines its data contract and [platforms](github-browser-extension-platforms-and-delivery.md)
defines browser architecture, security and delivery.

## 2. Problem, current behavior, and evidence

### 2.1 Problem

Developers repeatedly navigate files, references and conversation history. Authors
and reviewers also reconstruct Copilot progress from labels, status comments,
findings, checks and runs. Shared automation cannot retain each person's view
preferences or add contextual controls throughout their browser session.

### 2.2 Observed behavior

1. `README.md` describes the existing issue → branch → implementation → PR → review
   → release flow, CLI and local web setup assistant.
2. `specs/catalog.json` catalogues managed issue lifecycle, SDD readiness, comment
   authorization, Bugbot reconciliation and exact-revision PR readiness.
3. `src/application/usecases/read_copilot_status_workflow.ts` combines native
   issue/PR facts, SDD evidence and PR readiness; it is not a browser API.
4. `src/application/ports/pull_request_status_read_ports.ts` already separates
   read-only evidence access from approval mutation.
5. `specs/comment-automation-and-authorization.md` restricts command contexts and
   write authority. A general issue comment cannot invent a branch target.

These are integration evidence, not evidence that browser support exists.
The proposed catalog entry references existing Action entrypoints, read ports,
status tests and documentation because the catalog requires existing evidence
paths even for proposed capabilities. Those paths establish the integration
baseline only. This change verifies specifications, schemas and examples; it
does not establish extension code, runtime tests or browser support.
The current local web setup assistant configures repositories; it is not the
extension runtime or a required resident server.

### 2.3 Evidence and unknowns

Related owning contracts: [managed lifecycle](managed-issue-and-branch-lifecycle.md),
[SDD status](pre-branch-sdd-status-readiness.md),
[PR readiness](guarded-pull-request-approval-status.md),
[commands](comment-automation-and-authorization.md),
[findings](bugbot-review-state-reconciliation.md),
[publication](semantic-github-publication-and-notification.md) and
[locale](repository-locale-and-localization.md).
Browser primary sources and technical mechanics research are recorded in the
platform companion. Prototype performance, real browser results and store
acceptance are unknown until implementation; this proposal claims none of them.

### 2.4 Retrospective classification

Not applicable: this is a prospective product contract, not an as-built baseline.

## 3. Actors, surfaces, and terminology

| Actor | Goal | Entry point | Visible surfaces |
|---|---|---|---|
| Developer | Navigate and read more efficiently | Repository/file/diff/list | Inline controls, personal preferences |
| Issue/PR author | Understand the next action | Issue or PR | Copilot panel and native composer |
| Reviewer | Inspect current findings with history | PR conversation or Files changed | Findings navigator and native review threads |
| Repository maintainer | Enable trusted connected data | Reviewed default-branch configuration | Discovery, compatibility and Action source links |
| Extension operator | Configure/recover a browser installation | Toolbar/options | Permissions, session connection, feature diagnostics |

**Standalone** means page-local features without API credentials or Copilot.
**Connected** means explicitly enabled reads from a compatible repository.
**Current** means identity and freshness checks pass at observation time.
**Historical** is inspectable past evidence, never current readiness.
**Prepared** means a draft exists; **submitted** and **executed** are later facts.
The extension's name in examples is provisional `Copilot`; no store or trademark
availability is claimed. Naming does not block this design.

## 4. Goals, non-goals, and fixed invariants

### 4.1 Normative product requirements

- **P1 — Independent utility:** U1–U6 work without a token, Action or backend.
- **P2 — Bounded scope:** the MVP consists of U1–U6 and K1–K3 on the three desktop
  browsers. Catalog phases do not silently increase MVP scope.
- **P3 — Honest context:** K1/K2 use the integration contract, show source/time and
  distinguish missing, stale, partial and historical evidence from completion.
- **P4 — Human submission:** K3 prepares supported requests for the exact native
  composer, preserves drafts and never submits, merges, approves or dispatches.
- **P5 — Personal control:** each feature has an explicit default, repository
  override and reversible disable/pause/reset path.
- **P6 — Native usability:** filters expose hidden counts, never silently hide
  required action, and leave native content, editors and checks reachable.
- **P7 — Inclusive presentation:** all primary states have keyboard, screen-reader,
  light/dark, zoom/narrow and complete EN/ES presentations.
- **P8 — Bounded work:** page work, requests and notification noise obey the
  platform/integration budgets and stop on pause, navigation or revocation.
- **P9 — Verifiable delivery:** the catalog, 96-case budget, documentation and
  browser evidence gates in §§14–19 accompany implementation.

The formal requirement IDs BEX-P1 through BEX-P9 correspond to P1 through P9
below. All normative tables below refine those requirements. A reference to a companion's requirement
incorporates that requirement; explanatory examples are not evidence of delivery.

| Requirement | Behavior |
|---|---|
| BEX-P1 | Standalone utility without Action, credential or backend. |
| BEX-P2 | Nine bounded MVP capabilities across Chrome, Firefox and desktop Safari. |
| BEX-P3 | Source-bound, complete and honest current versus historical context. |
| BEX-P4 | Exact-context draft preservation and human-owned submission only. |
| BEX-P5 | Bounded personal defaults, overrides, migration, pause and recovery. |
| BEX-P6 | Idempotent native coexistence and explicit reversible filtering. |
| BEX-P7 | Accessible, localized and responsive presentation for every primary state. |
| BEX-P8 | Bounded DOM/network work and cancellation without unsolicited writes. |
| BEX-P9 | Traceable tests, secure artifacts, documentation and actual browser proof. |

### 4.2 Outcomes and non-goals

Acceptance demonstrates: standalone installation without authentication; one
primary next action in every connected state; one mount per feature/page; no
request caused by rendering that posts a comment or invokes AI; and the complete
browser matrix passing before a release is advertised as MVP complete.

This specification-only change does not ship runtime code. MVP excludes direct
API writes, automatic approvals/merge/deploy, hosted accounts, telemetry,
cross-repository dashboards, arbitrary custom scripts/CSS, Enterprise hosts,
mobile extensions, notification mutation and a replacement GitHub editor.

### 4.3 Fixed invariants

P3/P4/P6 cannot be weakened by settings. An extension cannot grant Action write
authority, create or rename a managed branch, infer a missing PR association, or
turn absent findings into zero. Native controls remain the recovery path.

## 5. Current versus proposed product journey

| Stage | Current | Proposed | User effect |
|---|---|---|---|
| Install | Separate automation/setup tooling | Explain standalone and optional connection | Immediate value without credentials |
| Navigate | Native links and repeated manual browsing | U1/U2 helpers beside known destinations | Fewer context switches |
| Read | Repeated layout/filter choices | U3/U4, with visible filtering | Personal readable view |
| Understand work | Compare comments/checks/runs | K1 with verified links and observation time | Know status and responsible actor |
| Review | Open findings across threads | K2 grouped navigator with native links | Find active versus historical evidence |
| Request work | Remember command/context restrictions | K3 preview in the correct composer | Explicit target and human submission |
| Recover | Guess whether extension/Action failed | Per-feature reason and native fallback | Isolated recovery |

```mermaid
flowchart LR
    I[Install and grant GitHub page access] --> U[Standalone improvements]
    U --> O[Opt in to repository connection]
    O --> V[Validate configuration and current publication]
    V --> C[Context and findings]
    C --> D[Prepare supported native draft]
    D --> H[Human reviews and submits]
    H --> A[Action authorizes and executes]
    A --> V
```

Text equivalent: install → standalone use → optional connection → verified
context → prepared draft → human submission → Action result → refreshed context.
Denied connection leaves standalone use available.

## 6. Functional behavior and state model

### 6.1 MVP inventory

The connected context, findings and draft capabilities use the issue
identifiers K1, K2 and K3. Test cases use the separate browser694 namespace.

All rows target Chrome/Firefox/Safari desktop under D1. `Page` means existing
visible DOM/URL only; it does not authorize background API fetching. Clipboard
writes require a user gesture and use the browser-adapted path in D3.

| ID | Problem, surface and concrete interaction | Data / permission / freshness | Default, dependency and coexistence | Acceptance |
|---|---|---|---|---|
| U1 | Copy issue/PR canonical URL or immutable file/line permalink; make only unambiguous references navigable | Page; GitHub page access; rederive after navigation | On; omit duplicate native control; ambiguous number stays text; unavailable commit disables permalink | Copy points to observed object/revision; hostile URL never linked |
| U2 | PR Files changed: next/previous visible file and optional generated-file focus filter | Page; no API; mounted/rendered files only | Navigation on; filter off; use native generated classification, never guess from suffix; hidden count and Restore all | No missed native checks/comments; virtualization reports visible subset |
| U3 | PR/issue conversation: expand/collapse resolved/outdated threads and jump to last loaded relevant event | Page; thread-native state; refresh on DOM changes | On controls; no auto-collapse active threads; preserve editor subtree; label events not yet loaded | Collapsing leaves draft intact; restore returns focus and content |
| U4 | Issue/PR lists: restore explicit supported filter query and compact/comfortable personal density | Page URL plus local preferences; live query wins on navigation | Comfortable; saved view applied only on explicit Restore, never rewrites shared links; compact is opt-in | Opening a shared filtered link preserves its exact query |
| U5 | Shortcut help and extension commands for U1/U2/panel | Page; no broad keyboard capture | Help on, added bindings off until enabled; native/OS conflicts disable the binding; no editable/composition interception | Keyboard-only flow works; typing in comments has no side effects |
| U6 | Options: per-feature toggle, repository pause, reset, isolated diagnostic and settings export/import | Local extension settings only; no secrets/private evidence in exports | All recovery controls on; invalid imports rejected atomically | One broken feature can be disabled while GitHub and others work |
| K1 | Issue/PR inline panel: state, completed facts, next actor/action, source links to issue/SDD/branch/PR/run | Validated publication plus canonical API facts under I1–I7 | Off until repository opt-in; unsupported/missing producer is explicit; source panel never infers linkage | Stale source shows stale; multiple linked PRs require selection |
| K2 | PR findings navigator: group by path/severity/state and jump to native comment | I4 snapshot items; review-comment IDs validated | On only with connection; unavailable count stays unknown; historical items separately labeled; no thread mutation | File group includes counts/coverage; old finding cannot certify current head |
| K3 | Prepare status/analyze, or eligible fix/dismiss request, in native composer with exact target preview | I8 allowed contexts and current user capability hints; no API write | Always user-triggered; existing nonempty draft triggers Append / Keep draft / Cancel; replace requires separate explicit choice | Correct review thread selected or copy-only fallback; never auto-submit |

U1–U6 show native accessible buttons with text labels/tooltips, use CSS tokens and
budgeted DOM adapters, and follow P6/P7/D2–D5. K1–K3 inherit those requirements and
I1–I10. No feature reads drafts as context for remote analysis. No per-user record
is written into repository files.

### 6.2 Full catalog beyond MVP

Rows are candidates with a defined problem and phase, not commitments. `P1` here
means post-MVP phase one; it does not refer to normative requirement P1. All
candidates are off until a separately approved slice supplies implementation,
documentation and tests. Each inherits P6–P8; all browser deviations are explicit
in that slice, not hidden behind detection.

| ID / phase | User problem and example surface | Mechanic and data | Permission/freshness / dependencies | Acceptance boundary |
|---|---|---|---|---|
| N1 / phase 1 | Workflow lacks easy return to originating PR | Workflow-to-PR link from native run associations | Actions/PR read; current run identity; K1 connection | No association means no fabricated PR |
| N2 / phase 1 | Repeated repository navigation | Personal quick destinations and discoverable shortcuts | Page URLs/local settings; U5 | Current repo identity and native navigation preserved |
| D1 / phase 1 | Indentation/whitespace hard to inspect | Explicit tab-width (2/4/8) and whitespace toggle in code/diff | Rendered text only; no source rewriting | Copied code bytes and line anchors unchanged |
| D2 / phase 1 | PRs touch related files | Show authoritative open PR/file associations on demand | PR read; paginated API snapshot; bounded retrieval | Incomplete result labeled partial |
| D3 / phase 1 | Large diff has noisy bot/generated changes | Explicit filters by native actor/classification | Page or connected native facts; U2; off | Counts/Restore all; no silent review clearance |
| L1 / phase 1 | Lists obscure useful metadata | Compact badges for updated/locked/draft with textual labels | Page/native facts; refresh after navigation | No guessed state from decorative icons |
| L2 / phase 1 | Conversations are long | Jump between loaded open/close/review events and explicit bot-noise grouping | Page; no automatic loading entire history | Hidden actions remain counted and reachable |
| A1 / phase 1 | CI context is fragmented | On-demand concise run/check explanation with sources | Actions read; optional Checks access only if supported auth; K1 | Unavailable evidence never shown as pass |
| Q1 / phase 2 | Notification triage repeats navigation | Saved views, source destination and explicit multi-open | Future notification permission/API design required | No mark-read/subscribe side effect on navigation |
| R1 / phase 1 | Release comparison takes several hops | Compare current tag to user-selected preceding tag | Contents read or native links; immutable resolved refs | Not chronological guessing for semver/prereleases |
| R2 / phase 2 | Unsure which release includes a merged PR | On-demand commit ancestry/tag evidence | Contents/PR read; bounded history with completeness | Unknown ancestry stays unknown |
| X1 / phase 2 | Operate across repositories | Personal work overview | Separate authorization/cache/account isolation design | No widening host/repository access by discovery |
| X2 / phase 2 | Repeat routine mutation | Reviewed API-write shortcuts | Separate write scopes, actor authorization, replay/cancellation design | Explicit operation-time confirmation and server checks |
| X3 / phase 2 | Enterprise/mobile users need support | Exact-host adapters and platform-specific interaction | Separate opt-in host/store/test matrix | No wildcard hosts; unavailable support stated |

Before promoting a candidate, expand its row to the same per-feature acceptance,
data/permission/default/accessibility/performance/coexistence detail as §6.1;
approval of this catalog alone is not authorization to ship it.

### 6.3 State model

| State | Entered when | Visible meaning / primary action | Transition / owner |
|---|---|---|---|
| Standalone | Connected mode off/manifest absent | Improvements available / Configure connection | User can opt in; U features independent |
| Loading | Bounded collection in progress | Checking current context / no action needed | Reader → current, partial, unavailable |
| Pending | Verified Action work in progress | Waiting for run / Inspect run | Action completes or user revisits |
| Action required | Verified clarification/review blocker | Waiting for author/maintainer / Open source question | Human acts, Action republishes |
| Blocked | Proven failed prerequisite | Work blocked, retained facts shown / Inspect blocker | Operator/author repairs; fresh evidence |
| Partial | Some facts succeeded, others unavailable | Completed facts retained; no aggregate readiness / Inspect missing evidence | Fresh complete collection |
| Complete snapshot | All required facts pass at fenced identity | Latest assessment complete at time T / View result | New revision/event invalidates snapshot |
| Stale | TTL, identity, policy or generation changed | Previous result is historical / Refresh current context | Reader obtains fresh source |
| Unavailable/incompatible | Denied/malformed/future major/missing producer | Current context unavailable / Open native GitHub | Operator restores compatibility/access |
| Paused | Repository/features disabled | Extension paused here / Resume | User resumes; old requests stay canceled |

Terminal native close/merge is shown directly with its reason and source; a
historical percentage or finding card cannot reopen it. State priority and
evidence ownership are specified in I4/I5.

## 7. User-facing configuration

Settings schema version 1 is extension-owned; no secrets are accepted by this
schema. Unknown top-level keys, unknown feature IDs, invalid enums or oversized
imports are rejected with no partial write. Import size is at most 64 KiB and
repository overrides at most 100. Repository identities use GitHub numeric ID,
not a mutable name alone; renamed repositories retain their preference mapping.

| Input | Type / default | Allowed values | Scope and persistence |
|---|---|---|---|
| `features` | Map; defaults in §6.1 | Known IDs → boolean | Global plus per-repo override, local storage |
| `density` | Enum; `comfortable` | `comfortable`, `compact` | Global, repo override |
| `locale` | Enum; `auto` | `auto`, `en`, `es` | Global; browser primary language then EN fallback |
| `theme` | Enum; `github` | `github`, `light`, `dark` | Global; GitHub tokens/contrast respected |
| `shortcuts` | Boolean; `false` | true/false | Global, repo override; fixed conflict-aware binding catalog |
| `connected` | Boolean; `false` | true/false | Explicit numeric repository opt-in |
| `paused` | Boolean; `false` | true/false | Global or repository; pause wins over enabled flags |
| `savedViews` | Map; empty | ≤20 query strings, ≤2,000 chars each; issue/PR routes only | Repo; explicit restore, not automatic route replacement |

K1/K2/K3 feature switches default enabled, but their eligibility is false until
the user explicitly connects that repository; they never auto-connect. U5 help
exists by default while additional key bindings stay off. If all C features are
disabled, no connected reads are scheduled. Import cannot grant host permission,
restore a credential or activate a new repository connection: imported connection
preferences require a separate local user opt-in, and an active pause remains
effective until explicitly resumed. Export previews repository preference scope;
private API evidence and credentials are never part of settings.

Precedence: fixed safety/compatibility rules → global pause → repository pause →
repository setting → global preference → shipped default. Snapshots take an
immutable settings version per operation; a pause/revocation cancels it even
after snapshotting. Unknown newer schema makes settings read-only with export
and downgrade guidance; it is never silently rewritten. Migrations are atomic,
idempotent and retain one previous non-secret settings version until next
successful startup. Reset preview distinguishes global from current-repo reset;
disconnect also clears protected session data under D4.

Recommended settings: comfortable, locale auto, GitHub theme, U features at their
row defaults, shortcuts and connected mode off. Alternative: compact and U5
enabled in one repository, with K1/K2 connected there only. A repository cannot
override personal locale, grant credentials or turn K3 into auto-submission.

## 8. Clean Architecture design

The platform companion D2/D3 specifies the component graph, semantic ports and
executable import/message/manifest boundaries. Product owns feature eligibility,
information hierarchy and next-action selection; presentation never owns
authorization or provider state. Integration I1–I10 owns transport/provenance and
Action-side changes. Browser code cannot import the Action composition root,
Node process/filesystem adapters or runtime credentials.

View settings are durable local state. API evidence and credentials are separate
session state. Native GitHub and Action publications remain the durable shared
source; browser memory never establishes a successful operation.

## 9. UI/UX and content contract

### 9.1 Primary context panel

P3/P7: heading `Copilot`, one textual state, completed facts, next actor/action,
impact, source links, then collapsed technical detail. Do not show internal schema
IDs in the main flow. On wide screens mount beneath issue/PR header; at ≤760 CSS
pixels use an in-flow collapsible panel, not a fixed overlay. Native headings,
editors and checks are not displaced or hidden. No injected control duplicates a
native equivalent with the same destination and effect.

```text
Copilot · PR #158                      Updated 24 seconds ago
Changes required — waiting for the PR author
Completed: specification published · branch verified · CI completed
2 current findings; review covers this revision
Next: inspect the findings before preparing a correction request.
[View findings]  [Issue #142] [Specification] [Inspect run]
Technical details ▸ head/base, policy, run attempt and source time
```

### 9.2 Required state variants

```text
Pending
Copilot is reviewing this revision. Branch verification completed.
No action required. [Inspect current run]

Action required
Specification needs your answer. Branch has not been published.
Next: the issue author answers Q2. [Open clarification]

Blocked
Current context cannot confirm verification: the verification run failed.
The published specification and branch remain available.
Next: inspect the failure before retrying through GitHub. [Inspect blocker]

Partial
Specification and branch verified. Current review evidence is unavailable.
No overall readiness is claimed. [Inspect available sources]

Complete snapshot
Latest assessment completed for revision abc1234 at 10:42.
0 current findings with complete coverage. Human review still applies.
[View assessment]

Stale
A newer revision is open. The 10:42 assessment describes the previous revision.
Current finding count is unknown. [Refresh current context]

Unavailable / incompatible
Connected context is unavailable for this Action version.
Your GitHub view preferences still work. [Open native checks]
```

Errors follow impact → cause → action → retained facts. Sources use descriptive
links, and absent links are omitted rather than rendered as dead controls.
The findings view labels `Current`, `Historical`, `Coverage incomplete` in text;
color/severity icons supplement text. Empty current findings is shown only with
complete current coverage; otherwise `Current finding count unavailable`.

### 9.3 Draft preparation and noise

Preview target repository/PR/thread, exact command and consequence before editing.
For a nonempty editor, offer `Append request`, `Keep my draft`, `Cancel`; a
separate `Replace draft…` path previews the old draft and requires confirmation.
If safe targeting fails, show a copyable command and exact destination link.
Appending is idempotent by operation ID and current editor digest; no duplicate
append after rerender. Do not claim a copied draft was inserted.

Opening/refreshing a page creates zero comments, notifications, Actions or AI
requests. K3 native submission creates the user's normal GitHub comment; existing
Action publication budgets remain authoritative. Extension diagnostics use local
nonmodal messages; no notification permission is requested.

### 9.4 Accessibility and localization

P7/D5: every action has an accessible name, visible focus and keyboard path;
expanded state is programmatic; dynamic results use a polite bounded status
announcement. Preserve focus on equivalent owned control after refresh, otherwise
restore a safe parent without stealing focus from native editing. Help bindings
are discoverable and conflict-checked. Respect reduced motion and 200% zoom,
320 CSS pixel layout, high contrast, and EN/ES complete catalogs. Resolve the
extension's locale once per render; unsupported language uses complete English.
Action publications retain their repository locale and are clearly attributed;
do not machine-translate command operands or diagnostic source text.

## 10. Failure, recovery, and cleanup

| Failure | Impact and retained facts | Recovery | Cleanup |
|---|---|---|---|
| Missing DOM anchor | A named feature unavailable; native page works | Disable feature or reload after update | Owned nodes/listeners only |
| Navigation while loading | Old response cannot affect new repo/PR | New page generation starts fresh | Abort old request/observers |
| Offline/denied/rate limited | Connected evidence unavailable/stale | Native source and bounded retry I6 | Purge denied private data |
| Bad settings import | Existing preferences retained | Correct error/export current version | No partial migration |
| Extension updated in open tab | Duplicate generation rejected | One refresh prompt; native UI stays | Retire old owned generation |
| Draft already edited | Request not inserted | Keep, append, replace explicitly, or copy | No draft telemetry/persistence |
| Pause/uninstall | Owned enhancement removed; repository unaffected | Resume/reinstall intentionally | D4 session/credential cleanup |

The platform companion defines suspension, partial writes, settings quota and
rollback; the integration companion defines replay, stale identity and API
limits. No recovery automatically submits or retries a mutation.

## 11. Security, permissions, and privacy

P1/P4/P6 incorporate I7–I9 and D4. Standalone operation uses GitHub page access and
local settings. Optional API permission/authentication is requested at connection
time with exact origin and selected repository explanation. Tokens, private
evidence, code, drafts and browsing history are excluded from synchronized
preferences, exports, telemetry and diagnostics. No remote executable features,
custom scripts or arbitrary fetch/command messages are supported.

## 12. Observability and operational UX

Per-feature diagnostics show enabled/paused/unsupported/error, affected surface,
extension version, browser adapter and sanitized error code. They do not include
page text, draft contents, private paths or credentials. Explicit export previews
the sanitized report. Connected detail adds source/time/run link without bulk
logs. No network telemetry ships in MVP. Action Job Summaries remain inspectable
source evidence; future producer changes add a publication outcome and source
identity under I10 without extra timeline comments.

## 13. Compatibility, migration, rollout, and rollback

U features remain available with old/no Action. Connected schema compatibility is
I2; an unsupported major fails closed for C features. Existing native comments,
labels, drafts and checks are not migrated into extension ownership.

Rollout sequence: internal unpacked builds on all three browsers → opt-in pilot
with public/private fixtures → beta stores/TestFlight → reviewed release across
the three targets. Each stage needs D8 evidence. Pausing one broken feature is
the first recovery; a reviewed compatible package/settings version is rollback.
Store version monotonicity may require publishing a higher version containing a
revert rather than installing an older signed version. Never promise immediate
store review or silently drop Safari to call the MVP shipped.

## 14. Testing strategy and numeric budget

**96 distinct future implementation cases**, derived from nine capabilities,
asynchronous DOM navigation, a new trust/compatibility contract and three browser
packages. This specification change does not create or claim these tests.

| Area / case IDs | Minimum | Covered behavior inventory | Owner |
|---|---:|---|---|
| bex-F-C01–bex-F-C12 pure feature/configuration | 12 | eligibility by surface; defaults; pause precedence; repo identity/rename; invalid enum; unknown feature; oversized import; atomic migration; old schema; future schema; saved query precedence; nonconfigurable invariants | Product/platform |
| bex-N-C01–bex-N-C14 lifecycle/races | 14 | initial mount; soft navigation; partial refresh; back/forward; virtualized insertion; removal; dedup; request cancellation; late response; cross-repo response; two tabs; update generation; pause during work; bounded observer disposal | Platform |
| bex-A-C01–bex-A-C12 adapters/API | 12 | canonical issue; canonical PR; exact file SHA; ambiguous link; missing anchor; clipboard denied; 401; 403; masked 404; offline; 429/secondary limit; incomplete pagination | Platform/integration |
| bex-I-C01–bex-I-C16 Action contract | 16 | absent manifest; valid manifest; unknown major; malformed payload; untrusted author; foreign repo; missing native association; multiple PRs; superseded run; head changed; base/policy changed; stale time; partial coverage; corrupt counts; unknown capabilities; final identity fence | Integration |
| bex-V-C01–bex-V-C14 presentation/drafts | 14 | standalone; pending; action-required; blocked; partial; complete; stale; unavailable; EN/ES fallback; keyboard/focus; light/dark/zoom; editor preservation; append dedup; wrong-context copy fallback | Product |
| bex-S-C01–bex-S-C16 permissions/security | 16 | host allowlist; protected route; least privilege; session token isolation; secret redaction; origin/sender spoof; arbitrary fetch rejection; command injection; unsafe URL; hostile Markdown; export exclusion; account change; logout; revocation; private/incognito separation; remote-code prohibition | Platform/integration |
| bex-E-C01–bex-E-C12 packaging/migration/integration | 12 | Chrome load; Firefox load; Safari real extension load; worker suspension; event-page restart; API permission revoked; no-Action usability; mixed-version compatibility; settings rollback; uninstall cleanup; coexistence; performance budget | Platform |
| **Total** | **96** | Repeated matrix execution is not a new behavior | All |

| Area | Minimum distinct cases | Behaviors/risks covered |
|---|---|---|
| Feature policies | 12 | See the observable F inventory rows below. |
| Navigation lifecycle | 14 | See the observable N inventory rows below. |
| Provider adapters | 12 | See the observable A inventory rows below. |
| Action evidence | 16 | See the observable I inventory rows below. |
| Presentation and drafts | 14 | See the observable V inventory rows below. |
| Security and permissions | 16 | See the observable S inventory rows below. |
| Packaging and integration | 12 | See the observable E inventory rows below. |
| Total | 96 | All distinct behaviors; matrix runs do not add cases. |

| Case ID | Area | Requirements | Scenario |
|---|---|---|---|
| bex-F-C01 | Feature policies | BEX-P1, BEX-P2 | Unsupported page mounts no feature and makes no API request. |
| bex-F-C02 | Feature policies | BEX-P1, BEX-P5 | Fresh settings resolve all shipped defaults without a credential. |
| bex-F-C03 | Feature policies | BEX-P5, BEX-P8 | Repository pause wins over an enabled global feature. |
| bex-F-C04 | Feature policies | BEX-P5 | Repository rename retains numeric-ID preferences without affecting another repository. |
| bex-F-C05 | Feature policies | BEX-P5 | Invalid setting enum is rejected with previous settings intact. |
| bex-F-C06 | Feature policies | BEX-P2, BEX-P5 | Unknown feature ID does not activate code or corrupt known preferences. |
| bex-F-C07 | Feature policies | BEX-P5, BEX-P9 | An import over 64 KiB is rejected before any settings write. |
| bex-F-C08 | Feature policies | BEX-P5, BEX-P9 | Interrupted migration retains the prior complete settings version. |
| bex-F-C09 | Feature policies | BEX-P5 | A supported old settings version migrates once with the same second-run result. |
| bex-F-C10 | Feature policies | BEX-P5 | A future settings schema remains read-only and exportable. |
| bex-F-C11 | Feature policies | BEX-P1, BEX-P6 | Opening a shared filtered link preserves its query until explicit Restore. |
| bex-F-C12 | Feature policies | BEX-P3, BEX-P4, BEX-P5 | An imported preference cannot enable auto-submission or weaken evidence checks. |
| bex-N-C01 | Navigation lifecycle | BEX-P6, BEX-P8 | Initial load creates one owned control set per eligible feature. |
| bex-N-C02 | Navigation lifecycle | BEX-P6, BEX-P8 | Soft navigation disposes the old page generation before mounting the new one. |
| bex-N-C03 | Navigation lifecycle | BEX-P6 | Partial React refresh restores one keyed control without rewriting native content. |
| bex-N-C04 | Navigation lifecycle | BEX-P6 | Back/forward restoration preserves native scroll and one extension generation. |
| bex-N-C05 | Navigation lifecycle | BEX-P6, BEX-P8 | A virtualized file insertion gets one helper with loaded-scope counts. |
| bex-N-C06 | Navigation lifecycle | BEX-P6, BEX-P8 | Removed native anchors release their owned observers and listeners. |
| bex-N-C07 | Navigation lifecycle | BEX-P4, BEX-P6 | Repeated initialization does not duplicate a button or draft request. |
| bex-N-C08 | Navigation lifecycle | BEX-P3, BEX-P8 | Navigation aborts pending reads and retires their generation. |
| bex-N-C09 | Navigation lifecycle | BEX-P3, BEX-P8 | A late response cannot restore a disposed page view. |
| bex-N-C10 | Navigation lifecycle | BEX-P3 | A previous repository response never renders in the new repository. |
| bex-N-C11 | Navigation lifecycle | BEX-P8 | Two tabs coalesce one target refresh within the shared request budget. |
| bex-N-C12 | Navigation lifecycle | BEX-P6, BEX-P9 | An extension update retires old owned controls and offers one refresh affordance. |
| bex-N-C13 | Navigation lifecycle | BEX-P5, BEX-P8 | Pausing during collection prevents further reads and DOM updates. |
| bex-N-C14 | Navigation lifecycle | BEX-P6, BEX-P8 | After twenty navigation cycles resource counts return to the declared disposal baseline. |
| bex-A-C01 | Provider adapters | BEX-P1, BEX-P6 | The copied issue URL identifies the observed canonical repository and issue. |
| bex-A-C02 | Provider adapters | BEX-P1, BEX-P6 | The PR helper links the exact observed PR without selecting a same-number issue. |
| bex-A-C03 | Provider adapters | BEX-P1, BEX-P6 | A file permalink contains the verified immutable commit and line anchor. |
| bex-A-C04 | Provider adapters | BEX-P1, BEX-P6 | Ambiguous references stay plain text rather than guessed links. |
| bex-A-C05 | Provider adapters | BEX-P1, BEX-P6 | Missing DOM anchor disables only the affected helper. |
| bex-A-C06 | Provider adapters | BEX-P1, BEX-P6 | Denied clipboard access offers selectable text without claiming copy success. |
| bex-A-C07 | Provider adapters | BEX-P3, BEX-P8 | A 401 clears protected credentials/evidence and exposes reconnect guidance. |
| bex-A-C08 | Provider adapters | BEX-P3, BEX-P8 | A 403 marks current connected evidence unavailable without broader access fallback. |
| bex-A-C09 | Provider adapters | BEX-P3 | A masked private 404 is unknown access, not proof the object does not exist. |
| bex-A-C10 | Provider adapters | BEX-P3, BEX-P8 | Offline refresh retains clearly historical source facts and creates no retry loop. |
| bex-A-C11 | Provider adapters | BEX-P8 | A secondary rate limit postpones requests until the provider or bounded backoff allows them. |
| bex-A-C12 | Provider adapters | BEX-P3, BEX-P8 | Incomplete pagination exposes partial scope and no aggregate zero or ready state. |
| bex-I-C01 | Action evidence | BEX-P1, BEX-P3 | Missing reviewed manifest leaves standalone features usable and connected mode off. |
| bex-I-C02 | Action evidence | BEX-P2, BEX-P3 | A valid pinned manifest and compatible source expose only declared capabilities. |
| bex-I-C03 | Action evidence | BEX-P2, BEX-P3 | A future schema major disables connected projections with upgrade guidance. |
| bex-I-C04 | Action evidence | BEX-P3, BEX-P9 | Malformed or duplicate-key source JSON is rejected before projection. |
| bex-I-C05 | Action evidence | BEX-P3, BEX-P9 | A copied marker from a different numeric author never becomes trusted evidence. |
| bex-I-C06 | Action evidence | BEX-P3 | Foreign repository/conversation identity is rejected despite matching display names. |
| bex-I-C07 | Action evidence | BEX-P3 | Missing explicit association does not invent an issue, branch or PR link. |
| bex-I-C08 | Action evidence | BEX-P3, BEX-P4 | Multiple reported linked PRs require a PR-specific view instead of choosing the newest. |
| bex-I-C09 | Action evidence | BEX-P3 | An older run attempt or generation cannot overwrite newer observed evidence. |
| bex-I-C10 | Action evidence | BEX-P3 | A changed head clears aggregate satisfaction and current finding counts. |
| bex-I-C11 | Action evidence | BEX-P3 | Changed base/public policy identity clears the prior aggregate; hidden live policy remains unknown. |
| bex-I-C12 | Action evidence | BEX-P3, BEX-P8 | Expired or future-skewed observation time yields stale/unavailable, not a current assessment. |
| bex-I-C13 | Action evidence | BEX-P3 | Partial review coverage preserves source facts but keeps the aggregate finding count unknown. |
| bex-I-C14 | Action evidence | BEX-P3, BEX-P9 | Inconsistent finding totals/items are rejected rather than rounded to zero. |
| bex-I-C15 | Action evidence | BEX-P2, BEX-P3 | Unsupported capability tokens never execute code or enable a command. |
| bex-I-C16 | Action evidence | BEX-P3, BEX-P8 | A final identity/page/credential fence rejects a response superseded during collection. |
| bex-V-C01 | Presentation and drafts | BEX-P1, BEX-P7 | Standalone view explains optional connection while U controls remain available. |
| bex-V-C02 | Presentation and drafts | BEX-P3, BEX-P7 | Pending view names completed facts, the active run and that no human action is required. |
| bex-V-C03 | Presentation and drafts | BEX-P3, BEX-P7 | Action-required view names the responsible actor and exact clarification destination. |
| bex-V-C04 | Presentation and drafts | BEX-P3, BEX-P7 | Blocked view follows impact, cause, action and retained-facts order. |
| bex-V-C05 | Presentation and drafts | BEX-P3, BEX-P7 | Partial view retains verified facts and omits overall readiness. |
| bex-V-C06 | Presentation and drafts | BEX-P3, BEX-P7 | Complete snapshot view includes assessed revision/time and preserves human-review obligations. |
| bex-V-C07 | Presentation and drafts | BEX-P3, BEX-P7 | Stale view separates the previous assessment from unknown current finding counts. |
| bex-V-C08 | Presentation and drafts | BEX-P3, BEX-P7 | Unavailable view links native GitHub and does not imply underlying Action work failed. |
| bex-V-C09 | Presentation and drafts | BEX-P7 | Unsupported locale falls back atomically to complete English while Spanish is complete. |
| bex-V-C10 | Presentation and drafts | BEX-P6, BEX-P7 | Keyboard focus survives refresh and all controls have accessible names. |
| bex-V-C11 | Presentation and drafts | BEX-P7 | Light/dark, high contrast, 200 percent zoom and narrow layout retain readable actions. |
| bex-V-C12 | Presentation and drafts | BEX-P4, BEX-P6, BEX-P7 | Keeping or canceling a prepared request preserves every existing native draft byte. |
| bex-V-C13 | Presentation and drafts | BEX-P4, BEX-P6 | Append request happens once despite rerender and leaves submission to the user. |
| bex-V-C14 | Presentation and drafts | BEX-P4, BEX-P7 | Unsupported correction context offers an exact copy-only destination without inserting a broad request. |
| bex-S-C01 | Security and permissions | BEX-P8, BEX-P9 | An unapproved host or cross-origin redirect receives no credential or provider request. |
| bex-S-C02 | Security and permissions | BEX-P8, BEX-P9 | Protected login/token/settings routes install no private observers or connected reads. |
| bex-S-C03 | Security and permissions | BEX-P1, BEX-P9 | Standalone installation requests no API write or blanket host permission. |
| bex-S-C04 | Security and permissions | BEX-P9 | Content scripts cannot retrieve the protected session token through storage or messages. |
| bex-S-C05 | Security and permissions | BEX-P9 | Token-bearing diagnostics are redacted and no raw credential is returned to a view. |
| bex-S-C06 | Security and permissions | BEX-P3, BEX-P9 | Forged origin/frame/tab sender fails before any semantic read operation. |
| bex-S-C07 | Security and permissions | BEX-P8, BEX-P9 | An arbitrary URL/method/body message is rejected by the closed background protocol. |
| bex-S-C08 | Security and permissions | BEX-P4, BEX-P9 | A finding operand containing command separators or line breaks cannot create a mutation draft. |
| bex-S-C09 | Security and permissions | BEX-P3, BEX-P9 | Unsafe source URLs render as unavailable text rather than executable links. |
| bex-S-C10 | Security and permissions | BEX-P6, BEX-P9 | Hostile Markdown/HTML cannot inject DOM, executable selectors or control text. |
| bex-S-C11 | Security and permissions | BEX-P5, BEX-P9 | Settings/diagnostic export excludes tokens, private evidence and human draft contents. |
| bex-S-C12 | Security and permissions | BEX-P3, BEX-P9 | Account change invalidates the old epoch before clearing its credential and cache. |
| bex-S-C13 | Security and permissions | BEX-P3, BEX-P9 | Observed logout/different-viewer signal pauses connection without claiming the PAT was revoked. |
| bex-S-C14 | Security and permissions | BEX-P3, BEX-P9 | Revocation blocks late responses from repopulating cleared private session state. |
| bex-S-C15 | Security and permissions | BEX-P9 | Private browsing refuses connected operation and retains no navigation evidence. |
| bex-S-C16 | Security and permissions | BEX-P2, BEX-P9 | Bundle/manifest checks reject remote executable code and undeclared permission expansion. |
| bex-E-C01 | Packaging and integration | BEX-P2, BEX-P9 | Chrome loads the exact generated artifact and exercises all eligible MVP capabilities. |
| bex-E-C02 | Packaging and integration | BEX-P2, BEX-P9 | Firefox loads the target artifact on stable and selected ESR with the same semantics. |
| bex-E-C03 | Packaging and integration | BEX-P2, BEX-P9 | A real Safari containing-app extension is enabled and exercised; generic WebKit cannot substitute. |
| bex-E-C04 | Packaging and integration | BEX-P3, BEX-P8 | Chrome worker suspension resumes with session state or an explicit disconnect and fresh identity read. |
| bex-E-C05 | Packaging and integration | BEX-P3, BEX-P8 | Firefox/Safari event-page restart does not rely on persistent process globals. |
| bex-E-C06 | Packaging and integration | BEX-P1, BEX-P8, BEX-P9 | Optional API site-access revocation aborts reads while standalone U features remain usable. |
| bex-E-C07 | Packaging and integration | BEX-P1, BEX-P2 | A repository without Copilot still provides standalone functionality without a token. |
| bex-E-C08 | Packaging and integration | BEX-P2, BEX-P3, BEX-P9 | Old/no/future producer versions retain standalone use and disclose connected compatibility. |
| bex-E-C09 | Packaging and integration | BEX-P5, BEX-P9 | Reviewed code/settings rollback restores a compatible view without credential backup. |
| bex-E-C10 | Packaging and integration | BEX-P6, BEX-P9 | Disable/uninstall releases owned resources and session secrets without repository side effects. |
| bex-E-C11 | Packaging and integration | BEX-P6, BEX-P9 | A native/other-extension equivalent prevents duplicate helpers and leaves original controls intact. |
| bex-E-C12 | Packaging and integration | BEX-P8, BEX-P9 | Measured startup, DOM, retained-memory and request work meets the published budgets. |

Keep existing repository thresholds. New pure evidence/authorization decisions
require 100% branch coverage; other changed modules retain applicable budgets.
Use fake clocks/IDs/providers, deterministic HTML/API fixtures, semantic UI
assertions and schema/manifest/dependency parsing, not only snapshots or grep.
bex-E-C03 requires actual Safari-extension evidence; generic WebKit does not suffice.
D8 supplies the browser/OS matrix, real screen-reader/keyboard/theme artifacts and
performance measurement procedure. Every behavior inventory item above has a
stable case ID; matrix permutations are recorded separately.

## 15. Documentation and discoverability

These are implementation deliverables; this specification does not publish an
installation claim in user docs. Add a **docs/browser-extension/** navigation group
in `docs.json` only when its linked files exist and clearly carry availability.

| Audience | Planned artifact | Required content / validation |
|---|---|---|
| User | `docs/browser-extension/index.mdx`, `features.mdx` | Standalone → optional connected journey, feature defaults, visual/text example; links checked |
| Setup owner | `installation.mdx`, `permissions.mdx` | Three store/dev install paths, optional read token, repository manifest, no bot token; fixture-checked examples |
| User | `configuration.mdx`, `privacy.mdx` | Complete bounds/precedence, export/reset, session data, no telemetry; settings schema fixtures |
| Operator | `troubleshooting.mdx`, `compatibility.mdx` | Unavailable/stale/partial, revoke, pause, upgrade/rollback, browser table; recovery fixture links |
| Contributor | `architecture.mdx`, `action-contract.mdx` | Ports, trust, schema ownership and tests; executable boundary/schema checks |

Also update README discoverability and the existing Action status/command docs
when compatible producer support actually ships. Run repository documentation,
asset/frontmatter, navigation and specification checks for changed artifacts.


Publication consistency inventory: proposed future user-documentation paths
are explicit design deliverables, not files shipped by this specification PR.

| Path | Change |
|---|---|
| specs/github-browser-extension.md | update |
| specs/github-browser-extension-action-integration.md | create |
| specs/github-browser-extension-platforms-and-delivery.md | create |
| specs/catalog.json | update |
| specs/CATALOG.md | update |
| docs.json | update |
| README.md | update |
| specs/browser-extension/status-v1.schema.json | create |
| specs/browser-extension/manifest-v1.schema.json | create |
| specs/browser-extension/examples/status-invalid-head-v1.json | create |
| specs/browser-extension/examples/manifest-v1.json | create |
| specs/browser-extension/examples/status-pr-v1.json | create |
| specs/browser-extension/examples/status-issue-v1.json | create |
| docs/browser-extension/index.mdx | create |
| docs/browser-extension/features.mdx | create |
| docs/browser-extension/installation.mdx | create |
| docs/browser-extension/permissions.mdx | create |
| docs/browser-extension/configuration.mdx | create |
| docs/browser-extension/privacy.mdx | create |
| docs/browser-extension/troubleshooting.mdx | create |
| docs/browser-extension/compatibility.mdx | create |
| docs/browser-extension/architecture.mdx | create |
| docs/browser-extension/action-contract.mdx | create |

## 16. Acceptance scenarios

1. Install with no token/Action: U1–U6 work; connected panel offers explicit setup.
2. Open a shared issue filter: its query remains unchanged until Restore is chosen.
3. Hide generated files: show count and Restore all; native required action stays.
4. Navigate/back while context loads: one owned control set; old response discarded.
5. Current compatible Action assessment: show exact identity/time/source and next
   actor; no claim that the extension authorizes merge.
6. New head/partial findings/denied source: no zero count or overall ready state.
7. Prepare fix in unsupported context: copy-only guidance to a verified location;
   no broad issue comment that pretends to target a branch.
8. Existing native draft: retain bytes on cancel/keep; append once; no submission.
9. Pause/disconnect: stop requests and remove owned enhancements/session evidence;
   native GitHub and repository state are unchanged.
10. All browser matrix cases and human evidence meet D8 before MVP completion;
    a missing Safari result is a release blocker, not a generic WebKit substitute.

## 17. Requirements traceability

| Requirement | Owning policy/use case/adapter/presentation | Verification | Documentation |
|---|---|---|---|
| P1 | Feature eligibility, page adapters | bex-F-C01–bex-F-C02, bex-A-C01–bex-A-C06, bex-E-C07 | index/features |
| P2 | Feature registry/catalog and package gates | bex-F-C06, bex-E-C01–bex-E-C03, D8 review | features/compatibility |
| P3 | I1–I7 evidence reader, context/findings VM | bex-I-C01–bex-I-C16, bex-V-C02–bex-V-C08 | action-contract/troubleshooting |
| P4 | DraftRequest and NativeComposer port | bex-V-C12–bex-V-C14, bex-S-C08, I8 acceptance | features/permissions |
| P5 | Settings/pause/migration use cases | bex-F-C03–bex-F-C12, bex-N-C13, bex-E-C09–bex-E-C10 | configuration/privacy |
| P6 | Feature lifecycle and renderers | bex-N-C01–bex-N-C14, bex-V-C10–bex-V-C12, bex-E-C11 | features/troubleshooting |
| P7 | Catalog/render/focus policies | bex-V-C01–bex-V-C14, D8 human matrix | features/compatibility |
| P8 | Request scheduler, observer budget | bex-A-C07–bex-A-C12, bex-E-C04–bex-E-C06/bex-E-C12 | privacy/troubleshooting |
| P9 | Build/schema/import/store gates | bex-S-C01–bex-S-C16, bex-E-C01–bex-E-C12 and doc validation | architecture/installation |

| Requirement | Cases |
|---|---|
| BEX-P1 | bex-F-C01, bex-F-C02, bex-F-C11, bex-A-C01, bex-A-C02, bex-A-C03, bex-A-C04, bex-A-C05, bex-A-C06, bex-I-C01, bex-V-C01, bex-S-C03, bex-E-C06, bex-E-C07 |
| BEX-P2 | bex-F-C01, bex-F-C06, bex-I-C02, bex-I-C03, bex-I-C15, bex-S-C16, bex-E-C01, bex-E-C02, bex-E-C03, bex-E-C07, bex-E-C08 |
| BEX-P3 | bex-F-C12, bex-N-C08, bex-N-C09, bex-N-C10, bex-A-C07, bex-A-C08, bex-A-C09, bex-A-C10, bex-A-C12, bex-I-C01, bex-I-C02, bex-I-C03, bex-I-C04, bex-I-C05, bex-I-C06, bex-I-C07, bex-I-C08, bex-I-C09, bex-I-C10, bex-I-C11, bex-I-C12, bex-I-C13, bex-I-C14, bex-I-C15, bex-I-C16, bex-V-C02, bex-V-C03, bex-V-C04, bex-V-C05, bex-V-C06, bex-V-C07, bex-V-C08, bex-S-C06, bex-S-C09, bex-S-C12, bex-S-C13, bex-S-C14, bex-E-C04, bex-E-C05, bex-E-C08 |
| BEX-P4 | bex-F-C12, bex-N-C07, bex-I-C08, bex-V-C12, bex-V-C13, bex-V-C14, bex-S-C08 |
| BEX-P5 | bex-F-C02, bex-F-C03, bex-F-C04, bex-F-C05, bex-F-C06, bex-F-C07, bex-F-C08, bex-F-C09, bex-F-C10, bex-F-C12, bex-N-C13, bex-S-C11, bex-E-C09 |
| BEX-P6 | bex-F-C11, bex-N-C01, bex-N-C02, bex-N-C03, bex-N-C04, bex-N-C05, bex-N-C06, bex-N-C07, bex-N-C12, bex-N-C14, bex-A-C01, bex-A-C02, bex-A-C03, bex-A-C04, bex-A-C05, bex-A-C06, bex-V-C10, bex-V-C12, bex-V-C13, bex-S-C10, bex-E-C10, bex-E-C11 |
| BEX-P7 | bex-V-C01, bex-V-C02, bex-V-C03, bex-V-C04, bex-V-C05, bex-V-C06, bex-V-C07, bex-V-C08, bex-V-C09, bex-V-C10, bex-V-C11, bex-V-C12, bex-V-C14 |
| BEX-P8 | bex-F-C03, bex-N-C01, bex-N-C02, bex-N-C05, bex-N-C06, bex-N-C08, bex-N-C09, bex-N-C11, bex-N-C13, bex-N-C14, bex-A-C07, bex-A-C08, bex-A-C10, bex-A-C11, bex-A-C12, bex-I-C12, bex-I-C16, bex-S-C01, bex-S-C02, bex-S-C07, bex-E-C04, bex-E-C05, bex-E-C06, bex-E-C12 |
| BEX-P9 | bex-F-C07, bex-F-C08, bex-N-C12, bex-I-C04, bex-I-C05, bex-I-C14, bex-S-C01, bex-S-C02, bex-S-C03, bex-S-C04, bex-S-C05, bex-S-C06, bex-S-C07, bex-S-C08, bex-S-C09, bex-S-C10, bex-S-C11, bex-S-C12, bex-S-C13, bex-S-C14, bex-S-C15, bex-S-C16, bex-E-C01, bex-E-C02, bex-E-C03, bex-E-C06, bex-E-C08, bex-E-C09, bex-E-C10, bex-E-C11, bex-E-C12 |

## 18. Implementation sequence

1. Approve these SDDs and catalog as proposed; resolve review findings before work.
2. Implement a portable extension shell, browser adapters, settings and U6 with
   actual extension-loaded smoke on Chrome/Firefox/Safari immediately.
3. Deliver U1–U5 in small slices with native coexistence and original fixtures.
4. Implement the Action producer/manifest contract and compatibility fixtures
   before enabling K1; update existing owning SDDs/docs/tests with that change.
5. Deliver protected session connection, K1/K2 and then K3 draft preparation.
6. Complete docs, 96 cases, browser/human/performance evidence and staged rollout.
7. Promote catalog candidates only through separately reviewed feature slices.

## 19. Definition of Done

For this specification issue: three linked decision-complete SDDs, proposed
catalog evidence, a generated catalog, valid links and passing specification
checks; no runtime claim. Product/architecture/security review remains explicit.

For future implementation:
- [ ] P1–P9 and I/D companion requirements have acceptance evidence and traceability.
- [ ] Architecture, manifests, schemas and package constraints are executable.
- [ ] The 96 distinct cases, coverage budgets and three-browser matrix pass.
- [ ] Bounds/defaults/settings migration and recovery match this contract.
- [ ] Primary states, draft preservation, accessibility and complete EN/ES pass.
- [ ] Failure/races/security/privacy/cleanup and zero unsolicited writes pass.
- [ ] User/setup/operator/contributor docs exist and navigation is validated.
- [ ] Platform accounts/signing and store readiness have named maintainer owners.
- [ ] Catalog evidence distinguishes specification, implementation and live proof.
- [ ] `pnpm run generate:specifications` and `pnpm run validate:specifications` pass.
- [ ] No material architecture/public behavior/data safety decision remains open.

## 20. References and decisions

Decisions: separate standalone/connected value; page-integrated panel; nine
capability MVP across all three browsers; optional session-only read connection;
native human submission; no hosted service prerequisite; one versioned producer
contract rather than heuristic parsing of internal comments. Detailed alternatives
are in the companions. Public extension mechanics inform requirements only;
source/UI/assets/wording are independently implemented. External product names
are confined to technical provenance, not the product UI or positioning.

The expanded specification retains all 96 case identities from the Action-published inventory for issue #694. The detailed BEX-P requirements refine the three initial grouping requirements; all retained cases keep their observable scenario intent.
