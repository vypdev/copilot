# #892 Sol on-demand viewport evidence

This known-case replay follows the
[prepared-packet control](../viewport-sol-diagnostic/results.md) at
`9debb2e4473c46cc932a172bbd5df7ddcc0a7034`. It uses GPT-6.1 Sol
at low effort on the same seeded candidates and unchanged scoped diffs.

| Tree | Head | Git tree | Candidate |
| --- | --- | --- | --- |
| N1 | `55174696e97a4c8b424c7f57d7da7a61e4b157fd` | `0d5efca673329a8a28d1b9e93a46b564edcbe285` | `c-892-5aeaf4db18c0ba79` |
| N2 | `c654e501593ddb01446c6b37873a5b094624dd93` | `263e61f6c8d518657a3e160774f0af8f1f3f49d9` | `c-892-02a446bb39060f51` |

The anchor is right-side line 107 of
`packages/core/src/components/navigation-overflow.ts`. The initial
packet is the historical candidate, diff and receipts S2–S4.
Preflight checks the exact omitted selector and listener lines are
absent from the entire prompt. The code can refer to its own classes and
handlers, but the instructions supply no search terms, decisive range
or expected outcomes. The [Chromium observations](../reserved-navigation-diagnostic/browser-control.jsonl),
[oracle](../detector-verifier-diagnostic/oracle.json) and scoring ranges
are reserved to the evaluator.

## Arms and execution

All arms use byte-identical first prompts and schemas within a tree.
The first response is either an application-bound verdict or one
typed `readBlob` or `searchTree` request against the reviewed head.
The [control attestation](runner-control.json) freezes the ordered
slots, first prompt and schema hashes and initial receipt identities.

| Arm | After a first-call verdict | After a first-call request |
| --- | --- | --- |
| Fixed | Validate and finish | Log it and finish as an unresolved request |
| Repeat | Validate and finish | Apply the common admission check and return the denial or a withheld status without new sources |
| On demand | Validate and finish | Apply the same admission check and execute an admitted request using the common pinned Git adapter |

The common adapter performs a single bounded line read or scoped name
or literal search. The runner forwards the exact typed request and uses
its returned ranges, without supplementing them. It passes the initial
packet, the status and every valid new fragment in adapter order. Repeated
receipt IDs are deduplicated. An over-budget full packet fails delivery.
The final-only verdict schema and validator come from the prepared
control. The allowed alias list reflects exactly the delivered receipts.
The application validates membership and binds the result to the pinned
candidate, operation, revision, tree and anchor. No second request is
allowed.

Run three repetitions per tree and arm, 18 slots. The order is N1 then
N2 and rotates fixed, repeat and on-demand within each repetition.
Every call is a fresh closed session. There are at most two calls and
zero retries per slot, for at most 30 calls overall. Use the pinned
SDK and CLI, a 42-second provider deadline per call, and the shared
90-second, 32,768 gross input token and 4,096 output token ceilings
including both calls and retrieval wall time. Require known usage and
the inherited 7,400-input-token reservation before a second call.
The complete packet and rendered prompt are limited to 15,500 and
21,500 bytes. An individual typed request is limited to 2,048 bytes.
Common source limits include 4 seconds, 80 opened files, 512 KiB read,
4,096 tree entries, 16 matches, 9,000 evidence bytes, five new receipts,
and 80 lines and 4,400 bytes per fragment. Log every attempt, including
failures, timeouts and unknown usage, with zero write attempts.

Before measurement, mocked requests exercise the same admission in
both follow-up arms and prove only the on-demand packet adds code.
The controls cover a direct verdict, a denied base request, a foreign
citation, a receipt from another tree, a second request and the
write trap.

## Scoring

Track whether a request was made and admitted, whether the adapter
returned the missing link, whether those receipts reached the model,
and whether the final response cited them. The newly retrieved,
delivered and cited sources must cover viewport selection at controller
lines 21–25 and listener wiring at lines 26–29. A verdict must also cite
the prepared control's evidence of post-drag state, the fresh click,
and the item placement and dispatch decision in `tabs.ts`.
A supported answer uses the expected verdict and causal states,
preserves the anchor, proves the shared budget and has no write
attempts. Audit each bounded reason against the fixed source. The
original must clear suppression on the new `mousedown` before the
click emits selection. The mutant must preserve it on `mousedown`,
leading to consumption of the click and a return before selection.
Bind the audit to the reason digest.

Distinguish an accepted inconclusive with a named premise from a
conclusive reply with missing material evidence. Preserve direct
verdicts and unresolved requests in the controls. The on-demand arm
passes only with the required link retrieved, delivered and cited
in all six slots and 3/3 correct refutations on N1 plus 3/3 correct
confirmations on N2. Report the earliest missing stage separately
for each failed on-demand trial. This replay is a known-case
diagnostic. A pass supports designing a reserved case with a different
causal chain.

## Reproduction

Prepare isolated subjects with the
[fixture protocol](../reserved-navigation-diagnostic/preregistration.md).
From this directory, validate the checksums and run the deterministic
controls before any calls.

```sh
shasum -a 256 -c frozen.sha256
node run.cjs /absolute/path/to/subjects
```

With the pinned SDK and CLI from the
[transport manifest](../complete-verdict-diagnostic/manifest.json),
run from a clean preregistration checkout. Set `BUGBOT_PILOT_SDK`,
supply a new output directory and pass the full preregistration SHA.
The first command runs the 18 slots.

```sh
node run.cjs /absolute/path/to/subjects /absolute/path/to/new-output "$freeze"
node run.cjs /absolute/path/to/subjects --audit-receipts /absolute/path/to/new-output/trials.jsonl
python3 score.py /absolute/path/to/new-output/trials.jsonl causal-review.json
```
