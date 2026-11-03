# Bugbot Complete Statements and Asynchronous Ordering Evidence

- Status: Implemented contract — full technical acceptance and release adoption pending
- Date: 2026-11-03
- Catalog capability ID: `bugbot-analysis-and-autofix`
- Owners: Copilot maintainers
- Scope: Read actual statement order and lifecycle completion before reporting a missing wait.
- Issue: https://github.com/vypdev/copilot/issues/848
- Required review gates: architecture, security, testing, documentation and operator UX
- Open decisions blocking contract readiness: none; measured quality and technical acceptance remain required below.

## 1. Executive summary

A semicolon separates statements even when both appear on one line. Bugbot must
trace the actual wait and its owner before proposing a missing-await fix. It must
also preserve proved unfinished-update defects instead of treating any await as
sufficient.

```text
complete source statements -> receiver/promise/caller -> required lifecycle effect
 -> exact-source counterevidence -> supported finding or omit disproved candidate
```

Text equivalent: establish which work must complete, which wait covers it and
which next operation can overtake it. A completed safe review is independent of
the other CI, coverage and approval gates.

## 2. Problem, current behavior and evidence

The report identifies Domus PR 15 at `ecdd85b4b08479eede41a517f9acdfdde9393b17`.
Its lines176–177 each assign a view and then await that element's update on the
same line. The missing-await premise is false. The original reviewer runtime was
`3e7ceea08e6131360e026937d1c0cc1b120472e0`, not this change's baseline.

Fresh execution of the unchanged original case passes one selected test, with
54 cases not selected; fresh complete frontend execution passes 11 files and
565 cases with all four coverage metrics at 100%. All 52 selected source blobs
remain unchanged. Independently fetched historical native job124918647631 also
passes565 cases; its merge checkout `ad371efed8db0c3ec1c9c8d031e7e8dbe99a44d4`
has the exact reported head's tree. Fresh and historical observations are separate.

The fixed owned probe independently runs twelve controls with Lit 3.3.3,
LitElement 4.2.2, ReactiveElement 2.1.2 and real Chromium 156.0.8078.4. Six process
the closed frame and return an empty input; six skip it and retain `owned-draft`.
The probe never evaluates corpus or consumer strings. The original consumer
execution is a separate, narrowly scoped qualification operation.

Three valid current-baseline trials on the frozen controls detect 18/18 genuine
defects but also publish 10 false positives; several findings acknowledge that
their own premise is disproved. Aggregate precision is18/28 and exact locations
10/18. All inputs, individual failures and the unchanged default aggregate are
retained in `quality/bugbot/evidence/issue-848.json`. This demonstrates the current
controlled failure family, not the historical model's internal cause or a replay
of its complete 94-file review. Partial historical conversation does not establish
causation. The first candidate removes all safe-case alerts but fails the unchanged aggregate
exact-location floor (13/17). Preserve its three trials, source and CLI identity.
A distinct second candidate refines generic origin/offset arithmetic but still
fails exact locations 13/17. A third distinct source revision asks for an actual
already-permitted static line/AST listing rather than mental counting; it adds
no executor, permission or query. Each revision has three prospectively declared
trials on the same frozen inputs and scorer. All intermediate source snapshots,
identities, predictions and failures are preserved. The final aggregate passes
every unchanged default floor: precision 1, recall 17/18, exact locations 14/17,
severity/category 1, zero false positives and one missed delayed-descendant defect.
Trial 1 fails its individual location floor; trial 2 fails recall; trial 3 passes.
These limits remain visible, with no selected-best-run or population claim.

This is a prospective correction. An as-built motivation is not reconstructed;
the owner's existing publication/state architecture remains the intentional contract.

## 3. Actors, surfaces and terms

Maintainers inspect inline findings, source/run links, review checks and summaries.
An update promise belongs to an instance and cycle. A helper can return that
promise while its caller still fails to wait before another write. A physical
line, statement, task, microtask and rendered frame are different facts. Model
responses propose findings; they do not own test mutation or historical dismissal.

