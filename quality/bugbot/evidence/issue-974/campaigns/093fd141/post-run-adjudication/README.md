# Post-run adjudication of the original 174 cases

The [original qualification](../results.md) remains **COMPLETE_NEGATIVE**:
74 matches, 84 findings, 80 expected; precision 88.095238% fails 90%. All original
predictions, labels, thresholds, severity/calibration contributions and attempts
remain unchanged. This later audit does not admit the 42 paired reviews or a new
campaign. It found no independently demonstrated new production correction.

## What the failed pairs represent

The 10 scored false positives and 6 false negatives occur in ten cases. In six
cases, the prediction identifies the expected supplied mechanism at the exact
expected line but selects another primary category:

| Case | Frozen expected category | Original predicted category |
| --- | --- | --- |
| kotlin-blocking-coroutine | performance | reliability |
| py-short-circuit-unsafe-order | correctness | reliability |
| kt-compose-external-loader | correctness | reliability |
| test-delegate-bypasses-stub | correctness | reliability |
| request-transform-write | correctness | security |
| fixture-values-ids-override-inverted | correctness | reliability |

The frozen matcher includes category compatibility when pairing nearby findings.
An in-memory diagnostic changing **only** that field makes each of these six
pairs match. Every other prediction field is preserved; no aggregate
counterfactual PASS is calculated. The original captured schemas permit the
expected category in all eight corresponding requests, including follow-ups:
the enum did not force a different label. The unsafe-order prediction also has
a severity disagreement, which the category diagnostic does not repair.

The reported 100% category accuracy is calculated over the 74 already matched
findings. These six unmatched classification disagreements therefore coexist
with that metric. This explains the original calculation; it does not redefine
correctness or qualify the profile. Review any future category policy
independently, without case-ID suppression or using expected labels as model
input.

## Four hypotheses still need missing premises

| Case | Evidence still required |
| --- | --- |
| sql-bounded-query | Authored uniqueness/ordering contract and whether tied timestamps affect a required stable page boundary. |
| csharp-contained-path | Actual symlink/trust policy and the later file-opening path. The current hypothesis differs from the prior case-sensitivity prediction. |
| py-coverage-config-branch | Complete job and reporting requirement; the excerpt alone cannot prove absence of a report step. |
| py-short-circuit-unhashable | Outer-container/caller contract; an observed mapping/null behavior alone does not establish which inputs the function must accept or reject. |

Keep the scored false positives while these premises remain unresolved. An empty
expected list is not independent proof that a newly reported hypothesis is
false. In particular, the C# symlink finding cannot inherit the old Windows
case-sensitivity adjudication. No .NET/Windows, Kotlin/Compose or consumer
execution is claimed by this audit. Earlier owned fixture observations remain
scoped to those fixtures and were not rerun.

## Method and retained evidence

The original private archive is verified in full by its retained SHA256 and
1556-member inventory. Its original predictions and the 174-case corpus are
read without modification. The three pure scoring sources are byte-identical
to measured source 093fd141; the full frozen score matches every retained metric.
Per-case inventory totals reproduce 10 FP/6 FN. Original request bytes match their
attempt-start hashes before inspecting category contracts. This is offline
analysis, with zero new scientific or technical SDK invocations.

[Structured adjudications and source/diagnostic proofs](./adjudications.json)
retain all ten current dispositions and the limits of each claim. The earlier
[EV-07 audit](../../../../issue-971/adjudications.json) remains historical:
new predictions are compared individually rather than inheriting a case's old
classification automatically. The raw model inputs/outputs remain private.

The exact [canonical 164 snapshot](../canonical 164-historical.md) preserves its
entire prior history: 63376 bytes, SHA256
`ead8dc9dd4cf962b569c0ffa6214d4e68c4c545e4147cea6a8467a095b3628a5`.
Future index compression may link that immutable snapshot only after its commit
is published and the bytes are verified. No deletion or reconstruction of the
historical index is authorized by this copy.
