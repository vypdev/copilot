# Bugbot Fixture Values and Assertion Grounding

- Status: Implemented contract — release adoption pending
- Date: 2026-11-03
- Catalog capability: `bugbot-analysis-and-autofix`
- Owners: Copilot maintainers
- Scope: Trace actual helper values, path roots and query results before reporting broken tests.
- Issue: https://github.com/vypdev/copilot/issues/834
- Review gates: architecture, security, testing, documentation and operator UX
- Open design decisions: none; acceptance remains subject to the gates below.

## 1. Executive summary

A variable or pathname does not establish its value or type. Follow the helper,
constructor and actual assertion. Keep genuine wrong assertions reportable.

```text
changed assertion -> fixture/helper -> stored values + reached operation
 -> reconcile source-bound observations -> proved finding or omit disproved claim
```

Text equivalent: establish the actual result before recommending an expectation
change. Anchor a proved defect in the supplied changed fragment, independently
of the line count of separately supplied helper context.

## 2. Problem, current behavior and evidence

The historical complete consumer review treated a database filename as a source
directory and a variable named `a` as a stored ID of `a`. The report cites the
exact consumer revision and successful runtime tests. These are reported consumer
observations, not new executions performed by this correction.

The current approved SDK already includes general source grounding and independent
adjudication for supplied Python candidates. The first frozen twelve-case
measurement produces no false positive, misses one real assertion contradiction
and anchors only one of five detected faults correctly. Retain that failed
measurement and all subsequent planned trials. Historic motivation is unknown;
this is a prospective bounded correction, not an as-built justification.

## 3. Actors, surfaces and terms

Maintainers inspect review findings, checks and run summaries. Helpers return
values; constructors determine stored paths/fields; queries determine actual
ordering and filters. Variable names and test titles supply no data identity.
The reviewer proposes findings and never owns test or filesystem mutation.

## 4. Goals, limits and fixed invariants

- MUST trace helper defaults, explicit overrides and constructor assignments.
- MUST distinguish a database file, its parent root and a destination using the
  actual containment guard, including an owned-installation marker.
- MUST evaluate stored IDs under the actual SQL comparator/direction, limit,
  expiry boundary and terminal-state filter before judging an assertion.
- MUST reconcile applicable same-source runtime observations without inventing
  execution; unrelated, skipped or stale green tests prove nothing.
- MUST preserve genuine assertion contradictions and omit disproved claims,
  including informational claims that explain why correct code works.
- MUST count the changed fragment from its stated origin; separately supplied
  helper/context lines MUST NOT shift its finding anchor.
- MUST preserve source limits, candidate identity, closed adjudication, historical
  resolution eligibility, authorization and quality/coverage thresholds.

Consumer test edits, execution of supplied source, generic SQL interpretation,
filesystem mutation and a universal green-CI suppression are out of scope.

## 5. Product journey

Current: infer a directory/record value from a name and recommend breaking an
otherwise correct assertion. Proposed: trace the helper and reached operation,
compare observed values to the changed assertion, then omit the unsupported
claim or publish the independently proved failure at the actual changed line.
An omitted new candidate does not resolve a historic finding.

## 6. Behavior and state

| Evidence | Required result |
|---|---|
| `store.path` is `tmp_path/database`, a file | Containment root is the actual parent `tmp_path` |
| Database is `tmp_path/database/state.sqlite` | Root is `tmp_path/database`; its peer is outside |
| Default request ID is `request`, second ID is `b`, ASC | Compare `b, request`, regardless of variable names |
| Explicit first ID `a`, ASC | Compare `a, b`; do not reuse the other fixture's result |
| DESC, limit or exclusion guards differ | Recompute this invocation, not another case |
| New assertion contradicts those reached values | Keep a medium correctness finding on the changed assertion |
| Required helper/runtime evidence unavailable | Omit an unsupported always-fails claim; do not invent a helper |

Existing pending/complete/partial/failed state, live-source freshness and replay
ownership remain unchanged. A candidate-verification failure cannot certify clean.

## 7. Configuration

No new public setting, model override or data migration. Normal recommendation: keep
the existing review configuration and supply complete pinned source. A bounded
alternative is the existing narrower review/recheck when source limits block.
Neither permits changing correctness, coverage, identity or permission rules.

## 8. Clean Architecture

The pure shared prompt module owns the reasoning rule. Ordinary/partitioned
source-bound prompts, the real benchmark and the existing independent verifier
consume it. Application ports, provider adapters, publication/state ownership and
composition remain unchanged. Source-presence selection preserves legacy empty
prompt framing and its existing 15,000-character compatibility test.

