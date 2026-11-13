# #892 Sol verdict control with viewport identity

This is a six-call follow-up to the
[complete-packet control](../complete-verdict-diagnostic/results.md)
published at `d8fad2e6189cecb8bf181b9451c8195c1798e560`.
Sol previously scored 2/3 refutations on N1 and 3/3 confirmations on N2.
The inconclusive N1 trial identified a missing link between Overview's
new mouse event and the viewport listener.

| Tree | Head | Tree object | Seeded candidate |
| --- | --- | --- | --- |
| N1 | `55174696e97a4c8b424c7f57d7da7a61e4b157fd` | `0d5efca673329a8a28d1b9e93a46b564edcbe285` | `c-892-5aeaf4db18c0ba79` |
| N2 | `c654e501593ddb01446c6b37873a5b094624dd93` | `263e61f6c8d518657a3e160774f0af8f1f3f49d9` | `c-892-02a446bb39060f51` |

Both anchors remain right-side line 107 in
`packages/core/src/components/navigation-overflow.ts`. Both prompts keep
their original scoped diff, candidate and four evidence aliases. Replace
only S1, extending its source range from 26–32 to 21–32. These lines
include `update` selecting the host's `.bar` as the viewport and
attaching the `mousedown` listener to that element. The application
checks the receipt against the pinned blob, exact text, range, tree,
candidate and operation. The [runner control](runner-control.json)
records old and new receipt IDs, packet and prompt hashes, schema hash,
and the pinned identity. The new prompt bytes must equal the previous
prompt with exactly the serialized S1 object replaced. The original
schema and final-verdict contract are reused byte for byte.

The [expected outcomes](../detector-verifier-diagnostic/oracle.json)
and [Chromium observations](../reserved-navigation-diagnostic/browser-control.jsonl)
are evaluator inputs. The historical packages, ledger and scores remain
frozen.

## Execution

The [manifest](manifest.json) fixes the sequential order. Run three
repetitions on N1, then three on N2. Use GPT-6.1 Sol, low effort, the
same pinned SDK and CLI, and a fresh, closed, one-call session for each
trial. The historical transport and runner impose the same 42-second
provider deadline, 90-second case budget, 32,768 gross input tokens
including cached input, 4,096 output tokens, 15,500 packet bytes and
21,500 prompt bytes. There are six attempts total, zero retries and no
read rounds. Dry-run publication ports fail if invoked. The ledger
retains failed, expired and unmetered attempts, with no replacement
calls. Detection and retrieval are outside this matrix.

## Acceptance and scoring

Both the supplied and cited Git evidence must cover the full original
range criteria for the drag and outside release, fresh click and
selection decision in `tabs.ts`. Also require controller lines 21–25
for viewport identity, and the rendered anchor and tab button under
`.bar` with their click bindings in `tabs.ts` lines 108–111 and 115–119.
The historical ranges must fail the new viewport identity check even
though they cover the listener and handler. The deterministic control
also removes each necessary fragment from the expanded package and
checks that the corresponding link is no longer established.

A correct trial must use valid receipt aliases and the bound anchor,
match the expected verdict and all three causal states, cover all
required ranges, prove the budget and record zero write attempts.
Audit the answer's bounded `reason` against the source after the calls.
For N1, it must attribute clearing to the new `mousedown` before the
item click is processed and connect that ordering to selection
dispatch. For N2, it must attribute retention to the new `mousedown`
and connect consumption in the click handler to the early return before
selection emission. Record a pass or fail, the causal observation and
the digest of the reviewed reason. A correct label with a contradictory
or missing causal explanation fails.

Report all six attempts and distinguish contract rejections, missing
citations, valid inconclusives, wrong judgment and causal explanation
failures. The control passes only with three correct N1 refutations and
three correct N2 confirmations. The earlier 2/3 and 3/3 are historical
scores under the prior coverage rule. The comparison cannot establish
that the additional lines alone caused a change across these small
samples.

## Reproduction

Prepare the pinned checkouts with the
[reserved navigation protocol](../reserved-navigation-diagnostic/preregistration.md).
Run the model-free checks from this directory.

```sh
shasum -a 256 -c frozen.sha256
node run.cjs /absolute/path/to/subjects
python3 score.py --control
```

To repeat the measured calls, check out the preregistration commit
cleanly, set `BUGBOT_PILOT_SDK` and use the CLI from the historical
manifest. Pass a fresh output directory and the full preregistration
commit SHA. This consumes six calls.

```sh
node run.cjs /absolute/path/to/subjects /absolute/path/to/new-output "$freeze"
python3 score.py /absolute/path/to/new-output/trials.jsonl causal-review.json
```
