# EV-07 failure audit for #971

The frozen Luna/xhigh campaign remains **not qualified**. This audit reproduces its score, preserves every original label and gives all 17 unmatched predictions and 11 unmatched expectations an evidence row. It makes zero model calls and zero evaluated-PR writes. It does not start either a new corpus campaign or any of the 42 paired reviews.

## Reproduced decisions

| Input | Source | Precision | Recall | F1 | Brier | Original decision |
|---|---|---:|---:|---:|---:|---|
| Current complete ledger | `d26d0d6cd` | 80.2326% | 86.25% | 83.1325% | 0.1883116 | Failed precision, F1 and Brier |
| Recovered prior exact predictions | `03f8e6e3` | 87.9518% | 91.25% | 89.5706% | 0.1140651 | Failed precision |

The current ledger is the unchanged `issue-950/ev07-shadow/campaign-provenance-attempts.jsonl`. Its score exactly equals the frozen campaign controls. The prior plan, predictions and score are copied unchanged from the retained local `copilot-951-ev07-final.KDBPKv` campaign, with their digests in this audit. Their reconstruction reproduces the published prior score. Local recovery alone is not an independent server timestamp attestation.

The older archived `b12d0e9c` prediction fixture and its saved 75/80 score belong to a different campaign. They are not the prior `03f8e6e3` measurement. No archived passing fixture admits the proposed runtime or changes the two negative decisions above. Git blob checks confirm that `bugbot_benchmark.ts`, `bugbot_quality_eval.ts` and `finding_identity.ts` are byte-identical at `03f8e6e3`, `d26d0d6cd` and the audited merged tree.

## What the score does and does not establish

Eleven category mismatches account for **22 scorer rows**: one FP and one FN per case. The predicted hypotheses are present and describe the expected causal mechanisms. No completely absent hypothesis was found among these eleven FN rows. The remaining six predictions have empty frozen expectations: one exposes an independently supported defect in the supplied workflow fixture; five retain unresolved material premises or contract gaps. This does not prove six SDK defects or authorize changing labels.

The unchanged Brier calculation contributes 0.1260604651 from the eleven taxonomy-mismatched predictions, 0.0113965116 from the malformed-workflow prediction, 0.0503139535 from the five unresolved predictions and 0.0005406977 from matched predictions. These sum to 0.1883116279. A scorer mismatch receives label zero even when an independent causal assessment supports the explanation. This diagnoses the arithmetic without producing an alternative qualifying score.

Location and severity remain distinct. Rust, shell and membership-order predictions also disagree with frozen severity; the Kotlin cancellation location is one line away, and the unittest finding's ID contains an old line while its actual final `line` is 12. The aggregate category accuracy is calculated only among matched findings. It cannot independently establish category correctness for the eleven rejected matches.

## Independent causal evidence

