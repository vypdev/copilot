# EV-07 — Native receipt and closure campaign

This preregistration precedes all measured calls. The implementation is
`d26d0d6cd633c3aa313ddd21235fe985860b4104`. The [frozen plan](campaign-provenance.json) has SHA-256
`26a66c3d4c40c5a63fc27f619711e969545050d34deef5e85fc617dce47e693e`. It records the implementation tree, dependency lock, shipped Action,
compiler configuration, drivers, runtime, model profiles and ordered case IDs.
Previous manifests and measured results remain unchanged.

The proposed installed source/CI profile uses **Codex GPT-6 Luna → GPT-6.1 Sol,
both xhigh**, CLI 0.169.1, Node v24.20.0. Effective invocation
flags are checked before dispatch. No model fallback is permitted. Production
verification is disabled; every evaluated PR has only dry-run mutation ports.
Runtime probes are unavailable in this profile. Local diagnostic SQLite versions
are not historical CI accreditation. Official and matching CI reads use the
installed evidence ports; expected outcomes stay in the evaluator.

Run all **174** unchanged independent corpus cases in the frozen order with six
workers and one outer attempt per case. Require completion, zero writes, an
unchanged workspace, precision ≥90%, recall ≥85%, F1 ≥87%, exact location,
severity and category each ≥80%, and Brier error ≤0.16. Invalid, absent and failed
responses remain recorded and cannot pass. Retain every attempt and the frozen
scorer result. No post-hoc relabeling is a qualification result.

Only a valid passing corpus admits the **42** full-review slots: U1, U2, F1, F2,
S1, S2, X1, X2, M1, M2, P1, P2, J1, J2, three repetitions, three workers.
Detection and prepared candidates are shared by each ordinary-publication /
shadow-projection comparison. Require baseline reproduction of at least three
alerts across two historical premises, two strictly better paired repetitions
and no regression in the third, every positive at its exact anchor, grounded
verdicts, zero writes and added subject p95 ≤90 s, measured after completion.
An incomplete or technically failed review cannot be clean. A failed independent
gate stops admission of later qualification-only phases; it does not terminate
an admitted investigation. Record all unstarted slots with the failed gate.

Time, usage and missing usage are telemetry. There is no investigation deadline,
turn limit, token reservation or usage-based admission. Only explicit cancellation
interrupts the experiment. Keep technical failures separate from verdicts and
report missing provider measurements honestly.

All **14** fixed-tree canaries and the corpus planner preflight passed before
registration, with zero model calls and zero GitHub mutation attempts. The
canaries assert exact head, tree, diff and clean checkout; the planner checks Luna,
xhigh and read-only. The evaluator source uses the shipping TypeScript compiler
options. The old ES2022 initialization failure and its deterministic correction
are recorded separately; no historical pilot runner is changed.

Reproduction from the preregistration checkout, with CLI 0.169.1 on PATH:

```sh
export COPILOT_EV07_PLAN="$PWD/quality/bugbot/evidence/issue-950/ev07-shadow/campaign-provenance.json"
pnpm run test:bugbot-shadow-verification
node quality/bugbot/evidence/issue-950/ev07-shadow/corpus.cjs "$CAMPAIGN/corpus-preflight" --preflight
node quality/bugbot/evidence/issue-950/ev07-shadow/review.cjs "$CAMPAIGN/fixtures/full-review/U1" U1 1 "$CAMPAIGN/preflight-U1.jsonl" --preflight
node quality/bugbot/evidence/issue-950/ev07-shadow/corpus.cjs "$CAMPAIGN/corpus-v3"
# Launch only after the saved corpus gate passes:
node quality/bugbot/evidence/issue-950/ev07-shadow/launch-full-review.cjs "$CAMPAIGN"
python3 quality/bugbot/evidence/issue-950/ev07-shadow/score-review.py "$CAMPAIGN/full-review" --checkouts "$CAMPAIGN/fixtures/full-review"
```

`CAMPAIGN` is a new local output directory. Reconstruct its detached, remote-free
fixtures from the exact [v4 manifest](../v4/manifest.json) and oracle pins, using
the [archived fixture instructions](https://github.com/vypdev/copilot/tree/bugbot-950-pilot-evidence/quality/bugbot/evidence/issue-950/v4).
The source/lock guard must pass before dispatch. Use a new destination for each
attempt; do not overwrite any historical ledger. Report raw observed scores and
stage failures separately from deterministic controls and remote CI.