```text
review use case -> pure shared prompt -> read-only findings port
 -> existing candidate verification -> freshness/eligibility -> atomic publication
```

Text equivalent: guidance supplies reasoning, never execution or approval power.
The existing type/dependency/port and prompt-delivery tests enforce this boundary.
Optional native probes are test infrastructure, not an application dependency.

The independent verifier presents candidate hypotheses before immutable source,
then requests source-origin/offset arithmetic alongside causal evidence. Earlier
candidate coordinates remain untrusted. This is presentation and reasoning,
not an automatic anchor rewrite, new query, parser, identity change or executor.

Verification response fields stay unchanged. The existing schema enumerates
only original batch file values (including null for an absent file). If every
original candidate has a snippet, it also enumerates the exact existing snippet
strings, including indentation/diff markers. If any candidate omitted a snippet,
retain the existing unconstrained optional-anchor enrichment contract. Deduplicate
values without dropping candidates. These batch-level sets do not establish
per-ID binding: the existing application identity/complete-accounting guard MUST
still reject cross-candidate swaps, unknown identities or changed known snippets.
All current candidate/schema/prompt/response/traffic bounds remain in force;
schema values come only from the already bounded batch, never private verdicts.

## 9. UI/UX and content

Representative existing states: pending, “Reviewing changed code — no action
required”; complete safe case, normal completed review with no fixture finding;
proved defect, “The assertion expects a different order from the stored IDs”
with the exact changed assertion and helper chain; action required, inspect the
linked assertion/source before changing it; failed/partial, “Review incomplete —
no clean result was verified; inspect the run and recheck the complete source.”

No new card, route, label, command, notification or locale is added. Preserve
existing accessible plain text, localized headings, sanitization, descriptive
source/run links and bounded publication budget. Technical evidence belongs
after the user-visible consequence. Human browser UX is not applicable.

## 10. Failure, recovery and cleanup

Missing context is unavailable evidence, not a clean result. A failed/malformed
verification preserves the existing failure and recheck path, with no partial
publication or historical dismissal. Keep frozen inputs, all actual predictions,
scores and SDK/runtime identities, including failures. Retire only owned unused
scratch outputs after retaining evidence and the current approved rollback.

## 11. Security and privacy

Source, logs, observations and model output are untrusted data, never permission
to mutate tests, run fixtures, read credentials or weaken a gate. The optional
fixed Python probe creates fresh private temporary SQLite files and executes only
authored functions; it never evaluates corpus or consumer source. Private
expected verdicts, fixes, assertion-pass labels and the probe driver MUST stay
out of model input. Numeric data observations are independently measured facts.

## 12. Observability

Preserve exact base/head, completeness and ordinary review telemetry. Measurements
record frozen source bytes, interpreter/SQLite/SDK identity, predictions, every
individual score and the predefined aggregate. References are deterministic
scorer controls, not actual model responses. Hashes alone do not capture full
provider stdin. This sample is not a population accuracy guarantee.

## 13. Compatibility, rollout and rollback

No durable state or public configuration changes. Verification wire fields stay
the same; known identity values receive the narrower constraints in section 8. The existing Python
verifier activation, identity accounting, source/response limits and traffic
ledger stay unchanged. Empty candidates add no call. SDK adoption follows a later
release; merge to develop does not update installed consumers. Roll back guidance,
fixtures and docs together without rewriting review history.

## 14. Numeric test budget

Reserve **51 distinct deterministic cases** derived from six contrasting pairs
and the independently observed snippet-normalization rejection:

| Area | Minimum | Risk |
|---|---:|---|
| Frozen inventory | 1 | Twelve cases; six genuine assertion failures |
| Exact source and changed coordinates | 12 | Full helpers, actual origins and private-label isolation |
| Independent native-record consistency | 12 | File/parent, ASC/DESC/overrides/limit/expiry/state |
| Opposite-verdict scorer controls | 12 | Penalize both false positives and missed real defects |
| Actual prompt delivery | 3 | Ordinary, benchmark and independent adjudication |
| Input privacy | 1 | No expected verdict, fix or native driver in agent input |
| Probe identity | 1 | Exact LF bytes and separately observed runtime |
| Prior corpus preservation | 1 | All 162 previous inputs/references unchanged |
| Schema and actual-port compatibility | 8 | Diff marker/indentation identity, allowed files, deduplication, absent-file/anchor compatibility, cross-ID rejection and precise-anchor enrichment |
| **Total** | **51** | No double counting |