## 4. Goals, limits and fixed invariants

- **A-01:** MUST inspect complete statements, neighboring operations and aliases;
  a same-line semicolon-separated await is not absent.
- **A-02:** MUST trace the required effect through the actual receiver, current
  promise, helper/caller, framework version and scheduler. Preserve proved missing,
  wrong/stale/dropped and descendant waits, without assuming every such form fails.
- **A-03:** MUST reconcile reached lifecycle writes and exact-source observations.
  A proved cleared draft is not restored without a writer. A disproved candidate
  MUST be omitted entirely, including informational or self-refuting findings.
- **A-04:** MUST anchor a supported ordering fault to the changed operation that
  overtakes required unfinished work, using its actual fragment origin. A
  readability-only line split MUST NOT be presented as a runtime correction.
- **A-05:** MUST preserve source/traffic limits, ports, source freshness, explicit
  finding history authority, permissions, locale and empty-source compatibility.
- **A-06:** MUST keep private references outside reviewer input and retain every
  fixed-input model trial, real observation, SDK identity and failed quality gate.

No await-text filter, local semantic executor/parser, new query, dependency,
permission, public setting or automatic historical resolution is introduced.
Consumer edits and generalized browser UI/VoiceOver acceptance are out of scope.

## 5. Current versus proposed journey

| Stage | Current failure | Required result |
|---|---|---|
| Read changed test | Treat a physical line as one operation | Read assignment and subsequent await |
| Establish timing | Borrow a scheduler/instance from another case | Trace this receiver, cycle and caller |
| Evaluate reset | Invent restoration after a real clearing write | Follow every reached state writer |
| Inspect observation | Return a finding despite disproving it | Omit the unsupported candidate |
| Explain real fault | Point to a legitimate earlier write | Anchor the changed overtaking operation |

The flow in section1 is the textual overview. Source and execution observations
are facts to assess, never authority to run code or weaken review controls.

## 6. Behavior and state model

| Source/observation | Required reasoning |
|---|---|
| Assign closed; await current completion; assign editing | Wait precedes the second write, even on one line |
| Correctly awaited alias/helper | Follow identity and caller propagation |
| Pending synchronous `performUpdate` | Verify the closed cycle already ran |
| Default microtask cycle before animation frame | Evaluate the actual completed work, not an invented delay |
| Another receiver or pre-write promise with a delayed scheduler | Prove whether it covers this pending cycle |
| Helper/then started but next write precedes its completion | Preserve a reached overtaking defect |
| Parent completion, delayed child still pending | Trace the descendant before the next parent transition |
| Evidence itself says the contract is satisfied | Return no candidate, rather than an info explanation |

Duplicate, stale, partial and failed review events keep their existing state
owners. Omission of a new candidate does not resolve any previous finding.

## 7. Configuration

No new setting, precedence rule, persistence or migration. Recommended operation:
keep existing review configuration and provide complete pinned source and matching
observations. Existing bounded narrower review/recheck is the alternative when
context cannot fit. Neither option changes correctness, source/response limits,
authorization or coverage floors. Model/effort choices remain existing bounded
configuration; this controlled comparison fixes Codex/gpt-6-luna/medium and does
not claim to replay the report's smart-effort partitioning.

## 8. Clean Architecture

One pure shared instruction owns the reasoning contract. Ordinary/partitioned
and framed source review, plus the real-agent benchmark, consume it. Application
ports, adapters, query accounting, composition, schemas and state mutation remain
unchanged. The optional static-listing guidance uses only existing read-only inspection or
inert literal counting; it does not require new tools or claim that a tool ran.
The existing independent generated-source verifier retains its Python
activation; this change does not claim that JavaScript receives a second query.

```text
review use case -> shared source guidance -> existing read-only findings port
 -> existing validation/freshness/history policy -> publication + review UI
```

