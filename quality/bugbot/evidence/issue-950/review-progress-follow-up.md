# #950 review progress follow-up

The [completed review of `53b21735`](https://github.com/vypdev/copilot/actions/runs/43467621545/job/132063831481)
validated all 106 partitions in two frames. It reported 37 findings, with 20
inline findings and 17 in overflow. The [next review of
`7ead27b81`](https://github.com/vypdev/copilot/actions/runs/43515411649/job/132196027792)
last observed 37 of 109 validated partitions. GitHub marked the job failed
because its self-hosted runner lost communication. The [presentation
check](https://github.com/vypdev/copilot/runs/132197143730) stayed in progress.
The previous verified card on the PR survived. The [Commit
run](https://github.com/vypdev/copilot/actions/runs/43515390976) completed on
that head and [updated the issue
card](https://github.com/vypdev/copilot/issues/950#issuecomment-6732557685)
with 113 requirements, a 58% estimate and a complete assessment link.

The new read path authenticates that issue card through GitHub's closing
references, trusted ownership, the scope marker and the PR destination.
It links the assessed SHA from the canonical PR card after reconciliation.
The approval observer uses a completed native event to recover an interrupted
attempt's exact check while keeping its last observation. It neither
submits a review through this recovery path nor adds an approval receipt.
The aggregate PR comment's live block still depends on a shared writer
across analysis and manual reconciliation routes. The check carries the live
view until that writer is available.

## Disposition of the 20 inline findings

The descriptions below scope the follow-up to the affected source. They are
not qualification results for the historical experiments.

| Review finding | Disposition |
|---|---|
| [Coverage fixture validates freeze after invoking a control](https://github.com/vypdev/copilot/pull/951#discussion_r4569014158) | Archived #895 runner. Verify the preregistered checksums and use a clean pinned checkout before any historical replay. Its runner is frozen. |
| [Isolation in the historical pagination control](https://github.com/vypdev/copilot/pull/951#discussion_r4569014164) | Archived fixture. Run only the trusted pinned fixture in an isolated environment. This fixture did not become an installed verification adapter. |
| [Same-line Python assignment](https://github.com/vypdev/copilot/pull/951#discussion_r4569014168) | Limitation of the experimental causal analyzer. It is outside the installed verifier. Preserve the original replay and require a successor regression before reusing the analysis. |
| [Cumulative token telemetry in an early shadow runner](https://github.com/vypdev/copilot/pull/951#discussion_r4569014174) | Historical. The installed runner records telemetry without using it as a cutoff, including for resumed cumulative values. |
| [Missing session IDs in the two-case runner](https://github.com/vypdev/copilot/pull/951#discussion_r4569014253) | Historical. A successful process exit is insufficient evidence of two independent sessions. Require actual, distinct session IDs in a future replay. |
| [Conditional Python field initialization](https://github.com/vypdev/copilot/pull/951#discussion_r4569014270) | Experimental analyzer limitation. Future reuse needs an execution-path regression. |
| [Rebound Python decorator](https://github.com/vypdev/copilot/pull/951#discussion_r4569014277) | Experimental analyzer limitation. Future reuse needs binding evidence at the decorator. |
| [OpenCode record boundary](https://github.com/vypdev/copilot/pull/951#discussion_r4569014289) | The installed catalog's indentation passed the old parser. The successor parser reads through to the next model header and covers a nested unindented record. |
| [Inherited abstract Python method](https://github.com/vypdev/copilot/pull/951#discussion_r4569014296) | Experimental analyzer limitation. Future reuse needs an inherited-method regression. |
| [Legacy verifier concurrency](https://github.com/vypdev/copilot/pull/951#discussion_r4569014309) | Historical runner limitation. Its frozen ledger cannot establish the preregistered global concurrency cap. |
| [Two-case runner accepts unpinned input bytes](https://github.com/vypdev/copilot/pull/951#discussion_r4569014317) | Historical runner limitation. Verify the canonical frozen input digest before dispatching any repeat. |
| [v3 SDK revision not authenticated by the runner](https://github.com/vypdev/copilot/pull/951#discussion_r4569014329) | Historical runner limitation. Any repeat must authenticate its exact SDK source before imports. |
| [Publication after becoming a draft](https://github.com/vypdev/copilot/pull/951#discussion_r4569014337) | Fixed before this follow-up in `7ead27b81`. The enforced workflow control asserts no finding or receipt after the draft transition. |
| [Codex has no turn deadline](https://github.com/vypdev/copilot/pull/951#discussion_r4569014349) | Intentional verifier contract. Explicit cancellation remains available. |
| [Root syntax in the first #895 runner](https://github.com/vypdev/copilot/pull/951#discussion_r4569014358) | Historical. The later Git replay added root normalization and exact-name instructions. |
| [Legacy SDK root accepted without revision check](https://github.com/vypdev/copilot/pull/951#discussion_r4569014371) | Historical runner limitation. A future repeat requires an authenticated selected SDK checkout. |
| [Brokered verifier bypasses a turn deadline](https://github.com/vypdev/copilot/pull/951#discussion_r4569014379) | Intentional verifier contract. Explicit cancellation remains available. |
| [Late Python import accepted earlier in the module](https://github.com/vypdev/copilot/pull/951#discussion_r4569014390) | Experimental analyzer limitation. Future reuse needs an import-order regression. |
| [Mixed workspace and causal search targets](https://github.com/vypdev/copilot/pull/951#discussion_r4569014403) | Historical chain prototype limitation. Future reuse needs mixed-target coverage. |
| [Missing EV-07 score permits dispatch](https://github.com/vypdev/copilot/pull/951#discussion_r4569014413) | The guarded reproduction entrypoint requires the passing 174-case score before dispatch. The original runner and its checksum remain intact. |

The previous review also recorded 17 overflow findings. Its count does not
establish an individually published finding or a resolution for any of
those 17 items.

## Deterministic controls

```sh
pnpm exec jest --runInBand bugbot_commit_progress_link_policy github_bugbot_interrupted_check \
  load_bugbot_reconciliation_snapshot_use_case synchronize_bugbot_review_presentation_use_case \
  pull_request_approval_action
node --test quality/bugbot/evidence/issue-950/ev07-shadow/launch-full-review.test.cjs
```

The controls include both exact and previous assessment SHAs, missing and
foreign linkage, duplicate issue cards, failed native recovery, wrong
attempts, a newer same-head retry, and dry-run. The EV-07 test uses a
recording launcher and makes zero model calls.