- `observations.json` records immutable owned Node oracle executions for the bypassed stub, request-header value and both selected-token paths; a real shell archive control; fixed Python short-circuit observations; and the parsed workflow shape. No arbitrary corpus strings or consumer application source are executed.
- `unittest-observations.json` records actual CPython 3.14.6 discovery on fixed owned fixtures. The wrong directory runs one unrelated method and zero export methods; the passing controls run 19 methods including all five export methods.
- `kotlin-observations.json` records `kotlinc-jvm 2.4.10` on JRE 26.0.1 and `java -jar` executing the separate exception-mapping primitive on OpenJDK 21.0.11. The narrow catch propagates cancellation; the broad catch maps it to an ordinary error. It is not a JDBC or coroutine-scheduler measurement.
- Rust, viewport and synthetic upstream-Action cases retain their precise supplied source/contract proofs; this audit claims no Rust, browser/framework or native upstream Action execution. C# remains unresolved without the actual platform and acceptance contract.
- The root-level workflow `steps` observation is compared with [GitHub's official job-step syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idsteps), checked on 2026-11-19. Read-only metadata access does not make a malformed workflow valid. No live workflow is dispatched for this control.

## Complete per-error inventory

The full machine rows, original finding IDs and SHA-256 bindings are in `score-and-rows.json`; `adjudications.json` contains the independently reviewable reasoning and next action. FP/FN below always name the unchanged scorer's result.

| Case | Scorer row | Independent classification | Evidence and remaining boundary |
|---|---|---|---|
| `sql-bounded-query` | FP prediction #0 | unresolved | The prediction needs tied created_at values and a required stable boundary. The scenario calls the order deterministic, but supplies no schema or uniqueness constraint to establish or refute ties. The conditional SQL concern is not independently proven for the declared fixture. |
| `rust-unchecked-input` | FP prediction #0 | taxonomy-mismatch | The prediction identifies the supplied parse().unwrap() panic on malformed request input. The scorer rejects security versus reliability; the severity also differs (high versus medium). No Rust process was executed in this audit. |
| `rust-unchecked-input` | FN expected #0 | taxonomy-mismatch | The prediction identifies the supplied parse().unwrap() panic on malformed request input. The scorer rejects security versus reliability; the severity also differs (high versus medium). No Rust process was executed in this audit. |
| `actions-readonly-metadata` | FP prediction #0 | actual-causal-defect | The supplied added YAML has root-level steps and no jobs mapping. Read-only metadata access does not repair that workflow shape. The prediction identifies a causal defect in the supplied fixture, separately from the scorer's empty expectation. |
| `shell-unquoted-path` | FP prediction #0 | taxonomy-mismatch | The prediction identifies unquoted word splitting at the exact changed command. Its proposed -- and quoting repair also addresses option interpretation. The frozen security expectation differs from correctness and high differs from medium. |
| `shell-unquoted-path` | FN expected #0 | taxonomy-mismatch | The prediction identifies unquoted word splitting at the exact changed command. Its proposed -- and quoting repair also addresses option interpretation. The frozen security expectation differs from correctness and high differs from medium. |
| `react-complete-dependencies` | FP prediction #0 | unresolved | The stale-response hypothesis is possible for an asynchronous loader, but the fixture supplies no loadUser implementation, scheduling guarantee, cleanup elsewhere, or interaction witness. Complete dependencies alone neither proves nor refutes that separate hypothesis. |
| `csharp-contained-path` | FP prediction #0 | unresolved | The prediction assumes Windows case-insensitive path resolution and a requirement to accept differently cased contained paths. Neither supported OS/filesystem policy nor that acceptance requirement is supplied. No .NET/Windows execution is available in this audit. |
| `py-coverage-config-branch` | FP prediction #0 | unresolved | coverage run collects data while reporting applies fail_under, but the excerpt does not prove the complete job has no report step or that this change promises threshold enforcement. The separate threshold hypothesis cannot be resolved from this fragment alone. |
| `py-short-circuit-unhashable` | FP prediction #0 | unresolved | A fixed Python control proves a mapping with an allowed string key returns True. The prediction additionally requires the whole issue_steps value to be an array; the scenario describes arbitrary persisted JSON but does not specify that container-shape contract. The concrete behavior is proven; whether it violates the intended contract remains unresolved. |
| `py-short-circuit-unsafe-order` | FP prediction #0 | taxonomy-mismatch | Membership runs before isinstance. A list/dict step reaches set membership and raises TypeError; the prediction describes that exact path. Reliability differs from the frozen correctness label, and severity differs. |
| `py-short-circuit-unsafe-order` | FN expected #0 | taxonomy-mismatch | Membership runs before isinstance. A list/dict step reaches set membership and raises TypeError; the prediction describes that exact path. Reliability differs from the frozen correctness label, and severity differs. |
| `ts-viewport-version-without-cleanup` | FP prediction #0 | taxonomy-mismatch | The pinned 1.0 mount appends a child and preserves the loader; the removed caller cleanup is the missing operation. The prediction follows that same version and path. Reliability differs from correctness. |
| `ts-viewport-version-without-cleanup` | FN expected #0 | taxonomy-mismatch | The pinned 1.0 mount appends a child and preserves the loader; the removed caller cleanup is the missing operation. The prediction follows that same version and path. Reliability differs from correctness. |
| `kt-broad-catch-swallows-cancellation` | FP prediction #0 | taxonomy-mismatch | The scenario requires cancellation propagation and supplies no other guard. The new Throwable catch wraps that cancellation in DatabaseException/Left. The prediction identifies this same cause; reliability differs from correctness. It also reports line 5 rather than frozen line 4. |
| `kt-broad-catch-swallows-cancellation` | FN expected #0 | taxonomy-mismatch | The scenario requires cancellation propagation and supplies no other guard. The new Throwable catch wraps that cancellation in DatabaseException/Left. The prediction identifies this same cause; reliability differs from correctness. It also reports line 5 rather than frozen line 4. |
| `test-delegate-bypasses-stub` | FP prediction #0 | taxonomy-mismatch | The public reader returns right(row) and never invokes bindSession. The new assertion therefore fails with zero participant-projection calls. The prediction describes this exact route; reliability differs from correctness. |
| `test-delegate-bypasses-stub` | FN expected #0 | taxonomy-mismatch | The public reader returns right(row) and never invokes bindSession. The new assertion therefore fails with zero participant-projection calls. The prediction describes this exact route; reliability differs from correctness. |
| `action-old-input-on-new-version` | FP prediction #0 | taxonomy-mismatch | The selected revision reads enable-problem-matcher; the added problem-matcher belongs to the older revision. The default remains enabled and the supplied absent-asset contract fails registration. Correctness differs from reliability. |
| `action-old-input-on-new-version` | FN expected #0 | taxonomy-mismatch | The selected revision reads enable-problem-matcher; the added problem-matcher belongs to the older revision. The default remains enabled and the supplied absent-asset contract fails registration. Correctness differs from reliability. |
| `request-transform-write` | FP prediction #0 | taxonomy-mismatch | The real authored request path emits no-cache, preserves it, and reaches a test requiring no-store. The prediction identifies that actual value and failure; security differs from correctness. |
| `request-transform-write` | FN expected #0 | taxonomy-mismatch | The real authored request path emits no-cache, preserves it, and reaches a test requiring no-store. The prediction identifies that actual value and failure; security differs from correctness. |
| `session-source-opaque-bootstrap` | FP prediction #0 | taxonomy-mismatch | Configured opaque.setup.ts persists the opaque token and its future expiry skips refresh. The compact-token assertion fails on that selected token. Reliability differs from correctness. |
| `session-source-opaque-bootstrap` | FN expected #0 | taxonomy-mismatch | Configured opaque.setup.ts persists the opaque token and its future expiry skips refresh. The compact-token assertion fails on that selected token. Reliability differs from correctness. |
| `session-source-expired-refresh` | FP prediction #0 | taxonomy-mismatch | The selected signed session expires before the fixed clock; the actual refresh response supplies an opaque token. The prediction follows that replacement and failed assertion. Reliability differs from correctness. |
| `session-source-expired-refresh` | FN expected #0 | taxonomy-mismatch | The selected signed session expires before the fixed clock; the actual refresh response supplies an opaque token. The prediction follows that replacement and failed assertion. Reliability differs from correctness. |
| `unittest-discovery-wrong-start-directory` | FP prediction #0 | taxonomy-mismatch | The selected start directory runs the unrelated health method and excludes both required manifest modules. The prediction explains that same actual selection. Reliability differs from correctness; the final location is the expected line 12 despite a stale line-9 string in its ID. |
| `unittest-discovery-wrong-start-directory` | FN expected #0 | taxonomy-mismatch | The selected start directory runs the unrelated health method and excludes both required manifest modules. The prediction explains that same actual selection. Reliability differs from correctness; the final location is the expected line 12 despite a stale line-9 string in its ID. |

## Corrections and existing work

There is no supported general prompt rewrite or automatic category normalization in this audit. The eleven causal explanations cannot be rejected merely to match the scorer. Any new taxonomy proposal needs its own reviewed rationale, new version and preregistration; neither labels nor thresholds of either executed campaign change.

The malformed metadata workflow merits a narrow fixture/rubric review. Preserve the current 174-case corpus and completed campaigns; any future correction must be versioned and separately preregistered. The five unresolved cases need the exact missing evidence listed in `adjudications.json`, rather than speculative production patches.

Existing #954 (observer convergence), #963 (ECMAScript end anchors) and #966 (consumer release-tag policy) were read with their current comments. None is a demonstrated cause of these 17 discrepancies. They retain their independent scope and are not duplicated or declared fixed by this audit. All 27 original #950 records remain in the unchanged traceability matrix.

## Reproduction and limits

```sh
node --test quality/bugbot/evidence/issue-971/audit.test.cjs
node quality/bugbot/evidence/issue-971/audit.cjs /tmp/new-971-audit.json
node quality/bugbot/evidence/issue-971/observe.cjs /tmp/new-971-observations.json
python3 src/tooling/__tests__/fixtures/bugbot_unittest_discovery_probe.py --output /tmp/new-971-unittest.json
kotlinc quality/bugbot/evidence/issue-971/cancellation-probe.kt -include-runtime -d /tmp/new-971-cancellation.jar
java -jar /tmp/new-971-cancellation.jar
```

Use a fresh destination. The audit script refuses to overwrite an existing output. The three deterministic scoring controls reproduce current and prior decisions and show that a diagnostic category change cannot rewrite the frozen campaign. Node oracle and native primitive observations are separate causal evidence, never model input or qualification.

No new profile is qualified. #974 still requires the merged deterministic prerequisites, any independently justified corrections, and a committed exact implementation/driver/runtime preregistration. #975 requires an actually passing corpus on identical pins. Production remains `BUGBOT_VERIFICATION_MODE=disabled`; evaluated-PR write attempts remain zero.

## Integration after #970

The official synchronization run44715033832 prepared a clean merge of exact
develop4736cd4 into the existing1f3fbdde audit branch; no fixer was needed. Its
configured verification passed all943 Jest suites and18,695 tests, with the35
pre-existing skips. The extension run passed384 files but its unchanged
commands.test.ts beforeAll build exceeded the existing60,000ms hook timeout.
The Action aborted the merge without publishing. The complete native failure is
retained losslessly in official-sync-verification-failure.log.gz, with its exact
raw digest/length in integration-log-manifest.json.

The extension Git tree is byte-identical on both source revisions
(4a5bbf2f98bec1b429c9821fb8a0eca3e3e66a21). The same unmodified six-case suite
passes locally in21.18 seconds; its log and receipt are retained separately.
That local observation does not establish a complete native Linux pass or prove
the cause of the earlier delay. No timeout, concurrency, runner or source change
was made to that suite, and no unchanged Action retry was sent.

After the maintainer delegated merge judgment, the same clean merge was prepared
on the existing managed ref under the recorded sync-reconciliation-plan.json.
Ordinary repository verification and committed-source shadow controls must pass
before a normal same-ref push, with both remote identities checked again. The
final native CI, including extension verification, and Review must pass on that
published head before PR integration. No ref creation/rename/deletion, force,
installation or production change is part of this recovery. All frozen scores,
labels, audit classifications and five unresolved premises above are preserved.
