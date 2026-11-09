# Luna detector with paired #892 verifiers

[Preregistered commit](https://github.com/vypdev/copilot/commit/d16161572bf7cffd49c2a90759b6939cf38d1de0) ·
[Runner controls](runner-control.json) · [Detection ledger](detection.jsonl) ·
[Frozen candidates](candidates.json) · [Trial ledger](trials.jsonl) ·
[Chromium observations](../reserved-navigation-diagnostic/browser-control.jsonl)

Chromium reproduced the pointer outcome on the pinned trees. The
original emitted one selection request after a fresh click and the
mutation emitted zero across all four mode and direction combinations.
The evaluator retained those observations outside the model packets.

| Revision | Luna detection | Findings | #892 handoff | Gross input / output | Wall ms |
| --- | --- | ---: | --- | ---: | ---: |
| N1 | completed | 0 | seeded | 12,408 / 533 | 12394 |
| N2 | completed | 0 | seeded | 12,405 / 15 | 2209 |

The handoff records the original detector location when the hypothesis
matches. Every verifier receives the same canonical hypothesis and
line 107 on that tree. Seeded rows are separate from measured detection.
The twelve slots include two adaptive and one matched-source trial per
tree and verifier. The matched-source control uses one observation per cell.

| Mode | Verifier | Revision | Handoff | Correct | Real defect rejected | Effective inconclusive | Chain delivered/cited (drag, click, dispatch) | Exact anchor | Budget proved | Known gross input / output | Latency ms |
| --- | --- | --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| adaptive | GPT-6 Luna | N1 | seeded | 0/2 | 0 | 0 | 2/0, 2/0, 0/0 | 2/2 | 2/2 | 54,818 / 840 | 13,857–14,679 |
| adaptive | GPT-6 Luna | N2 | seeded | 0/2 | 0 | 0 | 0/0, 0/0, 0/0 | 2/2 | 2/2 | 41,442 / 443 | 5,162–11,819 |
| adaptive | GPT-6.1 Sol | N1 | seeded | 0/2 | 0 | 1 | 1/0, 1/0, 0/0 | 2/2 | 2/2 | 52,292 / 1,346 | 23,245–24,644 |
| adaptive | GPT-6.1 Sol | N2 | seeded | 0/2 | 0 | 1 | 1/0, 0/0, 0/0 | 2/2 | 2/2 | 51,644 / 1,087 | 19,669–21,086 |
| matched | GPT-6 Luna | N1 | seeded | 0/1 | 0 | 0 | 1/0, 1/0, 1/0 | 1/1 | 1/1 | 9,939 / 205 | 5,834 |
| matched | GPT-6 Luna | N2 | seeded | 0/1 | 0 | 0 | 1/0, 1/0, 1/0 | 1/1 | 1/1 | 9,871 / 277 | 7,337 |
| matched | GPT-6.1 Sol | N1 | seeded | 0/1 | 0 | 0 | 1/0, 1/0, 1/0 | 1/1 | 1/1 | 9,939 / 293 | 8,665 |
| matched | GPT-6.1 Sol | N2 | seeded | 0/1 | 0 | 0 | 1/0, 1/0, 1/0 | 1/1 | 1/1 | 9,873 / 283 | 8,284 |

N1 correctness means a supported original refutation. N2 correctness
means a supported mutant confirmation. A raw refutation of N2 counts
as a discarded defect. Token totals sum known usage, including cached
input in gross input. Wall time includes the application reads.

| Slot | Handoff | Reads | Raw → scored | Missing delivered or cited links | Model-reported missing | Calls | Budget | Wall ms |
| --- | --- | --- | --- | --- | --- | ---: | --- | ---: |
| N1 · GPT-6 Luna · 1 | seeded | head:provided, head:provided | citation-integrity → failed | drag, fresh-click, dispatch | — | 3 | proved | 13857 |
| N1 · GPT-6.1 Sol · 1 | seeded | head:budget, head:provided | inconclusive → inconclusive | drag, fresh-click, dispatch | fresh-click, dispatch | 3 | proved | 24644 |
| N1 · GPT-6 Luna · 2 | seeded | head:provided, head:provided | citation-integrity → failed | drag, fresh-click, dispatch | — | 3 | proved | 14679 |
| N1 · GPT-6.1 Sol · 2 | seeded | head:provided, head:provided | citation-integrity → failed | drag, fresh-click, dispatch | — | 3 | proved | 23245 |
| N1 · GPT-6 Luna · 3 | seeded | — | citation-integrity → failed | drag, fresh-click, dispatch | — | 1 | proved | 5834 |
| N1 · GPT-6.1 Sol · 3 | seeded | — | invalid-verifier-response → failed | drag, fresh-click, dispatch | — | 1 | proved | 8665 |
| N2 · GPT-6 Luna · 1 | seeded | — | closed-session-tool-event → failed | drag, fresh-click, dispatch | — | 1 | proved | 5162 |
| N2 · GPT-6.1 Sol · 1 | seeded | head:budget, head:provided | inconclusive → inconclusive | drag, fresh-click, dispatch | dispatch | 3 | proved | 21086 |
| N2 · GPT-6 Luna · 2 | seeded | head:partial, head:denied | candidate-call-budget → failed | drag, fresh-click, dispatch | — | 2 | proved | 11819 |
| N2 · GPT-6.1 Sol · 2 | seeded | head:provided, head:ambiguous | invalid-verifier-response → failed | drag, fresh-click, dispatch | — | 3 | proved | 19669 |
| N2 · GPT-6 Luna · 3 | seeded | — | citation-integrity → failed | drag, fresh-click, dispatch | — | 1 | proved | 7337 |
| N2 · GPT-6.1 Sol · 3 | seeded | — | invalid-verifier-response → failed | drag, fresh-click, dispatch | — | 1 | proved | 8284 |

The verification ledger has 12 trials and 25 provider attempts.
Terminal statuses are 2 completed, 10 failed.
It retains 0 unmetered attempts and 0 write attempts.

The scoped detector completed both calls and returned zero hypotheses on
both trees. This is a detector miss on the real mutant. The seeded
comparison therefore measures verification after a candidate has been
provided. The detector used a closed diagnostic prompt with the scoped
controller diff and full caller file. This run did not measure the
production detection workflow.

In the adaptive comparison, no session received the complete head
chain through tabs dispatch. Two Sol sessions returned valid
inconclusive verdicts and named missing evidence. Across both models,
the eight adaptive sessions ended with four response-contract failures,
one closed-session tool event, one provider dispatch withheld by the
remaining token reservation, and two inconclusive verdicts.

In the matched-source control, all three links reached every session
on both revisions. Luna failed citation validation on both trees.
Sol failed response-envelope validation on both. The ledger retains
the rejection category and measured attempt for each failed reply.
The complete packet removes the retrieval difference from those
four trials, and the response failures prevent a supported comparison
of judgment. Each model had one matched observation per tree.

I would hold the comparison at #892 for now. First make the shared
response contract reliably bind the candidate and citations, then
require valid matched-source verdicts and a real detector handoff
before expanding the comparison. The current results give no basis
to choose either verifier. Reserved cases and full-review evaluation
remain the qualification gates. Production activation stays disabled.
