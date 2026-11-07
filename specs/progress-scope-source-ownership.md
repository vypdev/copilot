# Progress acceptance scope and persisted state ownership

- Status: Ready for implementation
- Date: 2026-11-01
- Catalog capability ID: github-communication-experience
- Owners: Copilot maintainers
- Scope: Preserve every human acceptance line while keeping persisted Copilot state out of model-defined requirement identities.
- Related issues: [#828](https://github.com/vypdev/copilot/issues/828), dependency for [#841](https://github.com/vypdev/copilot/pull/841).
- Review gates: source ownership, architecture, security, diagnostics, coverage, documentation and exact-head native review.
- Open decisions blocking readiness: none.

## 1. Outcome and fixed invariants

The complete issue snapshot remains the freshness authority. The host accounts
for its physical lines and separates one recognized, valid persisted
configuration block as operational context. The classifier must classify every
remaining nonempty human line exactly once. Only those lines can receive R/X
identities. Generated implementation-plan state cannot create extra acceptance
requirements or consume the 32-clause requirement budget.

```mermaid
flowchart LR
    A[Capture complete issue] --> B[Validate original source bounds and owned state]
    B --> C[Host accounts for operational state lines]
    B --> D[Classify every human source line]
    D --> E[Validate complete identities and unchanged clause bounds]
    E --> F[Assess complete immutable comparison]
    F --> G[Recheck complete issue and Git identity]
    G --> H[Existing progress card and labels]
```

Text equivalent: capture and bound the full original source; account for valid
operational state separately; classify all human lines; validate all original
human identities; assess all evidence; recheck the full snapshot before updating
existing progress. No truncated source, partial assessment, automatic repair or
new model invocation is introduced.

## 2. Observed evidence and limitations

Baseline `a032f500d67a91ea69f653d6fea08bec5e117fd6` sends every nonempty
physical issue line to the classifier, including hidden generated configuration.
`parseProgressScopeWithAnchors` allows any returned source ID to become a
requirement. A valid-looking classification of generated plan rows can therefore
exceed the unchanged 32-clause bound.

PR #841 head `842ba24f6547ff512b2e58c0d4b2d75384e5e36d` failed in
[Commit run 41305406177](https://github.com/vypdev/copilot/actions/runs/41305406177)
with `scope-clause-limit`, first crossing source `L125`, reference
`95648af5-551d-460c-b127-45b6c0d451ba`. Its subsequently captured issue snapshot
has 111 nonempty lines, with persisted state at physical L75–L134; L125 is in
that state. The original completed model response was not retained: the actual
selected total is unknown beyond at least 33. This observation is not proof that
metadata classification is the only live failure cause. Synthetic protocol
regressions separately prove the missing host ownership boundary.

The same issue can still exceed the supported human scope, be semantically
ambiguous, or receive invalid model output. Structural completeness does not
prove natural-language interpretation, execution, CI or merge approval.

## 3. Actors, surfaces and terminology

| Actor/surface | Responsibility |
|---|---|
| Issue author | Defines normative acceptance in human issue text. |
| Host source policy | Preserves physical identities, enforces bounds and identifies reserved persisted state. |
| Classifier | Classifies all admitted human IDs; has no authority to redefine operational ownership. |
| Maintainer / Check / Summary | Inspects exact phase, count, limit and source anchor; corrects unsupported or ambiguous scope. |
| Existing progress publisher | Rechecks complete original body and native refs before updating one card/label set. |

**Human line** means a nonempty original physical line outside the recognized
state span. No keyword, language, heading, report identity or prose-length
heuristic removes a human line. **Operational state** means the one complete
block recognized by the existing persisted-configuration delimiter scanner,
containing a JSON object with the currently supported schema version.

## 4. Source and configuration contract

- The original 1,024-nonempty-line and 1,200-code-point-per-line guards apply
  before separation, including operational lines. Oversized metadata cannot
  become an input-limit bypass.
- Reuse the persisted-state scanner, including its supported complete legacy
  fenced records. Ordinary marker mentions, unrelated HTML comments and text
  outside the owned span remain human source. Preserve exact qualifier,
  negation, Unicode, repeated-text identity and CRLF physical line numbering.
- Duplicate, nested, dangling or ambiguous owned delimiters fail closed.
  Invalid JSON, null/array state, absent or unsupported schema versions fail
  before classifier/evidence/final calls; retain existing progress.
- The supported configuration version has one domain owner, with the existing
  model constant and manager scanner imports kept compatible through exports.
- Every human line is classified once under the existing strict ID schema.
  Operational IDs cannot be returned as required, excluded or context entries:
  they are absent from the model ID enumeration and already host-accounted.
- Required plus uncertain lines retain the 32-clause bound; exclusions retain
  their independent 32 bound. Genuine human 33-clause scope still fails.
  Nonempty prose, 64,000-byte scope, 800-point fact ceiling, derived #829 field
  reservation, 8,000-point projection and all current evidence/runtime budgets
  remain unchanged.
- Full issue text remains untrusted context in evidence/final requests and the
  complete byte-for-byte snapshot remains the freshness check. A state-only
  concurrent body edit invalidates the assessment too.
- There are no new user inputs, credentials, permissions, overrides, migrations,
  settings, timers or retry loops. Unknown future schemas require normal reviewed
  adoption. This change does not publish a release or deployment.

## 5. Architecture and state ownership

| Boundary | Owns | Forbidden responsibilities |
|---|---|---|
| Domain | Shared delimiter scanner/version and closed count diagnostic facts | Provider, model invocation or persistence |
| Pure application policy | Whole-source guards, operational span accounting, immutable human IDs, clause validation | Manager/provider imports, file or network I/O |
| Progress use case | Existing sequential scope/evidence/final flow and safe measured source counts | Changing acceptance or bypassing freshness |
| Prompts/native response adapter | Untrusted framing and exact admitted schema identities | Inventing requirements or trusting execution claims |
| Presentation | Localized safe count/limit and recovery content | State mutation or raw source/provider prose |
| Configuration manager | Existing persistence through compatible shared-domain exports | A second divergent delimiter implementation |

The domain scanner is relocated without changing its delimiter behavior; existing
manager imports remain compatible. Dependency/architecture tests, typecheck,
strict native schema tests and the complete existing scanner tests enforce this
boundary. All new policy/diagnostic runtime lines require 100% measured coverage,
with every changed coverable line hit and no partial branches. No exclusions or
existing thresholds are reduced.

## 6. Failure and recovery UX

Pending: “Assessing human acceptance against the complete current comparison.
Previous progress remains available.” Existing surfaces and notification budget
are retained; no new timeline chatter is necessary.

An over-limit complete classification reports safe host-derived facts, for
example:

```text
Progress scope could not be assessed. Previous progress was retained.
Selected required/uncertain lines: 33; supported limit: 32.
First crossing original source: L41; phase: scope.
Inspect the original human scope and classifier result. A fresh valid
classification can help; do not remove requirements or raise limits to pass.
```

The actual count follows complete validated unique source classification; the
limit is exactly 32 and the kind is a closed required/uncertain-or-excluded value.
No raw rejected JSON, human prose, paths, credentials or arbitrary keys become
recovery variables. Native response adapters that reject before host source
validation retain their existing bounded diagnostic; no count is guessed.
Malformed operational state uses the existing configuration-error family and
requires repair before a fresh attempt. Successful source assessment still
leaves CI, actual execution, Bugbot, Codecov and human approval independent.
English and Spanish recovery messages remain bundled; other locales retain the
existing complete fallback. Plain text, headings and concise rows remain usable
in narrow Checks/Summaries without color or hover-only meaning.

## 7. Testing budget and traceability

Minimum **60 distinct new cases**, excluding relocated existing scanner tests:

| Area | Minimum | Required behaviors |
|---|---:|---|
| Pure source ownership | 30 | Recognized/absent state; valid legacy fence; ordinary examples; before/after human lines; repeated text; CRLF; Unicode; complete raw bounds; invalid marker/JSON/version states. |
| Scope/schema contract | 6 | Complete human IDs, operational injection rejection, 32/33 required and excluded bounds, immutable source anchors. |
| Diagnostic/presentation | 12 | Safe exact counts, kind/limit/anchor validation, forged values, EN/ES/fallback and no raw prose. |
| Native/application integration | 12 | Single/multipart success, strict native schema, zero calls on invalid source, old state retention, full-body metadata races, fresh retry and genuine over-limit scope. |
| **Total** | **60** | Parameterized rows count once only for distinct behaviors. |

Use synthetic consumer-neutral fixtures, fake model outputs and actual strict
native response validation. No live inference or operating-system timing is an
acceptance oracle. Prove the source-ownership regression fails against the
baseline before fixing it; preserve pre-fix results separately. Run complete
Jest/extension coverage and enforced ledgers, build/package, types/lint,
architecture, documentation/specification validators and Graphify.

| Requirement | Evidence | Documentation |
|---|---|---|
| Account for all original source without operational promotion | Source-policy and complete human-ID schema regressions | Branch progress source ownership |
| Preserve full original guards and identity | Exact/one-over and before/after-span tests | Fixed source limits |
| Reject malformed/unknown state before querying | Pure and native zero-call tests | Configuration recovery |
| Keep real scope bounds and safe facts | 32/33 and closed diagnostic/presentation tests | Error reference and troubleshooting |
| Preserve prior progress and exact snapshots | Single/multipart rejection, state-only race and fresh-attempt integration | Retained-state semantics |
| Preserve persistence/API compatibility | Existing manager scanner/configuration suites plus re-export and type checks | Architecture and no user migration |

## 8. Documentation, rollout, rollback and DoD

Update the owning communication SDD, this companion, catalog paths and generated
index together. Document source ownership and unchanged bounds in branch progress,
closed count facts in the error reference, recovery in troubleshooting, and shared
scanner ownership for contributors. Run `validate:specifications` for each SDD/
catalog change and regenerate the catalog index after metadata changes.

Implement source/policy and failing regressions first, native flow/diagnostics
second, then documentation/catalog, generated bundles and full verification.
Normal PR rollout atomically adopts schemas, parsers, prompts and bundles.
Rollback restores the prior source/bundles; no stored state or progress-card
migration occurs. Existing assessments remain historical model estimates.

Completion requires all traceability rows, the risk-derived budget, full coverage,
no open findings, a complete current-head review and all applicable checks passing.
Codecov must report 100% modified coverable lines with zero partials against the
live correct base; a configured lower threshold is insufficient. Human protected
approval is a separate exact-head decision. Local passing tests alone do not
certify the dependent PR or authorize its merge.


Historical report provenance: the [complete original public incident reports](./evidence/issue-828-reports.txt)
retain all 21 captured reports, source identities, timestamps and byte hashes.
Repeated observations and reported consumer test counts remain historical data;
they do not count toward this change's test budget or independently prove live
model causality. Normative source ownership and acceptance remain in this SDD and
the issue. The existing shared comments are untouched; any concise replacement
requires explicit human permission and per-comment concurrency checks.

## 9. Selected and published maintainer drafts

[Issue #910](https://github.com/vypdev/copilot/issues/910) extends the Commit
source contract. The original source guards still cover the entire issue.
When it contains an SDD seed, Commit must verify the exact seed hash, issue
identity and maintainer selection against the Action-owned publication card.
The recorded SDD commit must belong to the linked branch and be an ancestor
of the assessed head. Its artifact hash and the SDD bytes at that head must
agree with the deterministic publication of the selected seed. An owner update
must preserve its original bytes. Commit rechecks publication authority and the
full issue snapshot before changing progress. An Action card that records a
published selected seed also prevents progress if the issue no longer contains
that seed.

```text
Issue and pinned head → verify selection and published bytes → classify unique scope
→ assess linked case evidence and complete comparison → recheck authority → progress
```

Commit classifies the candidate scope only after the issue and head are bound to
the verified publication. The explicit requirement rows are mandatory. Each
structured case row keeps its original physical line and scenario under the
requirements it covers. An exact restatement of a unique goal shares that
goal's identity. The classifier may associate an entire equivalent line with
a verified goal while preserving its exact text and origin. A line with an
independent obligation or uncertain equivalence keeps its own classification.
Exclusions retain their own classification. The unchanged bounds are 32
distinct required or uncertain clauses and 32 exclusions. The assessment
receives the verified publication identity, physical issue lines and linked
scenarios as source context. Every linked qualifier and scenario must be
accounted for when assessing its requirement.

| Commit state | Visible result and next step |
|---|---|
| Pending | Verifies the selected publication and the complete comparison. Existing progress remains available. |
| Selection or publication cannot be verified | `progress-sdd-seed-unverified` retains existing progress. Confirm the draft selection and SDD on the linked branch, then rerun Commit. |
| Assessment stops after source verification | Shows the existing scope or evidence diagnostic, including the first crossing original line for over-capacity scope. |
| Complete | Updates the existing progress result on the verified head. Case definitions remain scope evidence and CI execution is established independently. |

The existing SDD publication policy owns seed parsing, selection receipts,
table assembly and owner composition. Commit reads the complete native
comment inventory and the exact linked Git source through read capabilities.
It uses the shared Markdown table parser to locate requirement and case rows.
The existing diagnostics present the failure in English or Spanish with the
standard locale fallback. No new configuration or persisted state is needed.

| Regression budget | Minimum distinct cases | Evidence |
|---|---:|---|
| Scope and provenance | 6 | Original capture and case links, exact and interpreted repeats, draft-only requirement, ambiguous alias, 33 independent obligations |
| Commit and publication fences | 9 | Original head, missing selection, unpublished and unrelated commits, changed seed and issue, changed head artifact, current authority changes, ordinary scope |
| Presentation | 2 | Localized actionable recovery for missing publication evidence |

The original [Domus #30](https://github.com/vypdev/domus/issues/30) fixture
records 121 nonempty lines, including 8 operational lines and 97 inside the
seed, plus its two markers. In v3.10.8 the classifier received 113 lines and
the first hosted run classified 39 as required or uncertain. With the verified
amendment, Commit submits 99 candidates and attaches all 12 original case
rows to the 6 declared requirements. The deterministic replay provides a
complete simulated assessment on the recorded head. The hosted classification
and the simulated assessment are separate evidence.

[Domus #29](https://github.com/vypdev/domus/pull/29) also exceeded the clause
limit. Its issue supplied a prospective companion as fenced Markdown in
ordinary issue text. Its published card has no selected seed receipt. The
capture and publication evidence establish a different route and do not
establish the complete historical classifier result.

Verify the Commit replay, ownership controls, recovery messages, unchanged
boundaries, architecture, documentation, catalog and generated bundles before
review. The merge gate still requires complete modified-line coverage and
review on the current head.

## 10. Bounded batches and same-head requirement evidence — #916

The companion `specs/batched-progress-scope.md` extends the single-assessment
boundary with a fixed batch profile. Commit retains the original full issue
snapshot, configuration exclusion and selected published-seed authority. Every
required or uncertain obligation receives an ID derived from its physical source
line within the frozen snapshot. Batch size, response order and retries preserve
that identity. Source quotes, aliases, qualifiers and draft case references remain
in the host manifest.

Classification accounts for every human span in assignments of 32 lines. An
aggregate supports 256 obligations and 256 exclusions, with at most 32 obligations
per assessment. Every result cites an admitted native comparison source or unit
from the evaluated head. Manifest and receipt identities bind repository, issue
snapshot, owning PR, base, head and verified draft publication. Compatible duplicate
receipts converge. Missing or conflicting evidence, foreign identities, stale
authority and exhausted budgets retain prior progress before publication.

The complete Domus #23 / PR #29 fixture preserves the original body digest,
157-path inventory and immutable Git objects. Its deterministic candidate
classification has 108 obligations across four assessment batches. This is a
protocol replay. The historical model output is represented separately by its
logged 108-line rejection. Existing Domus #30 selected-seed, ordinary one-batch,
configuration and freshness regressions remain applicable.

The implementation evidence is in the batch policy, batch workflow and their
deterministic policy and Commit integration tests. Original source ownership
continues to govern every source and citation. The direct legacy parser retains
its 32-clause diagnostic for historical records and single-assessment callers.

Classification receipts bind their assigned span IDs to a source snapshot digest,
assignment identity and evaluated head. The final manifest retains the complete
classified span inventory in original source order. Every classification batch
receives complete human context, including published draft case qualifiers, while
its response schema owns only its assigned IDs. Requirement evidence cites an
admitted regular source observation. Generated metadata remains supplemental
comparison context. Source and receipt reordering preserve the aggregate identity.
