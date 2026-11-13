# EV-07 — Installed source and CI shadow profile

The [plan](plan.json) freezes Codex Luna detection and Sol verification at
`xhigh` on the installed implementation. Production verification remains
disabled. No evaluated pull request has a GitHub mutation port. The corpus
runner uses a fresh empty local Git workspace without remotes. Full review uses local, detached Git
snapshots and the normal preparation and shadow projection. The baseline is
the ordinary dry-run publication of the same prepared candidates before
verification. Paired decisions share detection to isolate the installed gate.

Run the unchanged 174-case independent detector corpus using the existing
benchmark prompt, agent port and evaluator. Store one attempt per case with its
corpus index and report completion independently of the observed score.
Missing or invalid responses cannot pass. Model calls are scheduled with
six workers, with no outer retry or model substitution. A planner canary must pass before model dispatch. Cost and usage, when
available, are telemetry.

Reuse the frozen v4 full-review cohort, its evaluator-only premise matchers
and three repetitions. Check each tree and comparison before calls. Require
three baseline alerts over two historical premises, at least two strictly
better paired repetitions and no regression in the third. Require every
positive at its exact anchor, grounded verdicts, zero writes and added
subject p95 at most 90 seconds, assessed after the run. A failed or
incomplete review cannot count as clean. Local oracles, expected findings
and comparison scores stay out of model input. Retain unavailable subjects,
aborted trials and missing evidence explicitly. A failure of any mandatory
gate means the exact profile does not qualify. Stop admitting further
qualification-only phases once an independent gate definitively fails and
report all unexecuted slots. A stopped campaign cannot be used to claim
recall, improvement or latency across the unexecuted cohort.
