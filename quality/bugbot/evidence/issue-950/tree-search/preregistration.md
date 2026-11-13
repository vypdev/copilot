# Bounded tree retrieval diagnostic

The prototype and its 14 zero-model controls were committed in
[9a6a74239](https://github.com/vypdev/copilot/commit/9a6a74239662979d3683ee0cfe899b594c4d0c32)
before opening #918. The prior pilot at
[e477e0e4b](https://github.com/vypdev/copilot/commit/e477e0e4b9b4c2aafd76474dccad8e10320b2a28)
remains separate. The runner only uses the frozen candidate and initial receipts.

| Pair | Review comparison and initial packet |
|---|---|
| R1/R2 · #869 | Reuse both prior pilot trees, candidates, Git excerpts and pinned Playwright Core source. The config lookup was unavailable in the earlier run and is now a known deterministic regression. |
| T1/T2 · #918 | Pin original Domus head `3d890522003c` and a mutation removing one predicate in the paired SQLite adapter. The original and mutant both include the application path from the same comparison base. Freeze its line 82 anchor and the application and port source receipts. |

The full T1/T2 comparison digest includes both the app and adapter paths. The
initial prompt shows the candidate's application hunk and supplied application
and port evidence. The adapter excerpt and its location are withheld. The
evaluator uses the actual pinned SQLite stack and real persisted retired
schedules in both date-only and timed cases. The local control, expected
verdicts, expected positions and decisive spans stay outside the model
inputs and the generic retriever. No native CI execution evidence is admitted.
The runner reads neither the oracle nor the probe outputs.

## Arms and limits

Each of 72 planned slots runs independently. There are two models, four
revisions, three arms and three repetitions. GPT-6 Luna and GPT-6.1 Sol use
OpenAI through the audited SDK and Codex CLI at low effort, three concurrent
slots per model, ordered by stable slot ID. The closed verifier starts in a
fresh private directory with no checkout, shell, skill, web, MCP or app tools.
The three arms use identical first prompt bytes and schema for each matched
model, revision and repetition.

| Arm | Second call after a valid request |
|---|---|
| Fixed packet | No. A request leaves the hypothesis inconclusive. |
| Repeat | Yes, with the original packet and a no-new-evidence response. |
| On demand | Yes, with the same original packet and the application result of the typed request. |

The repeat and on-demand arms use the same request validation and the same
case budget to admit a follow-up. A denied or exhausted typed request reports
its cause. Only the on-demand arm runs Git retrieval. A final response cannot
ask again or alter the frozen candidate. Dry-run write ports record and throw
on attempted effects. Model or receipt integrity failures invalidate the slot.

Charge both calls, any retry and retrieval against 90 seconds, 32,768 gross
input tokens, 4,096 output tokens and three provider attempts per case. Gross
input includes cached tokens. Use the audited 42-second turn cap, a 1.2-second
termination margin, and one bounded retry for a timeout without a completed
turn or tool event. The v4 reservation policy requires enough capacity for a
new call and at least 15 seconds of wall time. Retain all unmetered attempts
and mark their budgets unproven. Report failed and aborted slots separately.

The retriever permits three targets, 4,096 listed Git entries, 80 files,
16 matches, 512 KiB scanned source, 96 KiB per blob, 9,000 serialized evidence
bytes, and five receipts with at most 80 lines and 4,400 text bytes each.
Total retrieval wall limit is four seconds. Model prompt, packet and diff
ceilings follow the earlier diagnostic. Receipts and Git lookups bind to the
same reviewed tree and cannot follow symlinks or arbitrary paths.

## Scoring

Score retrieved evidence, cited evidence, verdict correctness and exact
anchor independently. Recovery must return a receipt on the frozen head
and tree spanning the complete evaluator witness. Citation counts only when
the final verdict cites that receipt. An inconclusive verdict may cite the
right receipt and still fail the verdict criterion. The report includes
each case and arm, all requests and statuses, per-attempt latency and usage,
and p95 wall time and gross input per model and arm.

For each model, require all three held-out originals refuted, all three
mutants confirmed at the exact anchor, all six decisive receipts recovered
and cited, and every on-demand case budget proved. Require the six correct
and metered held-out decisions to exceed both controls. Missing, invalid,
expired and unmetered trials cannot pass the gate. The known #869 regression
and the separate Git controls cannot substitute for this signal. A pass
permits evaluation in full review. Production activation remains disabled.
