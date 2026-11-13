# Prepared-chain second-call diagnostic

The sole intervention is to supply pinned source that closes the material
chain on the same candidate. This compares prepared evidence with the
historical second prompt. It exercises neither evidence request generation
nor automatic retrieval. #918 stays outside the matrix as a separate
persisted-state conditional case. Production activation remains disabled.

## Selection and attestation

For each of H1, H2, P1 and P2, scan actual round-two `attempt-started`
records in journal order from `5aed48f77`. Choose the first Sol attempt
whose delivered receipt IDs include the decisive exact-head source span.
If none qualifies, choose the first Sol follow-up, then the first
follow-up from either model. Selection is independent of verdict and
citation. All four subjects had a qualifying Sol attempt. Rebuild its
source receipts from exact Git blobs and ranges. Verify the prompt and
response schema hashes and both byte counts against the measured ledger.
The frozen [packets](packets.json) record the selected IDs and bytes.

## Packages

The historical arm uses the reconstructed prompt byte for byte. The
complete arm retains its candidate, selected anchor, pinned diff and
all historical source text. It extends one existing presentation
receipt per revision and adds one evidence receipt on the same reviewed
tree and operation. Extending a receipt remints its ID against its exact
disjoint ranges. The original retrieval's per-target status and receipt
links remain visible. For packet fit, the complete arm omits run-only
accounting, the duplicate receipt index, null request fields and source
paths already present in their referenced receipts. No historical source
line is dropped. Both models receive identical prompts within each arm.

| Revisions | Prepared additions |
| --- | --- |
| H1/H2, #913 | Exact quantity field input and form-submit ranges, the remainder of the completion method including intent emission, and the data adapter accepting precision up to six. The historical packet already shows the effective import, normalizer, canonical parser and its differing predicate. |
| P1/P2, #880 | The presentation dispatch, accepted pagination intent shape, composition listener and routing into the controller. The historical packet already shows the English label, template, cursor path and page replacement. |

The evaluator holds the expected verdicts, decisive citation locators
and earlier local execution results. Neither arm contains those outputs.

## Matrix and limits

Run two models, four revisions, two arms and three repetitions for 48
slots. Use low effort, the pinned SDK and CLI and three workers per
model. Dispatch follows the frozen per-model order from [order.json](order.json).
Each slot makes exactly one second-call attempt with the historical
verdict-only schema in a fresh closed session. There are no first calls,
evidence requests, live repository reads or retries. GitHub mutation
ports throw if called. Any unexpected tool event invalidates its attempt.

Apply the same 90-second slot, 42-second provider call, 32,768 gross-input
token, 4,096 output token, 15,500-byte complete packet and 21,500-byte
prompt ceilings to both arms. Cached input counts in gross usage. Verify
the existing line, fragment and receipt limits before freezing. Retrieval
time and cost belong to the earlier run and are outside this second-call
comparison.

## Scoring

Record status, final verdict, receipt IDs, exact application anchor,
elapsed time and token usage separately. A usable correct decision is
a correct anchored verdict with a cited decisive receipt, proved budget
and zero writes. Also report raw correct verdicts, decisive citations and
citations to the newly supplied or extended receipts separately. Keep
invalid citations, unexpected tool events, expirations, missing slots
and unmetered attempts in the ledger. Raw verdict and budget proof
remain separate even if usage is missing.

For a valid inconclusive response, record only a closed list of missing
premise codes. The deterministic classifier checks the next step first
and uses the reason as a fallback. It can report several signals or
`unclassified`. The journal stores digests of both strings and exports
no provider prose. Quantity codes distinguish precision-six reachability,
input-to-parser binding, six-place acceptance and completion effect.
Pagination codes distinguish the accumulation contract, displayed
English label, event-to-controller binding and page replacement. Runtime
witness and missing source are separate general codes.

For each model and pair, compare mutant confirmations and original
refutations by arm. Treat a gain as supported when the complete packet
strictly increases usable mutant confirmations and preserves at least
the historical count of usable original refutations. Report declines
and inconclusive premises regardless of the result. This diagnostic
does not determine the separate reserved-pair advancement criterion.

## Reproduce

Provision the pinned SDK and frozen #913 and #880 checkouts using the
[previous protocol](../partial-diagnostic/preregistration.md).

```sh
d=quality/bugbot/evidence/issue-950/prepared-diagnostic
node "$d/prepare.cjs" "$KNOWN_SUBJECTS" "$RESERVED_SUBJECTS" > packets-check.json
cmp packets-check.json "$d/packets.json"
node --test "$d/runner.test.cjs"
node "$d/run.cjs"
node "$d/run.cjs" "$NEW_JOURNAL" "$PREREGISTERED_SHA"
python3 "$d/score.py" "$NEW_JOURNAL" --json scores.json
```

The first runner command is model-free. The measured command requires
the exact clean preregistered checkout, the audited SDK in
`BUGBOT_PILOT_SDK` and authorized provider access.
