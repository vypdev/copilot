# Bugbot Recovery Contract and Retained Evidence Grounding

- Status: Ready for review — implemented candidate; remote acceptance pending
- Date: 2026-11-03
- Catalog capability: `bugbot-analysis-and-autofix`
- Owners: Copilot maintainers
- Scope: Ground cleanup findings in the actual retention, ownership and publication contract.
- Related issue: https://github.com/vypdev/copilot/issues/832
- Review gates: product/operator UX, architecture, security, testing, documentation
- Open readiness decisions: none; implementation acceptance requires the recorded quality and remote gates below.

## 1. Executive summary

Read the selected recovery contract before treating a retained directory as a
defect. Preserve required diagnostic or uncertain-publication evidence, existing
destinations and published output. Continue reporting missing required cleanup
of safely owned disposable staging and destructive deletion of retained output.

```text
changed failure path -> selected contract/tests -> ownership + publication
 -> reconcile applicable execution -> proved finding or unsupported claim omitted
```

Text equivalent: determine what output exists and what its owner requires before
recommending retention, deletion or retry. This does not authorize an operation.

## 2. Problem, behavior and evidence

The historical report misclassified deliberate snapshot retention despite an
explicit exact-head operator document and real-file regression. Its review was
partial; do not call it complete. Consumer execution is reported, not performed
here. Current SDK guidance already requires source/guard/framework grounding.
The ten-case current baseline has precision 0.50, recall 0.75 and F1 0.60; it invents
foreign-data loss on another configured path and overlooks an actual ownership
guard. The historic exact retention false positive is not reproduced by every
current sample. Separate causal false positives from category/anchor mismatches.
Six instruction-only variants fail at least one unchanged gate. The fifth
correctly decides all ten scenarios but misses one anchor; the sixth anchors all
four real defects yet returns two self-refuting informational notes. The fourth
also reproduces the historical owned-but-retained false positive. Retain every
failed sample. Guidance alone is insufficient acceptance evidence.

The first authored cohort also contained a genuine optional-lease fixture fault;
fix the fixture instead of treating the correct finding as a reviewer defect.
Record source-bound excerpts at their actual probe coordinates. Independently
verify already-published destination loss as well as partial-evidence loss.
Preserve every cohort, prediction and score before a corrected fresh campaign.
This is a prospective correction, not a reconstruction of historic motivation.

## 3. Actors, surfaces and terminology

Maintainers inspect PR findings, checks and run summaries; operators inspect
consumer output before deliberate cleanup. The reviewer proposes findings; it
does not own filesystem mutation. `retained partial`, `disposable staging`,
`published output` and `unknown/changed ownership` describe evidence, not new
persistent SDK states. A directory or manifest pathname alone proves no state.

## 4. Goals, non-goals and invariants

- MUST distinguish the selected retain/inspect and required-cleanup contracts.
- MUST preserve no-overwrite and truthful after-publication failure semantics.
- MUST reconcile exact-source contrary tests without inventing execution.
- MUST keep genuine disposable leaks and retained-output destruction reportable.
- MUST NOT add a regex suppression, filesystem executor, cleanup permission,
  public setting, approval waiver or relaxed budget.
- MUST independently adjudicate every candidate set for a supplied retained or
  assigned `.py` source block (case-insensitive path suffix), including source without generated literals.
- MUST keep candidate IDs/file/snippet, complete reject-or-retain accounting,
  source limits, locale checks and historical-resolution independence unchanged.
- Consumer migration/SQLite implementation and universal cleanup policy are out
  of scope; caller-specific requirements remain evidence, never authority.

## 5. Current and proposed journey

Current: infer cleanup from an error path, possibly overlooking recovery policy.
Proposed: inspect documentation/tests and the reached failure boundary, establish
ownership/publication, reconcile evidence, then report the violated contract or
omit a disproved hypothesis. Existing complete/partial/failed UI remains honest.

## 6. Behavior and state evidence

| Observed path | Required review behavior |
|---|---|
| Partial bundle retained by contract; retry refuses it | No missing-cleanup claim |
| Owned disposable pre-publication staging must be removed but remains | Keep proved required-cleanup finding |
| Complete publication followed by typed reporting failure | Preserve publication; no claim of no effect |
| Handler deletes completed or protected prior output | Keep proved data-loss finding |
| Ownership changed before handling | Inspect actual guard; no unconditional deletion recommendation |
| Policy/publication evidence unavailable | Omit unsupported mandate; preserve unresolved historical state |

Invocation, retries and stale results use existing review freshness/idempotency.
Omission is not historical resolution. A partial review cannot certify the PR.

## 7. Configuration

No new user configuration or override. Read effective repository requirements
and tests. These inputs cannot override trust, authorization or credential rules.
Absence of a policy does not select automatic deletion or universal retention.
All existing size, concurrency, schema and quality limits remain fixed.

## 8. Clean Architecture

One pure shared instruction supplies actual review, benchmark and the
existing independent candidate verifier. Application context/semantic ports,
provider adapters, state ownership, composition and publication remain unchanged.
Owned filesystem probes are test infrastructure, never a production dependency.

