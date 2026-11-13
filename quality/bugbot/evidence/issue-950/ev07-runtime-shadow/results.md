# SQLite evidence and EV-07 repeat

**The profile remains unqualified.** The measured implementation was
`94843e73af4340c147eda9081804694f06d07364`. The detector was Luna and the
verifier was Sol, both at `xhigh`. The run used shadow, dry-run and
fail-on-call write ports. Production verification remains disabled.

## SQLite

The [model-free control](runtime-canary.json) bound the local runtime
measurement to the Git pin and delivered official source with one lookup.
Python 3.14.6 on the pilot host linked SQLite 3.53.3. Its source ID agrees with
the [release notes](https://sqlite.org/releaselog/3_53_3.html) and the
[upstream manifest](https://github.com/sqlite/sqlite/blob/92a6c5c3636faa021ecc3be5403a00f50f65eda7/manifest.uuid).
These receipts describe the measured host. Historical hosted CI still has no
accredited linked SQLite version.

| Frozen #859 case | Ordinary decision | Shadow verdict | Decisive evidence |
| --- | --- | --- | --- |
| X1 original | Finding | Refuted | The task schema declares the unique pair. The initialization loop and relevant migration branch install it in the demonstrated order. Sol cited [SQLite's index check](https://github.com/sqlite/sqlite/blob/92a6c5c3636faa021ecc3be5403a00f50f65eda7/src/fkey.c#L229-L233). |
| X2 mutant | Finding | Confirmed at line 8 | The profile foreign key targets a different pair from the unique index. Enforcement reaches the profile backfill. Sol cited [SQLite's foreign-key resolution](https://github.com/sqlite/sqlite/blob/92a6c5c3636faa021ecc3be5403a00f50f65eda7/src/fkey.c#L884-L897) and the pinned code. |

Both verdicts agree with the independent [v4 controls](../v4/preregistration.md#fixed-cohort-and-controls).
X2 previously finished inconclusive after 12 turns and 322 seconds. It
confirmed in seven turns and 198 seconds with the accredited source.

## Latency and qualification

The [frozen plan](plan.json) keeps the prior cohort, scorer and thresholds.
It reuses the [passing 174-case corpus measurement](../ev07-shadow/corpus-score.json)
because the detector implementation, configuration and corpus are unchanged.
The repeat measured fresh detection and verification on the paired
repository cases.

| Comparable positive case | Previous added time / turns | This repeat added time / turns |
| --- | ---: | ---: |
| U2 | 146.77 s / 5 | 70.03 s / 3 |
| F2 | 137.24 s / 6 | 149.63 s / 8 |
| S2 | 846.79 s / 18 | 421.36 s / 12 |
| X2 | 322.07 s / 12 | 197.88 s / 7 |
| M2 | 84.20 s / 4 | 44.98 s / 2 |

Each row uses the same frozen comparison, with an independently generated
candidate. The differences are observations from these trials. They do
not isolate a causal effect of the initial excerpt.

Ten reviews completed and 32 remained unstarted. All five observed positives
retained their exact anchors. The shadow projection removed the historical
X1 false positive. One off-target alert remained in both arms under the
frozen matcher. One reproduced historical premise and an incomplete set of
paired repetitions are insufficient to qualify a false-positive reduction.

Five of the ten observations exceeded 90 seconds. With 42 planned slots,
three observations above the threshold already make the full-cohort p95
fail. The scheduler stopped admitting reviews once that was established and
let every open investigation finish. No review session was interrupted.
The measured checkouts remained unchanged, 93 Git citation ranges were
independently rechecked and there were zero GitHub mutation attempts.

[Scheduler ledger](review-slots.jsonl) · [Review attempts](review-attempts.jsonl) · [Machine score](review-score.json) · [Deterministic CI](https://github.com/vypdev/copilot/actions/runs/43289921901)

## Bugbot reviewed its own pull request

The normal Bugbot composition reviewed the real #951 comparison from
`b3952f686a55a9b4207e1a23c64be8344e8df5d5` to `94843e73af4340c147eda9081804694f06d07364`.
It used the installed GitHub read ports, a detached checkout, the existing
draft-review option in the pilot, and shadow with dry-run. The frozen scope
excluded 538 generated bundle and historical evidence paths. The remaining
119 paths produced 13 completed source-bound partitions. Luna made 14
admitted calls. Sol verified the two prepared candidates in parallel.

| Candidate | Shadow verdict | Added wall time / turns | Decisive evidence or gap |
| --- | --- | ---: | --- |
| Cursor provider with surrounding whitespace | Confirmed | 202.65 s / 7 | The workflow compares the raw value while the application trims it. The workflow can omit its supplied key when no other branch of the credential condition applies. A local control confirmed the normalized provider. [Workflow gate](https://github.com/vypdev/copilot/blob/94843e73af4340c147eda9081804694f06d07364/.github/workflows/copilot_pull_request.yml#L111) · [Application parser](https://github.com/vypdev/copilot/blob/94843e73af4340c147eda9081804694f06d07364/src/application/policies/bugbot_shadow_configuration_policy.ts#L32-L46) · [Actions string comparison](https://github.com/actions/runner/blob/main/src/Sdk/DTExpressions2/Expressions2/EvaluationResult.cs#L228-L232) |
| Fresh receipt for approval after rollback | Inconclusive | 190.87 s / 9 | The producer guard and consumer fence support a conditional mismatch. The executable route that would supply trusted disabled authority remained unproved. Reading the 7,257,343-byte bundle returned `git-budget`. [Receipt guard](https://github.com/vypdev/copilot/blob/94843e73af4340c147eda9081804694f06d07364/src/application/usecases/steps/commit/detect_potential_problems_workflow.ts#L521-L532) |

Detection and preparation took 31m 54s. Verification took 3m 23s of
wall time. The dry-run decision finished after 35m 36s with 19 independently
rechecked Git citation ranges, zero GitHub mutation attempts and an
unchanged checkout. The shadow projection retained the Cursor finding
and recorded the evidence gap for rollback. [Self-review plan](self-plan.json) · [Self-review ledger](self-attempts.jsonl)

## Reproduce

Use the [v4 fixture procedure](../v4/results.md#reproduce) to recreate the
detached subjects under `$campaign/fixtures/full-review`. The exact
detector corpus score in the plan belongs in `$campaign/corpus-v3/corpus-score.json`.
On the implementation revision, prepare the existing runner with the
[frozen plan](plan.json) and the scheduler's small admission patch.
The patch adds a stop marker for a failed qualification gate and leaves
admitted sessions running.

```sh
area="$(git rev-parse --show-toplevel)/quality/bugbot/evidence/issue-950"
evidence="$area/ev07-runtime-shadow"
runner="$(mktemp -d "$area/.ev07-repeat.XXXXXX")"
cp "$area/ev07-shadow/review.cjs" "$area/ev07-shadow/full-review.cjs" "$runner/"
cp "$evidence/plan.json" "$evidence/runtime-canary.json" "$runner/"
patch "$runner/full-review.cjs" < "$evidence/scheduler.patch"
(cd "$runner" && shasum -a 256 -c "$evidence/frozen.sha256")
node "$runner/full-review.cjs" "$campaign"
python3 "$area/ev07-shadow/score-review.py" "$campaign/full-review" \
  --checkouts "$campaign/fixtures/full-review"
```

For the self-review use a clean SDK checkout at the frozen head, a detached
local Git checkout of the same head with its base available, and the
published [runner](self-review.cjs). Use a fresh private output path and a
GitHub CLI session with repository read access. Both runners block all
GitHub mutations from the review. The measured code and the CI check are
both on the frozen head. This later commit records evidence only.
