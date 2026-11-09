# #950 bounded source-and-CI retest

Frozen on 2026-11-09 before any measured v3 call. The prior cohort, both
expansions, scorer and unsuccessful results remain available. This lab profile
leaves the approved issue scope, Action-published SDD, runtime configuration,
GitHub mutations and production verifier activation outside the experiment.

## Diagnosis and hypotheses

The v2 application-evidence arm found 7/9 positive exposures in Luna detection
and 9/9 in Sol. Across the two models, 2 were missed before verification, 8
were lost to invalid attempts, 6 received an inconclusive verdict, and 2 were
retained. All six fixture positives in replay were inconclusive. The packet
had the test signature and the installed pytest argument rule. It omitted the
unchanged edge test that directly calls the changed function and supplies the
old argument only. The restoration packet omitted the exact-head test that
establishes the pre-batch restore and expected conflict before a fresh preview.
Sol gave all three frozen restoration positives an inconclusive result. Neither
application receipt is an evaluator-authored probe or a claim that CI ran it.
The earlier ledger collapsed many local assertion failures into a generic code.
Individual v2 reasons are unavailable and cannot be reconstructed from a verdict
or token count. Separately, v2 incorrectly required exactly one detector request
even when a retry could recover the same production partition.

V2 sent the complete production detector prompt again for each verifier, with
an unrestricted citation-string schema and default Codex coding instructions.
Full-review verifier p95 was 213,032 gross input tokens for Luna and 434,624 for
Sol. Each of these maxima occurred in a single CLI call on S1, so candidate
multiplicity alone cannot explain the spikes. The previous ledger lacks
a provider-internal breakdown of those calls. A no-repository synthetic canary
isolates the effect of the smaller instruction/tool envelope. Its observations
are recorded separately and establish fixed-cost savings only.

V3 tests whether projecting a changed hunk and closing the causal source chain
improves retention while bounding gross verifier usage. It also tests whether a
shared detector instruction to trace removed guards and changed interfaces
reduces omissions without supplying expected findings or private test oracles.

## Frozen matrix and comparison

Use the same six exact subjects, scoring cases, locks, canonical comparisons,
SDK baseline and 216 preassigned slots as v2. Run 108 frozen-candidate slots
before 108 independently detected slots. Each phase uses Luna and Sol, three
variants and three repetitions. Use the exact SDK audit path and same Codex
CLI, provider and medium effort for every route. The controlled provider seam
replaces only the literal verifier in the experimental arms. The production
baseline retains its shell inspection, gated literal verifier and retries.

| Arm | Detection | Independent verification input and permissions |
|---|---|---|
| Current | Unchanged production review and read-only checkout | Production gated literal verification with its read-only tools |
| Original context | Production review with shared causal-reachability guidance and read-only checkout | One fresh closed session per admitted candidate with candidate projection and its canonical original diff hunk |
| Application evidence | Same detector and permissions as original context | Same candidate, diff projection, configuration and tool policy, plus bound source and applicable native CI receipts |

Full review measures the combined detector-plus-verifier change against current.
Report detector recall separately. The frozen phase isolates the verifier using
the same candidate in each arm. The two experimental arms differ only in
application-supplied receipts and the corresponding allowed citation IDs.

The runner uses a detached, clean and remote-free checkout for read-only
inspection. Native findings run through the audited dry-run application route.
Each closed verifier has a fresh working directory with no checkout, GitHub
credentials, tools, network inspection, persistent session or MCP access. The
operator's provider authentication stays in the Codex CLI. Fail-on-call
GitHub write ports count attempts, and any write attempt invalidates a trial.
Only a static excerpt, its application-bound receipt, and the already attested
native CI result can be model evidence. All historical oracle answers, labels,
controls and post-head reproduction output are evaluator-only.

## Validation and budget

Project the candidate's diff hunk to at most 2,800 UTF-8 bytes and the complete
packet to at most 14,000 bytes. Reject an overall prompt above 19,500 bytes.
Select only the configured path group for the subject and attest each head blob,
line range and dependency lock before any calls. Missing applicable source is
inconclusive. Give every candidate one fresh session, with a host-owned identity
and closed receipt IDs. Accept an affirmative verdict only with a cited witness.
No retry on experimental verifier output, no partial active output on an integrity
failure. A provider call can exceed its reservation before accounting returns.
Require provider usage, reserve 7,400 gross input tokens before each additional
call, and fail the whole result if observed total exceeds 32,768 input or 4,096
output. Stop new calls at four per subject or the 90-second subject deadline.
A call has a 36-second deadline and cannot outlive the remaining subject time.
Record budget omissions as inconclusive and disqualify the overhead gate.

Keep v2's success thresholds and nearest-rank p95. Track gross and cached usage
separately, never subtract cached input for qualification, and report p95 with
and without valid zero-call subjects. Keep failed, aborted and inconclusive
slots. Label actionable off-target output as unsupported by the frozen oracle.
The separate unchanged corpus and its detection thresholds still qualify any
activation. A completed full pair must retain all nine positives at their
preregistered anchors in each phase/model. The paired gates remain at least
three baseline historical alerts across two premises and a strict improvement
in at least two repetitions with no increase in the third. Compare to current
and original context separately. These gates, the fixed anchor scoring and the
input/output/time ceilings are independent. When baseline reproduction remains
insufficient, expand in the v1 order if the intact primary comparisons are
otherwise eligible. If a fixed primary integrity, recall, anchoring or budget
gate fails, publish the insufficient baseline separately and stop qualification.
Additional subjects cannot replace those primary observations. Any later tuning
requires a distinct preregistration and preserves all v3 rows.

Run six deterministic policy tests and 18 dry-run preflights before model
measurement. Use the private ledger for model text. Publish structured bounded
telemetry, hashes, dispositions and unchanged oracle scores. See the
[Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference#model_instructions_file)
for the closed verifier's replacement instructions option.
