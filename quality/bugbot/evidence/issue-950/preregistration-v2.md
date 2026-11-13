# #950 pilot protocol v2

Frozen before measured calls. This revision supersedes the tool and evidence
ambiguity in [v1](preregistration.md). The six subjects, seven candidate
hypotheses, three repetitions, models, phases and efficacy gates are unchanged.
The [manifest](manifest-v2.json), [source and CI packets](evidence-v2.json),
[runner](run-pilot.cjs) and [scorer](score-pilot.py) define the measured protocol.
Access canaries, controlled runner preflight and local oracle outputs are
separate.

| Arm | Detection or replay context | Independent verifier | Tool privileges |
|---|---|---|---|
| Current | Production prompt, frozen scoped diff, detached Git head and comparison | Existing Python/witness-triggered verification | Production read-only shell and checkout inspection in both tasks. No ambient shell credentials, network, MCP, plugins, hooks or write ports. |
| Original context | Same detector request, checkout and replay seam | Same fresh verifier as application evidence, with the original detector prompt and candidate | No verifier shell, workspace, web or MCP. |
| Application evidence | Same detector request, checkout and replay seam | Same fresh verifier, plus candidate-bound references to frozen source or CI | Same closed verifier policy. No probes or execution evidence from local oracles. |

The runner uses the production analysis workflow and native Codex schema/sandbox
policy. In the experimental arms a local pass-through at the legacy verifier
port preserves candidates while suppressing that legacy model request. The
separate experimental verifier consumes the accepted, deduplicated dry-run
findings, including overflow. It cannot add findings. Each invocation is
ephemeral. The runner verifies the clean detached head, tree, comparison diff
digest, read/closed argument parity, packet byte and artifact constraints, and
write-port traps before the measured phases. The controlled preflight uses fake
responses and makes no model requests.

The primary profile prefetches one fixed packet per subject before the verifier
call. It has one evidence round. This measures access to application-retrieved
evidence without a second retrieval round. The model may report a named gap.
None of these calls runs a reproduction. The local oracle and scorer remain
outside every reviewed checkout. Historical aggregate success is excluded when
it does not bear directly on the claim.

| Subject | Available evidence beyond the original detector prompt | CI |
|---|---|---|
| U1, U2 | Exact validator and package runtime declaration at each head | None qualifying for the particular witness |
| F1 | Both exact test signatures, lock-selected pytest 9.2.0 fixture discovery | ARM64 job 128154446414, frozen dependencies, 42 tests executed, synthetic merge source equivalent to reviewed head |
| F2 | Exact mutated listener and compatibility signatures, same lock-selected contract | None for the synthetic head |
| S1, S2 | Exact replacement logic and SQLite query at each head | No qualified execution for this claim. Later reproductions stay outside the prompt. |

Run frozen replay to completion before full review. Each phase has 108 slots.
Dispatch the ledger in its frozen order with at most eight concurrent
independent subjects. Each verifier runs with at most one concurrent session
within its subject. Per-call timeout is 75 seconds for detection and 60 seconds
for verification, with a 180-second experimental verification ceiling per
subject. The current route keeps its production retries. The experimental
verifier makes no retry in this profile. A failed or aborted slot remains in
the ledger. Provider usage is summed only across observed calls, with missing
usage surfaced separately. Raw private output can be used to audit scoring.
Published results contain structured counts and bounded predictions.

Replay uses frozen candidate identity. Full review matches each positive and
historical premise using the fixed changed path, causal witness and coordinate
window in the scorer. The existing evaluator exact anchor, precision, recall,
F1, severity, category and Brier gates remain qualification requirements.
A positive missed at detection is distinct from a verifier dropping it. Any
unsupported actionable output counts as a false positive, including a new
off-target hypothesis. Failed or aborted trials contribute no clean win.
Report exact location separately from the matching window.

Apply the paired gates independently to both phases and models. If baseline
reproduction is insufficient, retain the initial sample and freeze the next
pair in the [v1 expansion order](preregistration.md) with the same rules before
any new calls. Run both phases, models and arms for each added pair. A separate
probe-enabled profile would need its own manifest and scores.