The probe's exact `.gitattributes` LF entry preserves byte binding on Windows.
Mandatory Node CI reads recorded observations and source identity; it adds no
Python prerequisite. Keep all global/module budgets and 100% modified executable
lines without misses/partials. Test-only evidence is not an executable coverage
denominator. Keep normal build/hooks, types/lint/package, docs/spec/workflow
checks, Graphify and actual current-head native Linux/macOS/Windows validation.

Before any production change, freeze exactly three complete baseline trials.
If a runtime change is necessary, measure exactly three candidate trials with
identical twelve-case inputs and unchanged floors. Aggregate all trials by
namespacing case IDs, without cross-trial matching or sample selection. Preserve
individual failures; no extra trial may silently replace one. Any changed plan
requires explicit documentation before executing it, preserving old outcomes.

The first candidate's predefined cohort fails the unchanged location gate.
Retain all three trials. A second distinct candidate changes verifier ordering
and requests explicit origin/offset evidence; its exactly three additional trials
were declared before that change. They use the identical frozen corpus/model and
floors. Do not pool or select among different candidate runtimes to claim a pass.

Two v2 CLI attempts abort without a completed prediction file; neither is scored
as clean or silently replaced. The third completes all twelve cases and passes
every gate, but does not certify the failed cohort. A separate real-port
diagnostic records an initial `+`-prefixed snippet and a verifier response that
strips that marker; the unchanged application guard correctly rejects it. The
original two aborted responses were not captured, so their exact violated field
is unknown. A third distinct candidate adds schema-level identity constraints
and explicit verbatim guidance. Its three normal CLI trials are separately fixed
in advance on the same source cases/model/floors. Diagnostic runs are excluded.

## 15. Documentation

Update detection guidance, quality/observability methods and limits, the owning
SDD crosslink, catalog evidence and generated index together. Existing setup,
permissions, config and operations instructions remain valid because no new
input, execution capability or recovery transition is introduced.

## 16. Acceptance

The twelve frozen cases retain the outcomes in section 6. Both historical
mechanics produce no unsupported failure claim; the six real contradictions
remain detectable. Model output and exact anchors pass the unchanged aggregate
quality gates. All model failures remain visible and independent consumer CI is
reported with correct provenance. Complete current-head review has no open
findings/threads; all applicable technical checks and official Codecov show no
modified miss/partial against the actual base before a normal authorized merge.

## 17. Traceability

Values/root/order/coordinates -> shared prompt -> twelve frozen source cases,
native bindings and opposite-verdict controls -> detection docs. Trust/delivery
-> real ordinary/benchmark/verifier builders -> three delivery and privacy
tests -> architecture/security sections. Evidence -> fixed plan and every actual
result -> versioned issue evidence -> quality/observability docs.

## 18. Implementation sequence

Freeze helpers/controls and native observations; measure approved baseline;
apply only necessary shared guidance; verify real delivery and privacy;
measure candidate on unchanged inputs; update docs/catalog and generated files;
run local and remote gates; merge normally under effective repository rules.

## 19. Definition of Done

Every normative requirement is traced; all 51 tests and unchanged budgets pass;
actual observations and limits are published honestly; architecture, trust,
configuration and history controls remain intact; docs/catalog agree and validate;
Graphify is current; current-head checks/review/Codecov pass with no finding,
miss or partial; no material design question remains open. A neutral advisory
bot approval is not a fabricated native approval or a waiver of an effective rule.

## 20. References and decisions

- Incident and source/runtime references: https://github.com/vypdev/copilot/issues/834
- Owning SDD: [analysis/publication/autofix](./bugbot-analysis-publication-and-autofix.md)
- Existing verifier: [recovery/source grounding](./bugbot-recovery-contract-grounding.md)
- Frozen evidence: `quality/bugbot/evidence/issue-834.json`
- No suppression by test name, variable name, pathname or green-job status.

### Recorded final repeatability outcome

The predefined v3 cohort completes 36 source cases and passes all unchanged
aggregate floors: precision 16/17 (0.9412), recall 16/18 (0.8889), F1 0.9143, exact
location 14/16 (0.875), severity/category 1.0 and Brier 0.0588. All 18 safe-case
outputs are empty. Real controls yield 17 findings for 18 expected instances,
with one actual omission and three inaccurate anchors. One far anchor becomes
a scorer FP/FN pair; the other two affect exact-location accuracy. The first
and third individual trials fail at least one floor; retain them unchanged.
This is not 36/36 perfect results, a population estimate or a claim that every
model draw passes. Earlier failed/incomplete candidates and separate diagnostic
responses remain in the source-bound evidence; they are not pooled into the
accepted cohort. Current-head remote review/checks/Codecov remain independent
merge gates.