Text equivalent: guidance supplies evidence requirements, never execution or
mutation authority. Source presence keeps the legacy empty prompt unchanged.
Type/dependency/port checks, actual normal/framed delivery tests, benchmark-port
call counts, input privacy tests and full coverage enforce these boundaries.
Optional Lit/browser qualification is test infrastructure, not an Action dependency.
The versioned optional runner imports only its fixed sibling probe from an owned
temporary SDK with pinned direct packages. It uses a fresh browser context,
loopback-only requests and exclusive creation of a new evidence output. It is
not imported by production or mandatory Node tests. Detection's existing source
inspection authority is unchanged.

## 9. UI/UX and content

Existing surfaces and durable markers remain unchanged. Representative states:

- Pending: “Reviewing changed code — no action required.”
- Complete safe case: normal completed review, no missing-await inline finding.
- Supported defect: “The next transition runs before the child finishes closing,”
  followed by the actual changed statement, receiver/cycle proof and source link.
- Action required: inspect the linked source and applicable run before changing it;
  an existing finding still needs normal explicit current-source verification.
- Failed/partial: “Review incomplete — inspect the run and recheck complete source.”
- Publication partially completed: retain the published provider facts and ordinary
  recovery; never describe a successful publication as permission to rewrite history.

Current state precedes completed facts, next action, impact and technical detail.
No new notification, route, label or command. Existing locales/fallback,
sanitization, descriptive links, mobile headings, light/dark rendering and bounded
comments remain applicable. Plain text does not depend on a diagram or color.
Human browser/VoiceOver evidence is inapplicable to this reasoning-only change.

## 10. Failure, recovery and cleanup

Unavailable source or runtime evidence cannot justify an unconditional observed
suite-failure claim. A source-based prediction must remain a prediction. A failed
or partial review retains its normal incomplete result and recheck path, with no
new retry or partial-publication rule. A green unrelated/unselected case does not
certify this assertion. Keep frozen inputs, all predictions/scores, source/runtime
identities and actual native evidence. Remove only owned inactive intermediates
after preserving evidence and the current approved rollback; do not touch personal
browser profiles or registered Safari packages.

## 11. Security and privacy

Source, logs and model output are untrusted data, not lookup, credential, execution,
approval or dismissal authority. Mandatory tests parse fixed source as inert data;
they never evaluate corpus strings. The optional fixed probe imports only its
authored module and pinned Lit in a fresh real-browser context restricted to one
loopback origin. The separately reproduced public consumer test uses verified
immutable blobs, ignored install scripts, private caches and a credential-variable
allowlist, with no HOME override or source edits. Fictional draft values are not
personal data. Expected verdicts, categories and reference anchors stay outside
every actual reviewer prompt.

## 12. Observability

Keep actual review completeness, base/head, timing and findings telemetry. Record
probe bytes, framework/browser versions, immutable consumer blobs, exact selected
test versus full-suite counts, individual model samples and the predefined aggregate.
Hashes do not constitute full provider stdin capture. A retained semantic finding
with an incorrect coordinate can be unmatched by the unchanged scorer; report
that scored false positive/negative separately from an alert on a safe operation. Twelve scenarios repeated
three times are 36 observations, not 36 distinct regressions or a statistical guarantee.

## 13. Compatibility, rollout and rollback

No data/config/schema migration, execution capability or unbudgeted query. Existing
locale, history, framed receipts and freshness gates remain independent. Merging
to develop does not update an installed consumer runtime. Release adoption follows
the managed release workflow after bugs are closed. Roll back guidance, consumers,
fixtures/docs and generated bundles together without altering native review history.

## 14. Numeric test budget

Require **18 distinct cases**, derived from six safe forms, six contrasting
unfinished-update paths and six delivery/privacy/compatibility contracts.