```text
review use case -> prompt builder/pure guidance -> existing read-only findings port
 -> normalization/freshness/eligibility -> existing publication and independent approval
```

Text equivalent: guidance changes reasoning, not execution or authority. Type,
port/dependency, schema, prompt-delivery and workflow contracts enforce boundaries.
The ordinary/partitioned prompt adds the specialized guide when its actual
`diffBlock` is nonempty. This is a derived internal source-presence profile, not
a public setting, filename heuristic or suppression. Empty workspace-only legacy
calls retain their existing general guard/contract guidance. The benchmark always
has a supplied source case; the existing independent verifier always has immutable
review context, so both receive the same guide. Applicability is extended from generated literal witnesses to supplied Python
source, using retained canonical paths or the actual assignment paths. A Python
path elsewhere in the PR does not activate an unrelated assignment. Ignored
paths and Python-looking prose do not select the profile. Existing literal-witness
activation remains a conservative fallback. Non-Python and empty legacy input
keep their prior verification behavior. The derived internal
`requiresCandidateVerification` value is not a public setting or content rule.
Shared `fillTemplate`, empty envelopes, nonempty normalization/escaping/caps and
all earlier guidance remain byte-identical. No payload is executed or interpreted
as a prompt template. Compatibility retains the existing empty-context long-ignore
fixture below 15,000 characters; this is not a new global limit for large source
reviews, which retain their existing independent source and partition budgets.

The independent verifier only checks proposed candidates and cannot create IDs,
change file/snippet identity or resolve/dismiss/reopen history. Empty candidate
sets cause no extra model request. The controlled benchmark explicitly requests
`en-US`, matching the existing verifier locale contract; an omitted/mismatched
locale still fails closed. The first pipeline trial exposed this tooling omission
and aborted; it has no completed prediction file or score and is not accepted. Existing limits remain: 200 initial candidates,
batches of 20, at most 10 batches, 32,000 candidate bytes per batch, 128,000 prompt
bytes and 4,000,000 serialized response bytes. Every candidate must occur once
as retained or rejected; malformed, duplicate, missing, stale or oversized proof
fails closed with no clean completed result. No truncation or silent candidate
loss is introduced. Source/primary queries and dependent verification share the
existing framed traffic/concurrency ledger; retries remain bounded. Large source
or historical context can exhaust this existing limit: inspect the failure and
split scope/recheck instead of weakening the bound. Execution/credential/network
permissions remain unchanged.

## 9. UI/UX content

Pending example: “Reviewing changed code — no action required.” Completed retained
case: no inline cleanup finding; normal review completion still depends on every
source/partition. Proved cleanup example: “Failed disposable staging blocks the
required retry,” anchored to the changed operation with contract/ownership proof.
Action-required example: “Inspect the preserved output before deliberate cleanup.”
Failed/partial example: “Review incomplete — retained context is not a clean result.”
After publication, describe completed output before explaining reporting failure.

No new card, locale, route, marker or notification is added. Existing localized
headings, links, sanitization, accessible plain text and bounded comment budget
remain applicable. Never publish a recommendation disguised as mutation approval.

## 10. Failure, recovery and cleanup

Keep unknown publication/ownership explicit; invent no successful import or run.
Preserve historical finding state unless its normal explicit resolution qualifies.
Incomplete/malformed candidate verification fails closed. Recovery uses the
existing recheck and upgrade process. Local owned test outputs may be retired
only after their observations, identities and current rollback are preserved.

## 11. Security and privacy

Every source, document, log and model response remains untrusted. Source policy
is counterevidence, not permission to delete, retain credentials or bypass a gate.
Optional native probes create only fresh owned nonsecret temporary data; they
never execute corpus-derived or consumer source. The lease example proves a
selected prior revocation, not a real lock or atomic-race guarantee.

## 12. Observability

Preserve complete/partial/failed outcome, exact head/base, source omissions and
partition receipts. Controlled campaign evidence records immutable inputs,
native probe identities, runtime, predictions and every score, including failures.
Core source/bundle hashes are not a captured full provider stdin or statistical
accuracy guarantee. No new production metric or noisy progress comment is needed.

## 13. Compatibility and rollout

No schema, state or setting migration. Source-bound Python reviews with nonempty
candidate sets now incur the existing independent adjudication queries; empty
sets incur none. Latency/provider use grows within the existing bounded batches
and framed traffic ledger, never through an unbounded retry or credential grant. Adoption follows the later SDK release;
merge to develop alone does not update installed consumers. Rollback reverts
guidance, tests and docs together without rewriting historical review records.
Preserve the 15,000-character long-ignore compatibility test and real field caps.

## 14. Test budget

Reserve **56 distinct deterministic cases**, derived from the selected risks:

