# Cursor routing, packaged rollback, and #951 self-review

The GitHub Action now checks the raw verification mode and explicit verifier
provider before routing. A padded value such as `" cursor "` produces an input
error telling the operator to remove whitespace. The application and workflow
agree on the accepted value, and the workflow can keep its existing conditional
credential delivery. The regression tests cover native Action inputs and the
JSON input map.

## Rollback in the package

Run the following from the repository root. The fixture starts a
loopback GitHub API with synthetic data and rejects every method other than
GET. It exercises the actual Action bundle through its normal executable
entrypoint and, separately, with explicit authority passed to the exported
entrypoint. A synthetic head change stops assessment publication before any
write. The control uses the recommendation policy so it can observe the
approval decision without submitting a review.

```sh
node quality/bugbot/evidence/issue-950/cursor-rollback-shadow/packaged-rollback.cjs build/github_action/index.js
```

| Entry and evidence | Decision |
| --- | --- |
| Normal executable, disabled mode, clean same-head status card and an old receipt | `recommend-mode` |
| Normal executable, disabled mode, no status card | `bugbot-missing` |
| Exported entrypoint, explicit disabled rollback authority, old receipt | `bugbot-missing` |
| Exported entrypoint, explicit disabled rollback authority, current receipt | `recommend-mode` |

The default packaged entry supplies no rollback authority and does not
activate the policy receipt fence. The clean status card passes that gate.
A deployment that explicitly passes disabled rollback authority would still
need a current receipt. The packaged producer builds receipts only in
`enforced`, so that combination would leave approval pending until a current
receipt exists. This is a conditional producer and consumer gap. No observed
deployed route activates that combination. The prior self-reviewed bundle and
the Cursor correction produced the same four decisions. [Control results](packaged-rollback.json)

## Shadow self-review

The [frozen plan](self-plan.json) uses the patched implementation
`c23a66774b8754577f227e886c597678987b36bc`, the real #951 comparison,
Luna and Sol at `xhigh`, shadow and dry-run. The scope excludes generated
bundles and historical experiment evidence, as in the prior self-review.

The first two invocations failed during source verification before invoking
the detector. GitHub enumerated all changed paths but supplied an empty
patch and zero counts for 26 modified files in the review scope.
The pinned Git comparison showed actual edits. The [runner patch](self-review.patch)
supplies only the missing counters from those same objects. The normal
framed adapter still checks the complete provider path inventory and
reconstructs and verifies each recovered patch. No review limits were
changed, and the retained scope remained 121 files. Both blocked
preflights recorded zero write attempts. [Preflight records](self-preflight.json)

Luna completed all 13 detection partitions and prepared five candidates.
Sol investigated each candidate in a fresh session, with up to two running
at once. The invocation records attest `xhigh` and read-only mode for all
13 detector calls and 43 verifier turns. Detection and preparation took
30 min 39.8 s, verification took 12 min, and the workflow returned its
simulated decision after 42 min 57.5 s. There were no technical failures,
no write attempts, and no changes to the pinned checkout. The evidence
audit reread all 87 Git citations from the fixed objects and matched their
blob IDs, ranges and excerpt hashes.

| Candidate | Sol verdict | Time / turns | Decisive evidence or gap |
| --- | --- | --- | --- |
| Receipt after rollback | Confirmed for explicit trusted authority | 229.7 s / 10 | Receipt producer requires `enforced`; the approval consumer with authority requires the current mode and generation. The packaged control reproduces the conditional block and confirms that the normal entry uses the status card. |
| Evidence for order claims | Confirmed at source level | 172.4 s / 5 | The closing check in `investigate_bugbot_shadow.cjs:34–60` relies on wording to recognize that the claim concerns order. No live bad verdict was observed. |
| Aggregate SDD test budget | Confirmed at source level | 99.5 s / 5 | The aggregate at `bugbot-analysis-publication-and-autofix.md:3921` omits the separate thirteen-case inventory. This finding concerns the stated total. |
| Receipt for a complete review with findings | Inconclusive | 164.0 s / 9 | The session could not establish an executable route supplying the required trusted authority. The bundle read exceeded the Git evidence limit. |
| Draft change during review | Confirmed for non-framed reviews | 447.9 s / 14 | `bugbot_review_freshness.ts:25–44` checks identity but omits draft state in this branch. Sol requested three closure repairs before issuing the scoped verdict. |

The usual dry-run path returned five findings. The separate verification
projection kept four and marked the review incomplete because one candidate
was inconclusive. No result was published. Luna did not emit the Cursor
candidate from the earlier [self-review](../ev07-runtime-shadow/results.md).
The targeted regression tests are the independent check for that correction.

The [attempt ledger](self-attempts.jsonl) records the prepared candidates,
admitted invocations, the simulated decision, timings and validated citation
receipts. It omits raw model responses and prompts. Only the packaged
rollback control is an independent execution of the rollback behavior;
the other model verdicts are reported as source-level observations.

## Reproduction and validation

Use the installed dependencies of the implementation checkout and a clean
detached checkout of the frozen head, with the frozen base object present.
With repository read access and provider access, reconstruct and verify the
runner before starting a fresh shadow dry-run:

```sh
area="$PWD/quality/bugbot/evidence/issue-950"
evidence="$area/cursor-rollback-shadow"
runner=$(mktemp -d)
cp "$area/ev07-runtime-shadow/self-review.cjs" "$evidence/self-plan.json" "$runner/"
patch "$runner/self-review.cjs" < "$evidence/self-review.patch"
(cd "$runner" && shasum -a 256 -c "$evidence/self-frozen.sha256")
node "$runner/self-review.cjs" "$sdk_checkout" "$pinned_checkout" \
  "$runner/self-plan.json" "$runner/attempts.jsonl"
```

The implementation commit passed 70 focused tests, type checking, the SDD
and documentation checks, Graphify and the pre-commit build, lint and test
suite (18,388 passing tests). The measured invocation ran with production
verification disabled. #951 remains a draft.
