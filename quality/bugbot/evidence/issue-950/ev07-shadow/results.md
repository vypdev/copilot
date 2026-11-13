# EV-07 shadow qualification of the installed profile

The measured Bugbot implementation is `b12d0e9c156e45bce530164f54af8b6af173289c`. It uses Codex with GPT-6 Luna for detection and GPT-6.1 Sol for verification, both at `xhigh`. The workflow ran in shadow and dry-run. Production verification remained disabled and PR #951 remained in draft.

The [plan](plan.json) and [runner checksums](frozen-review.sha256) fix the profile and the seven pairs from the [v4 cohort](../v4/manifest.json). Every comparison uses the normal detection and preparation path. It compares the ordinary publication decision with the installed verification projection for those same candidates. Original trees and local mutations keep their pinned bases, heads and diff scopes. The independent controls and premise matchers stay on the evaluator side. A shadow result cannot write a review, comment, check, approval or autofix to an evaluated PR. The source adapter can read matching CI metadata, and the local mutations have no authentic native CI at their synthetic heads.

## Independent detection corpus

The unchanged corpus completed all 174 cases, with 75 matched findings, eight unsupported predictions and five misses. The initial corpus launch recorded 174 planner rejections before any provider invocation. The repeat used an empty Git workspace with no remotes and passed a controlled planner canary before dispatch. Fourteen deterministic full-review preflights also passed after the simulated detector returned the normal partition binding.

| Metric | Observed | Requirement |
| --- | ---: | ---: |
| Precision | 90.36% | ≥ 90% |
| Recall | 93.75% | ≥ 85% |
| F1 | 92.02% | ≥ 87% |
| Exact location | 92.00% | ≥ 80% |
| Severity | 92.00% | ≥ 80% |
| Category | 100.00% | ≥ 80% |
| Brier score | 0.0894 | ≤ 0.16 |

[Preflight record](corpus-preflight.json) · [Attempts](corpus-attempts.jsonl) · [Predictions](corpus-predictions.json) · [Score](corpus-score.json)

## Full review and decision

**The profile did not qualify for EV-07.** The scheduler stopped admitting
new reviews after two gates became impossible to pass. All 11 reviews already
running reached a terminal result. Closing the scheduler admitted three more
child processes that terminated before reaching the runner. Their slots have
no provider records. The other 28 of the 42 planned slots remained unstarted.
See the [scheduler ledger](review-slots.jsonl) and [attempt ledger](review-attempts.jsonl).

- **Positive controls.** Detection matched 5/5 observed
  positives. Shadow retained 4/5 at the exact anchor.
  In X2 (#859), Sol cited the profile foreign key, parent index and initialization
  code. It returned `inconclusive` because runtime evidence was unavailable
  and the official lookup could not establish an applicable SQLite version.
  The independent SQLite fixture establishes the mutation's failure.
- **Latency.** 5/11 measured reviews exceeded 90 seconds.
  The full 42-slot p95 is the 40th ordered observation, so three such
  observations make the latency gate fail even if every remaining slot is
  below the threshold. The observed durations ranged from
  0.00 to 866.66 seconds.
  The threshold was applied to the campaign score and did not cut off a
  verifier session.
- **Baseline reproduction and reduction.** None of the measured baseline
  alerts reproduced a frozen historical premise. S1 produced an off-target
  alert that counted as one unsupported output in both ordinary and shadow
  publication under the frozen matcher. It received no independent adjudication.
  The three paired comparisons remain incomplete.
- **Integrity.** The full-review runner and corpus recorded zero GitHub
  mutation attempts. All 11 reviewed checkouts remained unchanged. The
  independent scorer rechecked all 213 final Git citation ranges successfully.
  The complete-cohort integrity gate remains unproven.

| Subject | Repetition | Projection | Ordinary / shadow findings | Positive anchor | Added verification (s) |
| --- | ---: | --- | ---: | --- | ---: |
| U1 | 1 | complete | 0 / 0 | — | 0.00 |
| U2 | 1 | complete | 1 / 1 | 4 / 4 | 146.77 |
| F1 | 1 | complete | 0 / 0 | — | 0.00 |
| F2 | 1 | complete | 1 / 1 | 131 / 131 | 137.24 |
| S1 | 1 | complete | 1 / 1 | — | 866.66 |
| S2 | 1 | complete | 1 / 1 | 226 / 226 | 846.79 |
| X1 | 1 | complete | 0 / 0 | — | 0.00 |
| X2 | 1 | incomplete | 1 / 0 | omitted / 8 | 322.07 |
| M1 | 1 | complete | 0 / 0 | — | 0.00 |
| M2 | 1 | complete | 1 / 1 | 27 / 27 | 84.20 |
| P1 | 1 | complete | 0 / 0 | — | 0.00 |
| P2 | 1 | canceled-before-runner | — | — | — |
| J1 | 1 | canceled-before-runner | — | — | — |
| J2 | 1 | canceled-before-runner | — | — | — |

The measured slice produced five confirmations and one inconclusive verdict.
The [machine score](review-score.json) records the three canceled launches
separately.

## CI reproducibility

Clean Chrome rebuilds use independent sibling directories on the same
filesystem as the admitted output. The original receipt comparison still
checks both clean builds against the existing artifacts. The [first remote
run](https://github.com/vypdev/copilot/actions/runs/43271434010) passed Chrome
and reported `ENOSPC` in the later npm check's `/tmp` cache. CI now uses its
runner-managed temporary directory. The [CI run for the fix](https://github.com/vypdev/copilot/actions/runs/43273404196)
passed Chrome reproducibility, npm package validation and the packaged smoke
test. Neither change modifies the measured Bugbot implementation.

## Reproduction

Use the original fixture and evaluator recipe in the [v4 report](../v4/results.md).
Place the materialized subjects under `$campaign/fixtures/full-review` with
no remotes. Compare the regenerated bindings, candidates and evidence with
their frozen v4 counterparts before dispatch. Use a checkout containing the
frozen runner and the unchanged Bugbot implementation in the plan, the same
Codex CLI recorded in the corpus ledger, and read-only access to matching
GitHub Actions metadata. The score and publication ports need no GitHub
mutation permissions. The following preflights and score can run without
inference. The two measured commands start new provider calls.

```sh
# From quality/bugbot/evidence/issue-950/ev07-shadow
shasum -a 256 -c frozen-corpus.sha256
shasum -a 256 -c frozen-review.sha256
node corpus.cjs "$campaign/planner-canary" --preflight
for id in U1 U2 F1 F2 S1 S2 X1 X2 M1 M2 P1 P2 J1 J2; do
  node review.cjs "$campaign/fixtures/full-review/$id" "$id" 1 "$campaign/preflight-$id.jsonl" --preflight
done
node corpus.cjs "$campaign/corpus-v3"
node full-review.cjs "$campaign"
python3 score-review.py "$campaign/full-review" \
  --checkouts "$campaign/fixtures/full-review" \
  --public-attempts "$campaign/review-attempts.jsonl" > "$campaign/review-score.json"
```

The public ledger records admission, timings, terminal decisions, anchor and
receipt metadata, and reason codes. It omits raw model and provider bodies.
The audit recalculates each cited Git range from its original blob. The
application validates official and CI evidence against the sources it
actually delivered. Missing provider-reported usage stays missing.
