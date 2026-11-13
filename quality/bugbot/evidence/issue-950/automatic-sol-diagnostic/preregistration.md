# Automatic chain replay with GPT-6.1 Sol

This diagnostic measures whether the automatic #913 source chain reproduces
three supported H1 refutations and three supported H2 confirmations from
the prepared-chain diagnostic. A result of 3/3 on both trees supports a
separate trial on a newly reserved pair. Any lower count leaves that
advance criterion unmet. Production activation remains disabled.

The model-free control takes the original typed requests from the
[partial diagnostic ledger](../partial-diagnostic/trials.jsonl), using
trials `2a5db66833bd8aa5` (H1) and `17b68ca028cacc59` (H2). Those are
the provenance IDs in the [prepared packets](../prepared-diagnostic/packets.json).
Both requests ask for `taskQuantity`, `precision` and `@submit`. The
chain runner uses each request verbatim in the simulated first reply.
The initial packet contains the frozen candidate and pinned diff. The
fixture's hand-selected initial source ranges are excluded, so every Git
source receipt in the second packet comes from automatic retrieval. The control verifies the automatically retrieved form, parser and
decoder against each pinned Git tree, plus their exact ranges, receipt
bindings, unchanged candidate and anchor, and the complete second-packet
budget. No evaluator outputs or manually selected snippets are inserted.
The packet snapshot includes the measured source-retrieval telemetry
from that control. A fresh control can produce a different elapsed-time
value. Measured calls use the exact frozen prompt bytes.

[Automatic packets and hashes](packets.json) · [Model-free control](prepare.cjs)

The [manifest](manifest.json) fixes the model, low effort, SDK, CLI,
limits and six dispatch slots. The runner uses the prepared diagnostic's
verdict schema, closed transport, dry-run ports and three workers.
It makes one second call per slot with the frozen packet and no model
first call. Both failures and unknown usage consume a slot. There are
no retries or replacement calls. The 42-second call and 90-second case
ceilings apply as in the prepared diagnostic. Limits are 32,768 gross
input and 4,096 output tokens, 15,500 packet bytes and 21,500 prompt
bytes.

The six prepared references are the published Sol `complete` results
for the same revision and repetition, preserving their existing
scores. Score each automatic slot only when it returns the expected
verdict with a valid receipt covering the decisive parser span, exact
selected anchor, known usage within budget and zero write attempts.
The oracle is loaded by the evaluator. Inconclusive reasons and next
steps produce only the prepared diagnostic's bounded premise codes and
digests. Report those codes against the exact delivered ranges.

The comparison uses the same candidates and configuration. The
automatically generated package has its own source ranges, operation,
receipts and follow-up telemetry, so a difference cannot isolate any
one change in the prompt. The six calls test this known pair. Evaluation
on a newly reserved pair is a separate gate.

Run from the repository root with the pinned SDK and CLI.

```sh
d=quality/bugbot/evidence/issue-950/automatic-sol-diagnostic
node "$d/prepare.cjs" "$KNOWN_SUBJECTS" > /tmp/automatic-sol-control.json
node "$d/run.cjs"
node "$d/run.cjs" "$NEW_JOURNAL" "$PREREGISTERED_SHA"
python3 "$d/score.py" "$NEW_JOURNAL"
```

The measured command requires the clean preregistered checkout and a new
journal path. It dispatches six model calls.
