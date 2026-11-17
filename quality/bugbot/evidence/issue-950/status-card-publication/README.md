# Shared Bugbot status-card publisher control

The native Check Run observation has a closed machine representation alongside
the visible progress. The observation can be read only against its authenticated
attempt identity. It carries neither finding content nor a terminal review receipt.

The publisher control composes a structured observation with the previous
verified card. Its recording writer serializes the read, comparison recheck and
write. Keep that boundary when binding the trusted GitHub publication job.
The tests use no GitHub writes and make zero model calls.

```sh
node --test quality/bugbot/evidence/issue-950/status-card-publication/publisher.test.cjs
pnpm exec jest --runInBand bugbot_progress_check_observation_policy github_bugbot_review_progress_adapter github_bugbot_interrupted_check
```

| Control | Expected effect |
|---|---|
| Existing verified review | Show progress above the previous bytes and retain the comment ID |
| First review | Show a pending card without verification or approval markers |
| Push during read | Discard the old publisher and retain the previous verified result |
| Concurrent recheck | Read the latest state after admission, keep progress and refresh the verified section |
| Late retry or lower same-attempt sequence | Preserve the newer version |
| Interrupted native run | Keep the last dated observation and link the run |
| Missing terminal projection | Keep the existing card |
| Dry-run or rejected provenance | Zero writes |

The simulator authenticates the observation using the same marker decoder as
the native Check adapter. It supplies serialization through an in-memory port.
Installation of the GitHub publication lane, integration of every existing
writer and the terminal handoff are pending.

## Native observation at `282747046`

Commit updated the linked issue card at the exact comparison under review.
The repository's production link selector accepted that card in a read-only
replay. The card reported 58% estimated progress and listed 4 implementation
items and 72 items for verification or clarification. [Commit assessment](https://github.com/vypdev/copilot/issues/950#issuecomment-6732557685)

The native review terminated after 8 of 110 partitions were validated and
three partition retries were recorded. The bounded agent diagnostic was
`run/process, exit 1, unclassified`. GitHub retained the same Check Run ID
and the previous verified PR card. Its closing summary replaced the progress
display. The new Check details control reproduces that transition with
recording ports and retains the exact dated observation beside the summary.
The live backlink on the PR card requires a successful terminal review.
[Native run](https://github.com/vypdev/copilot/actions/runs/44180227603)
[Completed Review check](https://github.com/vypdev/copilot/runs/134383641200)
