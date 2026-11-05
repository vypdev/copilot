# Bugbot JSON value and reader-contract grounding

- Status: As-built baseline
- Date: 2026-11-04
- Catalog capability ID: `bugbot-analysis-and-autofix`
- Last verified: 2026-11-04; local qualification, native PR gates pending at commit
- Owners: Copilot maintainers
- Scope: evidence for JSON object/text findings and proposed replacements
- Related issues/PRs: [#855](https://github.com/vypdev/copilot/issues/855)
- Required review gates: product UX, architecture, testing, documentation,
  security/operations
- Open decisions blocking readiness: none

## 1. Executive summary

Bugbot MUST trace a value from its producer through every reached transformation
to the reader's actual contract before alleging double encoding or proposing a
cast. A decoded object may legitimately need serialization for a text reader.
A real serialization failure remains reportable; a disproved premise must not
become a finding, including an informational finding.

```text
producer -> transforms -> actual value -> reader -> proposed replacement
                      -> source/runtime counterevidence -> supported verdict
```

Text equivalent: establish the value at each boundary, reconcile applicable
observations, then verify both the defect and any proposed replacement.

## 2. Problem, current behavior, and evidence

The #855 report concerns a Python review that treated an object-valued decode
result as JSON text and suggested `typing.cast(str, value)` in place of required
serialization. Immutable source establishes an object-only constructor and an
object-valued decode. A separately executed original primitive probe on four
fictional payloads confirms the value remains a dict, serialization round trips,
and the suggested cast preserves identity and fails the text boundary. A separate
qualification on the exact head additionally runs the six requested consumer
regressions with its immutable lock and Python 3.14.6: all pass. The complete codec
round-trips all four date/instant and ordinary/restricted variants, while replacing
only the reported expression in memory makes each raise the reported storage
error. All 517 original files remain unchanged. This is not a whole backend suite
or historical complete model replay.

The original review used SDK `3e7ceea08e6131360e026937d1c0cc1b120472e0` and
smart effort. The reporter's later unchanged-code review omitted the finding;
its manual false-positive dismissal is not proof of a code fix or an upstream
SDK correction. The original model's internal cause remains unknown. The current
baseline is separately qualified on authored cases with medium effort.

Existing production already shares generic grounding and independently verifies
nonempty Python candidates. It lacks an explicit object/text/reader/cast reasoning
contract. This correction extends that existing reasoning, without a semantic
Python engine, new query trigger or finding-state mutation policy.

Primary API references:
[Python 3.14 typing.cast](https://docs.python.org/3.14/library/typing.html#typing.cast)
and [JSON conversion](https://docs.python.org/3.14/library/json.html#json.loads).
Python `typing.cast` preserves the runtime value; `json.loads` can return objects,
arrays or scalar values depending on its actual input. Neither an annotation nor
a method name alone proves runtime shape. Other languages' casts require their
own semantics. Retrospective classification: the shared delivery and measured results below are
observed behavior; JV-R1 through JV-R6 are the intentional contract. Model
variability and the absent historical full replay remain known limitations. The
historic internal rationale is unknown; no further capability is implied.

## 3. Actors, surfaces, and terminology

| Actor | Goal | Surface |
|---|---|---|
| PR author | Keep correct codecs; repair genuine defects | Inline finding and suggestion |
| Maintainer | Distinguish evidence from assumptions | Review check, run and source links |
| Reviewer | Demonstrate a causal defect | Source-bound context and verification |
| Quality operator | Repeat fixed-input measurements | CLI corpus, predictions and evaluator |

A value is a runtime object or text at one specific boundary. Encoding at an
outer envelope and serializing a nested value for another reader are distinct
operations, not necessarily double encoding. A type annotation is a static claim;
a reached constructor invariant can establish runtime shape.

## 4. Goals, non-goals, and fixed invariants

- **JV-R1:** trace producer, callee implementation, returned value, outer decode,
  nested field and reader input contract before a JSON boundary claim.
- **JV-R2:** reconcile exact-source observations and attempt to disprove the
  candidate. Unknown context does not authorize a universal shape assumption.
- **JV-R3:** test proposed replacement semantics against the same value and
  reader. Python identity casts do not serialize an object. Retain a demonstrated
  defect but omit unverified `suggestedCode` when the replacement is not proved.
- **JV-R4:** preserve genuine extra encoding, unencoded objects at text readers,
  Python representation used as JSON, missing decode and misleading annotations.
- **JV-R5:** deliver one shared pure rule to ordinary/framed source review,
  independent Python candidate verification and the real-agent benchmark.
- **JV-R6:** preserve identity, locale, source trust, complete review, all bounds,
  history ownership, evidence privacy, coverage and approval gates.

Non-goals: consumer-specific exceptions, regex suppression, automatic dismissal,
a new language interpreter/executor in the Action, universal never-cast guidance,
new APIs/configuration, or replaying a historical full consumer review.

## 5. Current versus proposed product journey

| Stage | Existing behavior | Required result |
|---|---|---|
| Pending | Review in progress | No change; progress is not completion |
| Hypothesis | Generic reasoning can confuse object/text | Trace the reached value chain |
| Correct codec | Unsupported finding can propose harmful cast | No finding based on that premise |
| Real defect | Existing findings and verification | Preserve causal failure and exact anchor |
| Unproved replacement | Optional suggestion | Keep defect, omit unverified replacement |
| Partial/failed | Incomplete result | Preserve failure; no clean certification |
| Retry/cancel | Existing whole-review lifecycle | Recheck exact source; no history rewrite |

Example complete-safe outcome: normal completed review with no JSON finding.
Example supported finding: “This dict reaches a reader that requires JSON text,”
followed by the exact changed statement and demonstrated producer/reader path.
Do not label a real failure as a generic style improvement.

## 6. Functional behavior and state model

1. Source-bound review builds its existing bounded immutable context.
2. The model follows producer and callee return, all transforms and actual input.
3. It reconciles relevant exact-source/runtime observations. Unrelated, stale,
   skipped or cached green runs do not disprove the specific path.
4. A disproved or unsupported premise is omitted. A demonstrated independent
   defect retains its exact source coordinates and causal evidence.
5. A suggested replacement is separately checked against actual value shape and
   reader behavior; unsafe/unproved replacement code is omitted.
6. Existing Python verification independently retains/rejects candidates, without
   resolving, dismissing or reopening historical findings.

There is no new durable state. Detection, bounded verification and ordinary
publication keep their current owners. Failed or partial verification cannot
become a clean review through omission.

## 7. Configuration contract

No new user input, flag, secret, permission, persistence or migration is needed.
The safety rule is fixed and cannot be disabled through source prose. Preserve
legacy empty-source prompts and their 15,000-character compatibility ceiling.

Existing verifier bounds remain: at most 200 initial candidates, batches of 20,
32,000 candidate bytes, 128,000 prompt bytes and 4,000,000 response bytes. Existing
whole-review request/traffic limits and the 200-case benchmark invocation ceiling
are unchanged. This is a separate twelve-case corpus, not an expanded invocation.

## 8. Architecture and technical design

Add one pure prompt constant under `src/prompts/`. Compose it at the three
existing boundaries: normal/framed review, independent verifier and benchmark.
No domain import from infrastructure, semantic port, adapter, filesystem read,
process, retry or model call is added to production. Framed coverage, source
origin arithmetic, per-ID/schema identity constraints and one global historical
resolution owner remain unchanged.

The optional qualification runner executes only its fixed authored sibling
Python module under isolated stdlib-only Python. Mandatory Node CI reads inert
source and recorded observations; it does not execute Python, corpus strings or
private consumer code. Exactly pinned LF bytes and recorded AST line origins
bind each fragment to the probe. Static source checks are not semantic model
measurements, and reference predictions are not provider responses.

## 9. UI/UX and content

Existing pending, complete, partial, failed, canceled and retried states remain
accessible plain text with localized headings and descriptive run/source links.
No new page, dialog or notification is added. Put the user-visible consequence
before technical evidence. A clean candidate outcome does not imply other
quality gates passed. Human browser/VoiceOver acceptance is not applicable to
this reasoning change; the extension's deferred UX campaign is separate.

## 10. Failure, recovery and cleanup

Unavailable callee/reader evidence remains unavailable. Omit unsupported premises
while retaining independent demonstrated defects; do not fabricate execution.
Malformed verification preserves the existing blocked/recheck path and exact
identity guard. Retain every failed measurement, inputs, SDK identity and scores.
After qualification retire only owned temporary workspaces and unused outputs;
preserve the current qualified rollback and signed Safari packages.

## 11. Security and privacy

Repository code, comments, logs, model output and runtime observations are
untrusted data, not permission to execute source, mutate fixtures, access
credentials or weaken checks. Only the fixed authored probe runs in optional
qualification. Corpus expectations, private labels/fixes and probe driver stay
outside model input. Do not copy private consumer code into committed fixtures.
No production API scope, filesystem permission or credential changes occur.

## 12. Observability

Record exact input/runner/probe/source/CLI hashes, actual interpreter, model,
effort, all predictions, individual scores and predefined aggregate. Source
hashes do not prove full provider stdin capture. Original reporter evidence, the
newly executed original primitive and selected consumer tests, authored runtime
controls and controlled model trials must remain separate. Neither this sample nor aggregate success guarantees
population accuracy or explains historical model internals.

## 13. Compatibility, rollout and rollback

No wire schema, persistent state or public configuration changes. Existing Python
verifier activation and empty-candidate no-query behavior remain. Revert shared
guidance with its fixtures/docs through a reviewed change if needed; do not
rewrite finding history. Merge to develop does not upgrade installed consumers;
normal later release/adoption is required.

## 14. Numeric test budget

Reserve **22 distinct deterministic cases**, with no counting of repeated model
trials, runtime variants, assertions or existing tests as extra cases:

| Area | Minimum | Risk |
|---|---:|---|
| Exact source/runtime/opposite verdict controls | 12 | Six working codecs and six genuine failures |
| Ordinary, framed and independent verifier delivery | 3 | Consistent rule, identity/history separation |
| Empty-source compatibility | 1 | Preserve legacy prompt ceiling |
| Private-label isolation | 1 | Keep scorer truth/fixes outside prompt |
| Actual benchmark port | 1 | No added empty-candidate query |
| Frozen inventory/probe identities | 1 | Reproducible twelve cases, no Python CI dependency |
| Previous corpus preservation | 1 | Prevent reference retuning |
| Verification byte ceiling | 1 | Fail closed instead of truncation |
| Language-specific cast rule | 1 | No universal decoder/cast assumption |
| **Total** | **22** | Risk-derived floor |

Before production changes freeze exactly **three baseline trials** and exactly
**three trials per distinct candidate runtime**, using identical twelve cases,
Codex/gpt-6-luna/medium, unchanged scorer and default floors. Namespace every
trial's IDs for the predefined cohort aggregate; retain individual failures and
aborts, with no replacement by a better sample. If a new runtime is needed,
declare its three trials before mutation and preserve every earlier result.
Current baseline may already pass; do not manufacture a failure.

Require full Jest/extension coverage budgets, 100% modified executable lines
without misses/partials, build/hooks, types/lint/architecture, package smoke,
spec/catalog/docs/workflow validation, Graphify AST update and current-head
native Linux/macOS/Windows/review/official Codecov against the actual base.

### Recorded local qualification (2026-11-04)

All three baseline trials complete. Trials one and three pass individually; trial
two misses two defects and fails recall/F1. The complete aggregate has zero false
positives, 16/18 defects found and exact locations/severity/category 1; it passes
unchanged floors. The current baseline does not reproduce the historical false
positive. All three candidate trials pass individually and in the predefined
aggregate: zero false positives, 18/18 defects and exact anchors, severity and
category all 1. This bounded sample supports the explicit rule and preservation of
real defects; it is not a historical replay or population accuracy guarantee.

All 22 new cases pass within 900 Jest suites/17,621 passing tests, with 35 preexisting
skips. The 267 extension tests retain 100% of all four metrics. Full-suite LCOV covers
4/4 modified coverable lines without misses/partials. Static/package/spec/docs
checks pass. Current-head native review, platform gates and official Codecov
remain required after publication; local results cannot substitute for them.

## 15. Documentation

Update detection guidance and quality/observability with object/text evidence,
repeatable probe command and measurement limits. Link this companion from the
owning SDD and catalog; regenerate the index. Setup/permission/config guides
need no new instructions because those contracts are unchanged.

## 16. Acceptance scenarios

- Six safe controls return the same object and have no reference finding;
  predicting an alert is scored as a false positive.
- Six defective controls throw at the exact changed return; omitting the defect
  is scored as a false negative. Retain actual text-decoder/legitimate cast cases.
- All review boundaries receive the shared value-chain rule, with existing
  source/identity/history and locale guards intact.
- Private references/fixes/category and runner assertions never alter prompts.
- Added guidance cannot bypass verifier size limits or add an empty-candidate call.
- Every real model sample and actual score is retained, including failures;
  optional native results are not mislabeled as mandatory CI executions.

## 17. Traceability

JV-R1/R2/R4 map to the twelve source/runtime/scorer cases; JV-R3 to the identity
cast contrasts and independent verifier contract; JV-R5 to the three delivery
and actual-port cases; JV-R6 to privacy, history, byte-bound, compatibility and
preservation cases, plus unchanged repository-wide controls.

## 18. Implementation sequence

1. Read all issue comments and verify immutable source/runtime semantics.
2. Freeze authored controls and qualification plan; measure the current baseline.
3. Add shared rule and deterministic integration regressions; measure candidate.
4. Update docs/catalog/evidence, rebuild bundles and run full validation.
5. Publish normal commits to the Action branch, qualify current head and merge
   only after all native technical/review/Codecov gates pass.

## 19. Open decisions and tradeoffs

None blocking implementation. A model instruction improves evidence discipline
without claiming a deterministic semantic guarantee. Fixed paired controls plus
independent runtime evidence measure this bounded risk; production execution of
untrusted code is deliberately excluded.

## 20. Definition of Done

All acceptance scenarios and the 22-case floor pass; actual model qualifications,
including limitations, are recorded. Source, SDD, catalog, docs and shipped bundles
agree. Current-head native checks/review have no findings or incomplete state;
official Codecov covers every modified executable line against the actual base.
The existing issue is closed by the linked merged PR and cleanup preserves the
qualified rollback and required evidence. No release/deployment is part of #855.