| Area | Minimum | Purpose |
|---|---:|---|
| Frozen family inventory | 1 | Ten source/contract scenarios, four real defects |
| Exact source/coordinate binding | 10 | Probe function/changed line match every excerpt |
| Native-record consistency | 10 | Bind actual observations without presenting them as CI execution |
| Scorer counter-controls | 10 | Penalize false positives and missed real faults with unchanged floors |
| Actual delivery | 5 | Ordinary, owner/non-owner partitions, benchmark and existing verifier |
| Private-label isolation | 1 | Verdicts, replacements and executable driver never enter agent input |
| Native source identity | 1 | Changed probe requires new independent observations |
| Prior corpus preservation | 1 | All 152 earlier inputs/references remain identical |
| Derived source-presence profile | 4 | Missing, empty, whitespace and control input retain exact legacy framing/global trust |
| Python verification applicability | 8 | Canonical/assigned identity, other languages, ignores, absent and control input |
| Actual adjudication integration | 4 | Ordinary, legacy partition and framed reject/retain paths without literals |
| Exact benchmark locale | 1 | Require the same en-US metadata as existing adjudication; never bypass validation |
| **Total** | **56** | Each parameter row is a distinct behavioral case |

Git MUST preserve LF for the byte-bound owned probe through its exact
`.gitattributes` entry. A separately executed owned Git checkout with
`core.autocrlf=true` reproduces CRLF/hash mismatch before that entry and retains
the original measured bytes afterward; the hash check is not normalized or weakened.

Optional CPython3.14 fixed owned executions are separately recorded; mandatory
Node CI adds no Python requirement. Publish no claim that reference predictions
are real model output. Keep global/module coverage, all modified lines hit,
normal hooks, package/build/type/lint, specs/docs/workflow checks, Graphify,
current-head native platforms, complete review and official Codecov with no
modified misses/partials against the actual base. Human browser UX is inapplicable.

## 15. Documentation

Update detection (normal contracts), quality/observability (methods and limits),
this companion and the existing owner crosslink/catalog/index. Explain real
leaks, retained evidence, retry/no-overwrite and after-publication recovery.
Keep setup/config docs unchanged with this explicit no-new-input rationale.

## 16. Acceptance

The ten frozen scenarios must retain all requirements in section6. No transient
green job or missing exception cleanup alone certifies a defect. Unknown source
must not become a destructive suggestion or a completed clean review. Case
material, private labels and expected replacements cannot become executable input.
All prior unrelated findings and normal review/approval gates remain effective.

## 17. Traceability

Contract/ownership/publication -> shared guidance -> frozen cases/native source
binding/scorer controls -> detection docs. Delivery/trust/caps -> prompt builder
and existing verifier -> real delivery/source-presence tests -> this architecture section.
Evidence/calibration -> actual campaign/probe receipts -> observability docs.

## 18. Implementation sequence

Freeze and validate owned controls; measure current baseline; select bounded
guidance/composition; test delivery and privacy; measure candidate without changing
inputs or floors; update catalog/docs and generated artifacts; run full local and
remote acceptance; obtain any protected-path human decision required by the check.

## 19. Definition of Done

All requirements are traced; architecture/configuration/trust remain bounded;
numeric budget and applicable coverage pass; actual model observations and their
limits are recorded; docs/catalog/index and validation agree; complete current-head
checks/review/Codecov pass; no material decision remains open. Native probes do
not imply consumer execution, live deployment or crash/race safety.

## 20. References and decisions

- Incident and original additional context: https://github.com/vypdev/copilot/issues/832
- Owning baseline: specs/bugbot-analysis-publication-and-autofix.md
- Primary filesystem contracts: https://docs.python.org/3.14/library/pathlib.html#pathlib.Path.mkdir
  and https://docs.python.org/3.14/library/shutil.html#shutil.rmtree
- Caller-defined retention policy is distinct from these library operations.
- Initial cohorts and fixture corrections remain preserved; current v3 is frozen
  before production guidance changes. Selected after six failed guidance-only experiments: shared recovery grounding
plus existing independent adjudication for supplied Python source. Legacy framing
and every source/case/reference/floor remain unchanged. The original two complete CLI trials remain individually failed and are never
replaced by a best sample. A fixed five-trial repeatability cohort includes both
failures plus exactly three further trials predefined before execution. Its 50
cases/20 positive controls use the unmodified aggregate scorer/floors with case
IDs namespaced per trial, without cross-trial matching, omitted cases or altered
expectations. Publish every individual result and the aggregate. The separately
instrumented diagnostic is excluded from acceptance scoring. This change in
measurement plan addresses the coarse four-positive sample resolution; it does
not claim every individual trial passes or statistical population accuracy. Other languages retain existing verification
applicability; this change is not a universal verifier rollout.


### Recorded repeatability outcome

The fixed five-trial CLI cohort completes all 50 source cases, with zero false
positives and 19/20 real defects detected. Aggregate precision is 1.0, recall 0.95,
F1 0.9744 and exact location 17/19 (0.8947); severity/category accuracy is 1.0.
The original unchanged aggregate gate passes. The first two trials remain
individually failed (location and one omission); all three additional predefined
trials pass individually. This is neither 50/50 perfect decisions nor a guarantee
for every model draw. The separately observed diagnostic is not pooled into the
acceptance score. All raw predictions and failed experiments remain in the
source-bound evidence record.
