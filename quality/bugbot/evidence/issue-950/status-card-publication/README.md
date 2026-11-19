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
At the time of this control, workflow installation and the terminal handoff
were pending.

## Native workflow integration

Use the application and GitHub adapter tests to replay both sides of the
handoff. They exercise the current PR and workflow-run facts, full comment
reads and the existing terminal publisher. Completion requires the actual
publication step to succeed. A successful workflow with a skipped step
does not acknowledge the handoff.

```sh
pnpm exec jest --runInBand bugbot_status_card synchronize_bugbot_review_presentation_use_case
pnpm run validate:workflows
```

The delayed progress control publishes a terminal projection, receives a
queued observation for the same attempt and keeps the terminal card. The
exact-head retry can show progress again. The recheck control refreshes the
verified projection on the same comment while retaining the native review
block. The superseded and write-blocked controls record no comment writes.

### Packaged action

Run the built GitHub Action against a loopback-only provider with synthetic
credentials and event data. The harness records all writes attempted against
the test provider and makes zero requests to GitHub.

```sh
pnpm run build
output="$(mktemp -d)"
node quality/bugbot/evidence/issue-950/status-card-publication/packaged-canary.cjs \
  build/github_action/index.js "$output"
cat "$output/results.json"
```

The canary covers the progress counters and next action, preservation of the
previous review, identical observations, independent rechecks, terminal
publication, delayed progress, a replaced attempt and its retry, a push
between read and write, and a failed comment update. It also distinguishes a
complete empty conversation, which can create the first card, from an
unavailable conversation, which must preserve the existing card with no write
attempt. On `03f8e6e33`, the latter case attempted to create a new card when the
provider returned an absent pull request in the conversation response.
The legacy format starts with the same-PR status marker. The canary preserves
that prior body during progress and then upgrades the same comment ID with a
current terminal projection.

The worker reads both check fields used by GitHub, authenticates the native
attempt, and accepts either its exact workflow-attempt URL or its exact
native Check Run URL. The check from the failed review of `d03154b90` stored
the structured progress in `output.text` and linked its Check Run URL.
[Native check](https://github.com/vypdev/copilot/runs/134520640034)

The workflow requires installation on the default branch before a hosted
publication can be accepted. During branch review, the Check retains live
progress and the existing terminal route remains available.
[Default-branch workflow requirement](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch)

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
