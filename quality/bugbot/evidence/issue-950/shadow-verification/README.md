# Bugbot shadow verification without usage or time cutoffs

The active shadow runner continues the investigation of each pinned finding
across successive evidence reads. Token counters in provider turn records
are optional. When Codex reports session totals, the record labels them
`session-cumulative`. A high, absent or cumulative value does not change
the next request, the available evidence or verdict validation.

Read-only Git and version-matched official-source requests use the same
source authorities as the real-PR shadow pilot. Search and receipt inventory
pages can be traversed in order. Full tracked files are available within
the existing Git process transport. The runner imposes no provider-turn or
investigation deadline. Explicit cancellation, provider failures, repository
authorization and byte-for-byte Git proof remain in force. Dry-run write ports
throw. The replay entry point maps SIGINT and SIGTERM to cancellation.

A genuine provider context-window rejection starts a fresh provider thread
for the same application investigation. The hypothesis, SHA, anchor and
receipt inventory survive. The new thread receives the pending evidence
leads and can recall any saved receipt or an exact subrange. The app only
accepts a citation after it has delivered the cited range. A finishing draft
pairs each material premise with its exact ranges. The verifier can continue
in the same session to complete an omitted citation. If a citation extends
outside a delivered receipt, the runner reports the requested and delivered
lines. The verifier can cite a supported subrange or read the missing lines
and cite the resulting receipt in the same session. For an order-dependent
premise the closure checks exact excerpts for both operations and the control
flow on every claimed route. A delivered runtime
receipt can directly select its official release with the original scope.
See the [closure replays](../shadow-closure-replay/results.md) for the
same-candidate reruns and independent line checks. A failure of the
fresh checkpoint is recorded as a provider failure.

## Run the controls

```sh
pnpm run test:bugbot-shadow-verification
```

The suite uses a bare Git fixture, simulated provider sessions and zero
GitHub writes or model calls. It verifies accepted verdicts with usage over
the former input and output ceilings, with usage absent, and after resuming
a session reporting cumulative totals. It also verifies a full file beyond
the former fragment threshold, investigation beyond the old turn and read
ceilings, context recovery, same-session range repair, rejection of an
undelivered or foreign receipt,
pinned tree checks, continuation beyond the former time limits, cancellation
and provider failure classification.

The range repair also covers the recorded Domus #28 closure. At reviewed SHA
`b9a2dfc8179128fb493ab49666c24967d308c979`, a draft cited lines 278–284 of
`frontend/src/presentation/domus-administration.ts` with a receipt for lines
280–298. A simulated replay on the same tree opened the draft for repair,
read lines 278–284 and accepted the replacement receipt in the same session.
The control kept the line 282 anchor and attempted zero writes.

The [historical shadow pilot](../shadow-real-prs/results.md) and its frozen
runner remain available for reproducing the original measurements. Use the
[historical fixture preparation](../shadow-real-prs/preregistration.md#reproduction)
to prepare the exact Git objects and official files for the successor. The
successor accepts the same fixture directory.

```sh
pilot=quality/bugbot/evidence/issue-950/shadow-verification
node "$pilot/run.cjs" "$LAB" --check
```

The integrated pilot supplies the transport from the effective Bugbot
configuration at the normal review boundary. Use the immutable revisions
linked by earlier reports to reproduce their standalone campaigns. The #950
production gate remains disabled.
