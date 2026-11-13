# Bugbot evidence verification pilot

Frozen design dated 2026-11-09, before any model trial. Status is pending model execution.
The [manifest](manifest.json) freezes source, scopes, model matrix, controls and gates.
The [scoring key](scoring-key.md) is evaluator-only. The [case matrix](traceability.md)
is review material and must also stay outside the agent workspace and prompt.

## Experimental unit and isolation

Use the complete pinned Git trees and the changed-path scopes in [subjects.lock.json](subjects.lock.json). The historical
negative scopes are controlled reproductions, with an explicit comparison,
and do not purport to reproduce the complete historical session or its exact PR
comparison. Use only the pinned runtime/dependency evidence and source listed for
each target. For mutation heads, create a deterministic local commit over the
corresponding historical head. Use a fixed author and committer identity, date,
message and original diff bytes. Record commit, tree, paths, byte ranges, runtime
and package hashes, prompt and schema digests and trusted probe receipts before the
first measured request. Verify probe results on both subjects first.

The two experimental phases are:

1. **Frozen replay.** Inject the same [frozen candidate objects](candidates.json) into each
   arm at the detector response seam. The application assigns opaque IDs and
   binds anchors to the comparison. Where the baseline normally uses the
   generated-source verifier, run that verifier on the injected candidates. Where
   the baseline skips verification, record that behavior and project through the
   production admission, deduplication and limit policies. Count the two pytest
   claims separately while using one repository subject.
2. **Full review.** Run the normal detection request independently for each trial,
   then run the assigned arm through result projection. Score both the admitted
   detector output and final actionable output. Keep coverage, locale, effort,
   rules, severity, changed-code scope, source availability, comment limit and
   downstream write prohibition equal across arms within a model. Detect every
   missed positive at the detector separately from a verifier dropping a
   candidate. Score verified overflow as actionable output.

The baseline is the unchanged pinned production route. The original-context
control uses the same independent verifier instructions and disposition schema
as the evidence arm, with the original detection context supplied to a new task.
The evidence arm additionally gets application-issued evidence receipts and
bounded evidence reads. Use opaque references to the supplied original-context
blocks in the control to test semantic verification with the same response
shape. Those control references do not qualify production provenance. Preserve the baseline's normal read-only detection
capabilities. Match the new verifier's provider, effort, permissions, request
budget and tool policy across the two experimental arms. Any extra evidence in
the proposed arm comes through typed requests and the fixed evidence adapter.
No verifier has GitHub write access, a shell, or ambient project credentials.

Use fresh sessions without conversation reuse. Run both phases sequentially,
balance the order by deterministic hash within a phase and repetition, and finish
replay before starting full review. A trial has an opaque subject ID unrelated to
the verdict. Never mount or transmit issue reports, paired labels, evaluation
fixtures, oracle assertions or the scoring key. Evidence packets may contain
neutral probe observations with a bound receipt; use the same probe method on
both subjects. Keep native historical receipts separate from later executions.
Do not reuse model responses across trials. Record actual provider model metadata
where returned. A failed canary does not count as a trial.

Use production dry-run semantics in a local runner with a controlled SCM read
adapter, fail-on-call write ports and no write credentials. Assert zero review,
finding, thread, status-card, Check, label, approval and persisted configuration
writes, including on malformed or canceled output. Adapt the existing evaluator
for scoring. Its diff-only runner cannot qualify cross-file evidence, Git binding
or dry-run publication behavior on its own.

## Cases and controls

- **#898.** Reviewed ha-ui source accepts four supplementary code points and
  rejects two lone surrogates and C1 U+0085 under Node 24.20.0. The corresponding
  defect removes the Unicode flag on the same regex and rejects the same valid
  code points. The malformed-input invariant is checked in both cases. The
  separate Domus recurrence of the claim remains an expansion case.
- **#914.** Preserve the two exact pytest signatures and the locked pytest 9.2.0
  contract. The defect adds an unresolved required keyword-only fixture to the
  listener signature while preserving its optional schema argument. A standalone
  setup oracle proves the required-argument failure without launching Docker.
  The frozen container suite supports exact-source collection evidence and the
  native historical execution can be used after its job/tree/selection is attested.
- **#919.** The original production source and retained SQLite data must reject the
  preview before planning. The defect removes the source guard, which allows both
  date-only and timed preview requests past the rejection. The positive describes
  the reachable invariant breach and does not assume the original downstream
  error message. The later fixture supplies the setup recipe after verifying
  unchanged backend source. Keep the test assertions outside model inputs.

## Score and retain every attempt

Three repetitions per model × arm × phase × subject. An incomplete run occupies
its original slot. Count 108 planned subject trials per phase and 216 overall
(three repetitions × two models × three arms × six subjects). Raw output uses
one JSONL record per planned slot, with run/batch/subject identity, attempt number,
status and bounded failure reason, detection and final predictions, per-ID
dispositions, missed controls, false positives, exact anchors, inconclusives,
coverage, counts/bytes by evidence kind, monotonic stage times, model call counts,
input/cached input/output/reasoning usage where exposed, and cost only when the
billing identity and rate are known. Unknown values are null. Preserve aborts
and failures in raw rows and totals. Keep raw model content in restricted local
storage. Publish safe verdicts, metric counts and timing rather than prompts,
full CI logs or repository text.

For replay and end-to-end, pair trials by model, case and repetition. For each
model, require the evidence arm to show strictly fewer unsupported actionable
findings than baseline in at least two of three repetition totals and no increase
in the third, with at least three paired baseline unsupported results spanning at
least two historical premises. Report the original-context control separately.
Claim an incremental evidence benefit only when the same paired reduction holds
against that control. Require each of the three positive controls to be retained
and correctly anchored in all three evidence-arm repetitions per model in both
phases. Refuted and inconclusive observations are distinct, and inconclusive or
failed positives count as missed. A failed batch can never count as a clean win.
No activation if a model is unverified, a required comparison is invalid, or a
producer cannot be independently attested. Any reduced scope needs an explicit
new protocol before collection.

For detection and end-to-end report the applicable existing evaluator floors on
the full unchanged corpus in addition to the repository-shaped cohort. Floors
are precision 0.90, recall 0.85, F1 0.87, exact location/severity/category 0.80 and
Brier error at most 0.16. Use the existing evaluator's exact denominators and
retain failed trials. The six repository subjects qualify cross-file claims and
matched controls. They cannot establish general recall or calibration alone.

Provisional laboratory caps are in the [manifest](manifest.json). Apply them
before requests, at the adapter boundary. For qualification require observed
evidence-arm p95 incremental wall time ≤ 90 s per subject, p95 incremental
input ≤ 32,768 tokens and p95 incremental output ≤ 4,096 tokens per subject,
with no required partition or aggregate integrity cap failures. Report p50, p95
and maximum by model and arm, raw comparable token categories, error count and
observed concurrency. These are proposed pilot gates. Final production limits
and default model require the completed comparison and maintainer review.

If the baseline does not reproduce enough false positives in either phase, report
the actual counts and expand in the fixed order #859, #861, #867, #869, #875, #913
and the separate Domus #898 occurrence. Freeze a matched positive, exact tree,
scope, evidence and scoring key for each before those calls. Run all six arms and
both phases on each added pair. Keep original results and never replace a case
based on an unfavorable score. If a revised protocol is required, version it
before the next cohort and report both cohorts.