| Area | Minimum cases | Risk |
|---|---:|---|
| Policy | 12 | Exact source/fragment identity, independent browser observation and opposite-verdict scoring for each case |
| Application | 6 | Normal/framed delivery, legacy size, reference privacy, unchanged JS query accounting, earlier corpus preservation |
| **Total** | **18** | No double counting of model/browser repetitions |

`src/tooling/__tests__/bugbot_async_statements.test.ts` names the executable
regressions. Twelve browser observations and fresh consumer565 tests are separately
recorded evidence, not inflated SDK case counts. The pure shared module requires
100% lines/statements/functions/branches; report actual zero function/branch
counts rather than inventing paths. Existing global/module budgets, source and
200-case invocation bounds remain unchanged. The prior 174-case corpus, references
and 12-case resource group retain their content. This companion uses a separate
12-case group. Every modified coverable line needs a full hit, no partial.

Three baseline trials and three trials per distinct candidate revision use identical
frozen input and unchanged
scorer/default thresholds. Retain all individual failures and the predefined
36-observation aggregate, without selecting the best run or retuning references
after observations. Native source/parser checks are deterministic; no real waits
or network are added to mandatory Node tests. Exact-head remote CI and three
platforms remain required independently of qualification scores.

## 15. Documentation and discoverability

Update detection with complete-statement and synchronization reasoning, and quality
observability with the separate corpus, actual executions/trials and limitations.
Include the optional runner's exact SDK prerequisites, command, output identity,
failure/retry and non-overwrite behavior so contributors can repeat the controls.
Register this companion, instruction, fixed probe, tests and evidence in the owning
catalog entry and regenerate CATALOG. Existing setup/config/recovery pages remain
the route for installation and recheck; no new setup workflow. Validate specs,
catalog, docs/navigation, agent docs and workflow contracts together.

## 16. Acceptance scenarios

| Case ID | Area | Requirements | Scenario |
|---|---|---|---|
| bugbot-async-statements-C01 | Policy | A-01, A-03 | Same-line current await processes closed and clears draft. |
| bugbot-async-statements-C02 | Policy | A-01, A-03, A-04 | Moving the same await to a new line preserves behavior. |
| bugbot-async-statements-C03 | Policy | A-02, A-03 | Alias identifies the same current cycle. |
| bugbot-async-statements-C04 | Policy | A-02, A-03 | Caller actually awaits the closing helper. |
| bugbot-async-statements-C05 | Policy | A-02, A-03 | Synchronous update already processes closing. |
| bugbot-async-statements-C06 | Policy | A-02, A-03 | Applicable animation frame follows the default cycle. |
| bugbot-async-statements-C07 | Policy | A-01, A-02, A-04 | Second write overtakes an unawaited close. |
| bugbot-async-statements-C08 | Policy | A-02, A-04 | Other receiver does not cover this delayed close. |
| bugbot-async-statements-C09 | Policy | A-02, A-04 | Pre-write promise does not cover this delayed close. |
| bugbot-async-statements-C10 | Policy | A-02, A-04 | Helper starts but caller overtakes its completion. |
| bugbot-async-statements-C11 | Policy | A-02, A-04 | Then callback does not suspend the next write. |
| bugbot-async-statements-C12 | Policy | A-02, A-04 | Parent completes before delayed descendant closure. |
| bugbot-async-statements-C13 | Application | A-05 | Ordinary source review gets shared evidence guidance. |
| bugbot-async-statements-C14 | Application | A-05 | Framed review gets the same guidance and source. |
| bugbot-async-statements-C15 | Application | A-05 | Empty-source compatibility/size remains unchanged. |
| bugbot-async-statements-C16 | Application | A-06 | Frozen source stays exact and references change no prompt. |
| bugbot-async-statements-C17 | Application | A-05 | JS benchmark retains one read-only query per case. |
| bugbot-async-statements-C18 | Application | A-06 | Earlier corpora/reference bytes retain canonical checkout content. |

## 17. Requirements traceability

