# EV-07 result — Native receipts and final closure

**The proposed Luna → Sol xhigh profile did not qualify.** All 174 independent
corpus cases completed, but precision, F1 and confidence calibration failed.
The launch guard refused the 42 paired full-review slots. They remain explicitly
unstarted; this campaign contains no Sol verifier measurement and establishes no
new false-positive reduction, positive-control retention or added-verification
latency on the repository cohort. Production verification stays disabled.

[Preregistration](campaign-provenance.md) · [Plan](campaign-provenance.json) ·
[All corpus attempts](campaign-provenance-attempts.jsonl) ·
[Controls and exact score](campaign-provenance-controls.json) ·
[42 unstarted review slots](campaign-provenance-slots.jsonl)

The implementation is `d26d0d6cd633c3aa313ddd21235fe985860b4104` and the preregistration commit is `19bf6f3eaecc48d8f8dd76997145e6d12a2d2b1f`. Its plan SHA-256 is `26a66c3d4c40c5a63fc27f619711e969545050d34deef5e85fc617dce47e693e`. The [public registration](https://github.com/vypdev/copilot/pull/951#issuecomment-6973299390) was updated at 20:59:43 UTC; measured dispatch started at 2026-11-18T21:00:09.367Z. No criteria or inputs changed after registration.

| Corpus metric | Previous measured campaign | This campaign | Gate |
| --- | ---: | ---: | ---: |
| Precision | 87.95% | 80.23% | ≥90% |
| Recall | 91.25% | 86.25% | ≥85% |
| F1 | 89.57% | 83.13% | ≥87% |
| Exact location | 90.41% | 91.30% | ≥80% |
| Severity | 93.15% | 95.65% | ≥80% |
| Category among matches | 100.00% | 100.00% | ≥80% |
| Brier error | 0.1141 | 0.1883 | ≤0.1600 |
| Matched / expected | 73 / 80 | 69 / 80 | |
| Unmatched predictions (scorer FP) | 10 | 17 | |
| Unmatched expected findings (scorer FN) | 7 | 11 | |

There were **200 prepared CLI invocations**, all admitted as Luna / OpenAI / xhigh / read-only. The 26 additional invocations belong to the existing Python generated-literal check in the ordinary benchmark path; they are not 26 retries of the 174 outer cases, nor Sol verification. The prior campaign prepared 199 invocations, including 25 such checks. All 174 cases have a completed terminal record. Provider-reported model identity, token usage and cost were not emitted by this runner and remain unknown. Their absence does not reject a result.

Corpus wall time was **619.9 s**, from the start event to the ledger's observed final modification; per-case median was **13.743 s** and p95 **60.956 s**, including the follow-up calls. These are not added Sol verifier latencies. There were zero GitHub writes to evaluated PRs and the corpus workspace remained unchanged.

## Deterministic diagnosis and limits

The public packaged API exactly reproduces the saved score. All 174 initial
requests, including prompt, schema and configuration, retain the previous digest
`e71b9b74db71c8f2c85534065f79fd4b097254b8438a08f536e30deab3d08b29`.
Rescoring the prior predictions still gives 87.95% precision. The subsequent
Python checks depend on the generated hypotheses. This is a new observed score,
not evidence that the receipt or closure changes caused the detector regression.

The frozen matcher requires a compatible category when matching a nearby finding.
Eleven current predictions occur within two lines of an expected site but use a
different category. This is a deterministic diagnostic, not proof that their
causal explanations are correct. The official 17 FP / 11 FN counts include this
matching effect; they do not independently establish 17 refuted real defects or
11 completely absent detector hypotheses. No labels, matching rules or scores
were changed after measurement. Any taxonomy change requires independent review
and a new preregistration; it cannot qualify this campaign retrospectively.

All 14 fixed-tree canaries, the planner preflight, 86 shadow controls, 279 focused
Jest cases, both full build/test/lint hooks, 13 packaged status scenarios and six
packaged approval/rollback cases passed. The explicit loopback GraphQL mutation
negative control records its attempted write before rejecting it. All these
provider writes are local synthetic controls, separate from the zero writes to
evaluated GitHub PRs. The selected owning SDD and archived pilots remain intact.

The launch guard returned `The independent corpus gate did not pass. Full review
was not started.` All 42 slots retain that reason. The control checks the
refusal before creating the unstarted-slot ledger. Full-review coverage,
positive controls, grounding and added p95 are **unmeasured**, not zero or passed.

## Reproduce scoring without model calls

From the implementation or a source-equivalent checkout with its built API:

```sh
node - <<'NODE'
const fs = require('node:fs');
const api = require('./build/api/index.js');
const file = 'quality/bugbot/evidence/issue-950/ev07-shadow/campaign-provenance-attempts.jsonl';
const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse);
const predictions = Object.fromEntries(rows.filter(row => row.event === 'case' && row.status === 'completed').map(row => [row.id, row.predictions]));
api.loadBugbotBenchmark('quality/bugbot/corpus.v1.json').then(corpus => console.log(JSON.stringify(api.evaluateBugbotBenchmark(corpus, {schemaVersion: 1, predictions}), null, 2)));
NODE
```

## Per-case record

`Matched`, `FP` and `FN` use the unchanged evaluator. CLI admissions include the
normal Python follow-up. The complete generated findings and flags are retained
in the linked JSONL, so this table is not a replacement for the original outputs.

| Case | Status | CLI admissions | Wall ms | Matched | FP | FN |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `ts-null-dereference` | completed | 1 | 18585 | 1 | 0 | 0 |
| `py-command-injection` | completed | 2 | 44043 | 1 | 0 | 0 |
| `go-leaked-goroutine` | completed | 1 | 37301 | 1 | 0 | 0 |
| `sql-unbounded-query` | completed | 1 | 15985 | 1 | 0 | 0 |
| `java-close-resource` | completed | 1 | 31523 | 1 | 0 | 0 |
| `rust-safe-change` | completed | 1 | 6729 | 0 | 0 | 0 |
| `docs-only` | completed | 1 | 3889 | 0 | 0 | 0 |
| `ts-authorization-bypass` | completed | 1 | 34865 | 1 | 0 | 0 |
| `ts-safe-optional-chain` | completed | 1 | 5268 | 0 | 0 | 0 |
| `py-mutable-default` | completed | 2 | 25838 | 1 | 0 | 0 |
| `py-parameterized-query` | completed | 1 | 6246 | 0 | 0 | 0 |
| `go-ignored-write-error` | completed | 1 | 22412 | 1 | 0 | 0 |
| `go-cancellable-send` | completed | 1 | 29682 | 0 | 0 | 0 |
| `sql-string-concatenation` | completed | 1 | 17893 | 1 | 0 | 0 |
| `sql-bounded-query` | completed | 1 | 20427 | 0 | 1 | 0 |
| `java-try-with-resources` | completed | 1 | 6127 | 0 | 0 | 0 |
| `rust-unchecked-input` | completed | 1 | 31194 | 0 | 1 | 1 |
| `rust-result-propagation` | completed | 1 | 14808 | 0 | 0 | 0 |
| `actions-untrusted-checkout` | completed | 1 | 18518 | 1 | 0 | 0 |
| `actions-readonly-metadata` | completed | 1 | 17541 | 0 | 1 | 0 |
| `shell-unquoted-path` | completed | 1 | 13837 | 0 | 1 | 1 |
| `shell-quoted-path` | completed | 1 | 10838 | 0 | 0 | 0 |
| `terraform-public-database` | completed | 1 | 10693 | 1 | 0 | 0 |
| `terraform-private-database` | completed | 1 | 5757 | 0 | 0 | 0 |
| `react-stale-effect` | completed | 1 | 13089 | 1 | 0 | 0 |
| `react-complete-dependencies` | completed | 1 | 31316 | 0 | 1 | 0 |
| `csharp-path-traversal` | completed | 1 | 16748 | 1 | 0 | 0 |
| `csharp-contained-path` | completed | 1 | 56881 | 0 | 1 | 0 |
| `kotlin-blocking-coroutine` | completed | 1 | 15588 | 1 | 0 | 0 |
| `kotlin-io-dispatcher` | completed | 1 | 4721 | 0 | 0 | 0 |
| `py-coverage-config-branch` | completed | 1 | 27019 | 0 | 1 | 0 |
| `py-http10-reconnect` | completed | 1 | 11462 | 0 | 0 | 0 |
| `docs-correct-regression-total` | completed | 1 | 5925 | 0 | 0 | 0 |
| `py-short-circuit-unhashable` | completed | 2 | 60956 | 0 | 1 | 0 |
| `py-helper-retry-validation` | completed | 1 | 5755 | 0 | 0 | 0 |
| `ts-exclusive-render-branches` | completed | 1 | 7080 | 0 | 0 | 0 |
| `py-short-circuit-unsafe-order` | completed | 2 | 45742 | 0 | 1 | 1 |
| `ts-composed-duplicate-ids` | completed | 1 | 14394 | 1 | 0 | 0 |
| `kt-compose-owned-loader` | completed | 1 | 6064 | 0 | 0 | 0 |
| `kt-compose-external-loader` | completed | 1 | 22645 | 1 | 0 | 0 |
| `kt-compose-failed-startup-error` | completed | 1 | 6822 | 0 | 0 | 0 |
| `kt-compose-failed-startup-stuck` | completed | 1 | 17020 | 1 | 0 | 0 |
| `ts-viewport-version-without-cleanup` | completed | 1 | 21141 | 0 | 1 | 1 |
| `kt-compose-preferred-width-narrow` | completed | 1 | 7814 | 0 | 0 | 0 |
| `kt-compose-required-width-overflow` | completed | 1 | 43133 | 1 | 0 | 0 |
| `kt-compose-fill-before-cap` | completed | 1 | 34980 | 1 | 0 | 0 |
| `kt-compose-cap-before-fill` | completed | 1 | 11911 | 0 | 0 | 0 |
| `kt-compose-padded-preferred-width` | completed | 1 | 12252 | 0 | 0 | 0 |
| `android-listed-minor-platform` | completed | 1 | 6192 | 0 | 0 | 0 |
| `android-absent-platform-package` | completed | 1 | 25598 | 1 | 0 | 0 |
| `external-package-unverified-inventory` | completed | 1 | 7504 | 0 | 0 | 0 |
| `android-stale-inventory-current-install` | completed | 1 | 6182 | 0 | 0 | 0 |
| `android-unrelated-green-job` | completed | 1 | 78594 | 1 | 0 | 0 |
| `kt-resolved-sql-subclass` | completed | 1 | 4844 | 0 | 0 | 0 |
| `jvm-type-hierarchy-unavailable` | completed | 1 | 3797 | 0 | 0 | 0 |
| `jvm-current-contract-over-stale-docs` | completed | 1 | 5328 | 0 | 0 | 0 |
| `jvm-unrelated-runtime-wrapper` | completed | 1 | 19966 | 1 | 0 | 0 |
| `jvm-passing-mock-not-counterevidence` | completed | 1 | 25095 | 1 | 0 | 0 |
| `kt-broad-catch-swallows-cancellation` | completed | 1 | 44332 | 0 | 1 | 1 |
| `test-indirect-binding-propagates` | completed | 1 | 6282 | 0 | 0 | 0 |
| `test-parameterized-fallback-reaches-stub` | completed | 1 | 45943 | 0 | 0 | 0 |
| `test-bound-callback-reaches-stub` | completed | 1 | 7736 | 0 | 0 | 0 |
| `test-delegate-bypasses-stub` | completed | 1 | 34924 | 0 | 1 | 1 |
| `test-empty-participants-skip-stub` | completed | 1 | 61932 | 1 | 0 | 0 |
| `test-recovery-swallows-bound-failure` | completed | 1 | 45374 | 1 | 0 | 0 |
| `action-declared-matcher-input` | completed | 1 | 21162 | 0 | 0 | 0 |
| `action-renamed-input-current-version` | completed | 1 | 5104 | 0 | 0 | 0 |
| `action-input-contract-unavailable` | completed | 1 | 5859 | 0 | 0 | 0 |
| `action-undeclared-matcher-alias` | completed | 1 | 13471 | 1 | 0 | 0 |
| `action-old-input-on-new-version` | completed | 1 | 24153 | 0 | 1 | 1 |
| `action-declared-input-wrong-value` | completed | 1 | 45775 | 1 | 0 | 0 |
| `kt-email-unicode-empty-label-guard` | completed | 1 | 8950 | 0 | 0 | 0 |
| `ts-email-caller-empty-label-guard` | completed | 1 | 5561 | 0 | 0 | 0 |
| `ts-email-normalization-before-guard` | completed | 1 | 18909 | 0 | 0 | 0 |
| `ts-email-existential-label-defect` | completed | 1 | 20736 | 1 | 0 | 0 |
| `ts-email-ignored-validator-result` | completed | 1 | 15107 | 1 | 0 | 0 |
| `ts-email-normalization-after-guard` | completed | 1 | 77385 | 1 | 0 | 0 |
| `kt-wasm-parameter-closure` | completed | 1 | 6500 | 0 | 0 | 0 |
| `kt-wasm-size-count-parameters` | completed | 1 | 19688 | 0 | 0 | 0 |
| `kt-wasm-object-parameter` | completed | 1 | 33912 | 0 | 0 | 0 |
| `kt-wasm-binding-evidence-unavailable` | completed | 1 | 4773 | 0 | 0 | 0 |
| `kt-wasm-missing-direct-identifier` | completed | 1 | 20500 | 1 | 0 | 0 |
| `kt-wasm-missing-callback-identifier` | completed | 1 | 32359 | 1 | 0 | 0 |
| `action-self-ref-bootstrap` | completed | 1 | 4384 | 0 | 0 | 0 |
| `action-self-ref-version-policy` | completed | 1 | 29511 | 0 | 0 | 0 |
| `action-workspace-ref-after-checkout` | completed | 1 | 5440 | 0 | 0 | 0 |
| `action-reference-contract-unavailable` | completed | 1 | 4900 | 0 | 0 | 0 |
| `action-self-ref-explicit-suffix` | completed | 1 | 11014 | 1 | 0 | 0 |
| `action-workspace-ref-before-checkout` | completed | 1 | 11383 | 1 | 0 | 0 |
| `action-self-ref-unsupported-host` | completed | 1 | 11769 | 1 | 0 | 0 |
| `md-link-root-self` | completed | 1 | 5865 | 0 | 0 | 0 |
| `md-link-nested-self` | completed | 1 | 5175 | 0 | 0 | 0 |
| `md-link-companion` | completed | 1 | 4704 | 0 | 0 | 0 |
| `md-link-root-relative` | completed | 1 | 4462 | 0 | 0 | 0 |
| `md-link-evidence-unavailable` | completed | 1 | 6895 | 0 | 0 | 0 |
| `md-link-extra-specs-directory` | completed | 1 | 12953 | 1 | 0 | 0 |
| `md-link-missing-fragment` | completed | 1 | 10895 | 1 | 0 | 0 |
| `md-link-renderer-drops-directory` | completed | 1 | 25768 | 1 | 0 | 0 |
| `request-transform-coil` | completed | 1 | 17829 | 0 | 0 | 0 |
| `request-transform-middleware` | completed | 1 | 6211 | 0 | 0 | 0 |
| `request-transform-unknown` | completed | 1 | 6267 | 0 | 0 | 0 |
| `request-transform-write` | completed | 1 | 13649 | 0 | 1 | 1 |
| `request-transform-bypass` | completed | 1 | 24099 | 1 | 0 | 0 |
| `request-transform-overwrite` | completed | 1 | 13546 | 1 | 0 | 0 |
| `request-transform-mock` | completed | 1 | 33304 | 1 | 0 | 0 |
| `request-transform-utf8` | completed | 1 | 13922 | 1 | 0 | 0 |
| `generated-source-literal` | completed | 1 | 12089 | 0 | 0 | 0 |
| `generated-source-leading-newline` | completed | 1 | 11294 | 0 | 0 | 0 |
| `generated-source-escaped` | completed | 1 | 11033 | 0 | 0 | 0 |
| `generated-source-dedent` | completed | 1 | 11800 | 0 | 0 | 0 |
| `generated-source-wrong-literal` | completed | 2 | 72066 | 1 | 0 | 0 |
| `generated-source-wrong-leading-newline` | completed | 2 | 77432 | 1 | 0 | 0 |
| `generated-literal-independent-shell` | completed | 2 | 49702 | 1 | 0 | 0 |
| `generated-literal-independent-contract` | completed | 2 | 42423 | 1 | 0 | 0 |
| `session-source-signed-bootstrap` | completed | 1 | 6302 | 0 | 0 | 0 |
| `session-source-storage-alias` | completed | 1 | 6014 | 0 | 0 | 0 |
| `session-source-opaque-bootstrap` | completed | 1 | 41218 | 0 | 1 | 1 |
| `session-source-expired-refresh` | completed | 1 | 25344 | 0 | 1 | 1 |
| `session-source-prefix-gap` | completed | 1 | 20071 | 1 | 0 | 0 |
| `session-source-setup-unavailable` | completed | 1 | 5067 | 0 | 0 | 0 |
| `unittest-discovery-delegated-wildcard` | completed | 1 | 7247 | 0 | 0 | 0 |
| `unittest-discovery-nested-working-directory` | completed | 1 | 9508 | 0 | 0 | 0 |
| `unittest-discovery-literal-argv-pattern` | completed | 1 | 6720 | 0 | 0 | 0 |
| `unittest-discovery-excluded-by-pattern` | completed | 2 | 33372 | 1 | 0 | 0 |
| `unittest-discovery-wrong-start-directory` | completed | 2 | 71800 | 0 | 1 | 1 |
| `unittest-discovery-runner-unavailable` | completed | 1 | 6199 | 0 | 0 | 0 |
| `kotlin-json-implicit-nullable-omission` | completed | 1 | 6152 | 0 | 0 | 0 |
| `kotlin-json-explicit-nullable-omission` | completed | 1 | 26465 | 1 | 0 | 0 |
| `kotlin-json-implicit-missing-nonnullable` | completed | 1 | 22425 | 1 | 0 | 0 |
| `kotlin-json-implicit-nullable-default` | completed | 1 | 5779 | 0 | 0 | 0 |
| `kotlin-json-explicit-nullable-default` | completed | 1 | 6903 | 0 | 0 | 0 |
| `kotlin-json-inherited-implicit-policy` | completed | 1 | 6792 | 0 | 0 | 0 |
| `kotlin-json-different-instance-policy` | completed | 1 | 18869 | 1 | 0 | 0 |
| `kotlin-json-unavailable-policy` | completed | 1 | 5961 | 0 | 0 | 0 |
| `ktor-routing-installed-root` | completed | 1 | 5044 | 0 | 0 | 0 |
| `ktor-routing-delegated-root` | completed | 1 | 5640 | 0 | 0 | 0 |
| `ktor-routing-configured-root` | completed | 1 | 6806 | 0 | 0 | 0 |
| `ktor-routing-child-subtree` | completed | 1 | 19402 | 1 | 0 | 0 |
| `ktor-routing-different-application` | completed | 1 | 30731 | 1 | 0 | 0 |
| `ktor-routing-unavailable-implementation` | completed | 1 | 4635 | 0 | 0 | 0 |
| `py-pep758-314-two` | completed | 1 | 6478 | 0 | 0 | 0 |
| `py-pep758-314-three` | completed | 1 | 5493 | 0 | 0 | 0 |
| `py-pep758-314-group` | completed | 1 | 6503 | 0 | 0 | 0 |
| `py-pep758-314-parenthesized-as` | completed | 1 | 11198 | 0 | 0 | 0 |
| `py-pep758-313-list` | completed | 2 | 43113 | 1 | 0 | 0 |
| `py-pep758-313-group` | completed | 2 | 41612 | 1 | 0 | 0 |
| `py-pep758-314-list-as` | completed | 2 | 36322 | 1 | 0 | 0 |
| `py-pep758-314-group-as` | completed | 2 | 28795 | 1 | 0 | 0 |
| `py-pep758-mixed-range` | completed | 2 | 65509 | 1 | 0 | 0 |
| `py-pep758-unknown-range` | completed | 1 | 7465 | 0 | 0 | 0 |
| `py-pep758-stale-parser` | completed | 1 | 13568 | 0 | 0 | 0 |
| `py-pep758-unbound-handler` | completed | 2 | 35328 | 1 | 0 | 0 |
| `snapshot-recovery-explicit-retain` | completed | 1 | 16493 | 0 | 0 | 0 |
| `snapshot-recovery-disposable-retain` | completed | 2 | 47447 | 1 | 0 | 0 |
| `snapshot-recovery-disposable-clean` | completed | 1 | 6671 | 0 | 0 | 0 |
| `snapshot-recovery-published-report` | completed | 1 | 11423 | 0 | 0 | 0 |
| `snapshot-recovery-published-cleanup` | completed | 2 | 45610 | 1 | 0 | 0 |
| `snapshot-recovery-existing-destination` | completed | 2 | 33832 | 1 | 0 | 0 |
| `snapshot-recovery-changed-ownership` | completed | 1 | 7316 | 0 | 0 | 0 |
| `snapshot-recovery-policy-unavailable` | completed | 1 | 8146 | 0 | 0 | 0 |
| `snapshot-recovery-incomplete-manifest` | completed | 1 | 39578 | 0 | 0 | 0 |
| `snapshot-recovery-completed-destination` | completed | 2 | 56816 | 1 | 0 | 0 |
| `fixture-values-db-file-parent` | completed | 1 | 6499 | 0 | 0 | 0 |
| `fixture-values-db-file-peer` | completed | 2 | 31508 | 1 | 0 | 0 |
| `fixture-values-db-directory-peer` | completed | 1 | 11464 | 0 | 0 | 0 |
| `fixture-values-db-directory-child` | completed | 2 | 58776 | 1 | 0 | 0 |
| `fixture-values-ids-default-asc` | completed | 1 | 6822 | 0 | 0 | 0 |
| `fixture-values-ids-default-inverted` | completed | 2 | 61049 | 1 | 0 | 0 |
| `fixture-values-ids-override-asc` | completed | 1 | 5568 | 0 | 0 | 0 |
| `fixture-values-ids-override-inverted` | completed | 2 | 52468 | 1 | 0 | 0 |
| `fixture-values-ids-default-desc` | completed | 1 | 9566 | 0 | 0 | 0 |
| `fixture-values-ids-desc-inverted` | completed | 2 | 46563 | 1 | 0 | 0 |
| `fixture-values-ids-filtered` | completed | 1 | 6678 | 0 | 0 | 0 |
| `fixture-values-ids-unfiltered` | completed | 2 | 35412 | 1 | 0 | 0 |

The profile remains unqualified. No production activation, approval or merge is authorized by these results. Remote CI and native review of the eventual pushed head are reported separately in the PR.
