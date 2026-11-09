# Effective-origin and common Git diagnostic for #950

Production stays disabled. This is a frozen-candidate replay on the
successor dry-run runner. T1/T2 reuse the exact #918 pair, application diff,
anchor and initial source packet from the earlier tree diagnostic.
H1/H2 are the reserved TypeScript pair from #913. H1 uses the historical
Domus revision. H2 changes only the imported material parser. The same
initial UI evidence describes both reviews and omits the parser. The
runner loads only the frozen candidates, source evidence and reviewed
trees. Expected verdicts, expected locations and decisive spans live in
the evaluator. The parser and SQLite probes stay outside the verifier.

The runner verifies the recorded tree, comparison digest and blob slices.
H1/H2 exclusively use the common Git adapter, including typed name and
literal search and bounded blob reads. T1/T2 use the causal adapter when
applicable. The same frozen candidate and initial prompt bytes apply
across all three arms for each model, subject and repetition. A matched
triplet shares the comparison operation identity. Each invocation validates
citations against its own supplied packet.

Run 72 slots with GPT-6 Luna and GPT-6.1 Sol at low effort through the
frozen SDK/CLI. Use three workers per model and stable slot ordering.
The verifier is closed and starts in a fresh session without a checkout
or tools. No GitHub writer is exposed. The fixed arm stops on an evidence
request. The repeat and on-demand arms use the same admission rule and
second-call schema. Only on-demand retrieves new evidence. A final
response cannot change the anchor or request evidence again.

Count both rounds, retries and retrieval within 90 seconds, 32,768 gross
input tokens including cached tokens, 4,096 output tokens and three
provider calls per slot. Use a 42-second call ceiling and a 1.2-second
termination margin. Allow at most one retry after a timeout without a
completed turn or a tool event, only when the remaining budget permits.
Unknown usage, failures, expirations, missing terminals and every write
attempt remain in the journal and cannot pass qualification. The shared
Git budgets are 4,096 tree entries, 80 files, 16 matches, 512 KiB scanned,
96 KiB per blob, five receipts, 9,000 bytes of recovered evidence and
four seconds. Combined packets are limited to 15,500 bytes and complete
prompts to 21,500 bytes. No native CI artifact enters either packet.

Score recovery, decisive citation, verdict, exact frozen anchor and proved
budget separately. A recovered receipt must span the evaluator's decisive
range on the exact tree and head. The verdict must cite that receipt.
A model independently qualifies to enter full-review evaluation only
when all three H1 slots refute, all three H2 slots confirm at the exact
anchor, all six recover and cite decisive evidence within budget, and
the count of correct budget-proved decisions exceeds each control.
Any write attempt disqualifies that model. The #918 regression cannot
substitute for the held-out criterion. A replay result cannot activate
production.

## Reproduce

Prepare T1/T2 with the [previous tree lab](../tree-search/reproduce.md).
Fetch the Domus original and comparison base in
[prepare.py](prepare.py) into a disposable Git repository. Run:

```sh
diagnostic=quality/bugbot/evidence/issue-950/module-diagnostic
python3 "$diagnostic/prepare.py" "$DOMUS_GIT" "$RESERVED_SUBJECTS" > fixture-check.json
cmp fixture-check.json "$diagnostic/held-out.lock.json"
node "$diagnostic/parser-control.cjs" "$RESERVED_SUBJECTS"
node "$diagnostic/run.cjs" "$TREE_SUBJECTS" "$RESERVED_SUBJECTS"
node "$diagnostic/run.cjs" "$TREE_SUBJECTS" "$RESERVED_SUBJECTS" "$NEW_JOURNAL" "$PREREGISTERED_SHA"
python3 "$diagnostic/score.py" "$NEW_JOURNAL" --json scores.json
```

The first runner command is an offline preflight. The measured command
requires the exact clean preregistered checkout, an audited SDK checkout
in `BUGBOT_PILOT_SDK`, the pinned CLI and authorized provider access.