| Requirement | Cases |
|---|---|
| A-01 | bugbot-async-statements-C01, bugbot-async-statements-C02, bugbot-async-statements-C07 |
| A-02 | bugbot-async-statements-C03, bugbot-async-statements-C04, bugbot-async-statements-C05, bugbot-async-statements-C06, bugbot-async-statements-C07, bugbot-async-statements-C08, bugbot-async-statements-C09, bugbot-async-statements-C10, bugbot-async-statements-C11, bugbot-async-statements-C12 |
| A-03 | bugbot-async-statements-C01, bugbot-async-statements-C02, bugbot-async-statements-C03, bugbot-async-statements-C04, bugbot-async-statements-C05, bugbot-async-statements-C06 |
| A-04 | bugbot-async-statements-C02, bugbot-async-statements-C07, bugbot-async-statements-C08, bugbot-async-statements-C09, bugbot-async-statements-C10, bugbot-async-statements-C11, bugbot-async-statements-C12 |
| A-05 | bugbot-async-statements-C13, bugbot-async-statements-C14, bugbot-async-statements-C15, bugbot-async-statements-C17 |
| A-06 | bugbot-async-statements-C16, bugbot-async-statements-C18 |

The pure module and actual builders own these contracts. The named Jest suite,
fixed corpus/probe and versioned evidence implement the cases; detection and
quality documentation explain the product and measurement boundaries.

## 18. Implementation sequence

1. Preserve all reports, immutable source and independent old/new native evidence.
2. Reserve 18 cases; verify twelve owned browser controls and freeze inputs.
3. Complete all three approved-baseline trials before changing production guidance.
4. Share instruction, run regressions, build and freeze candidate source/runtime.
5. Measure all three candidate trials; retain every unchanged-default score.
6. Align owner/catalog/docs/evidence, full tests/coverage, bundles/package and Graphify.
7. Verify exact-head remote platforms/review/official Codecov; ordinary authorized
   merge only after all gates, then bounded cleanup and next sequential bug.

## 19. Definition of Done

- [ ] Six requirements and 18 distinct regressions have executed evidence.
- [ ] Shared guidance reaches real normal/framed/benchmark paths without an await filter or new query.
- [ ] Actual consumer, owned browser, scorer and model observations remain distinct.
- [ ] Every trial, failed gate, source identity and uncertainty is retained honestly.
- [ ] Compatibility, limits, privacy, history and authorization remain unchanged.
- [ ] Owner/catalog, generated index, user/operator docs and validators pass.
- [ ] Types, lint, full coverage/budgets, build/package/workflows and Graphify pass.
- [ ] Exact-head three platforms and complete review leave no findings or open threads.
- [ ] Official Codecov has 100% modified coverable lines, zero misses/partials versus live base.
- [ ] Necessary evidence/rollback is retained and owned inactive outputs cleaned.
- [ ] No material design decision remains unresolved.

## 20. References and decisions

- [Issue848 and full discussion](https://github.com/vypdev/copilot/issues/848).
- [Exact original test](https://github.com/vypdev/domus/blob/ecdd85b4b08479eede41a517f9acdfdde9393b17/frontend/tests/component.test.ts#L176).
- [Historical frontend gate](https://github.com/vypdev/domus/actions/runs/41330254452/job/124918647631).
- [Lit lifecycle](https://lit.dev/docs/components/lifecycle/): current-cycle completion,
  descendant limits and scheduling; exact pinned behavior also has owned runtime evidence.
- [Pinned Lit package metadata](https://registry.npmjs.org/lit/3.3.3).
- [Owning SDD](./bugbot-analysis-publication-and-autofix.md), [source-bound framing](./bugbot-source-bound-framed-review.md), [fixture evidence](./bugbot-fixture-value-grounding.md).
- Reject newline-based semantics, any-await suppression, consumer rewrites to hide
  the premise, invented runtime failures, selected-best scores and history edits.
  The historical internal cause remains unknown.
