# #892 Sol viewport retrieval with adapter limits in the prompt

Repeat the [viewport retrieval diagnostic](../viewport-retrieval-diagnostic/results.md)
at `d7bb6a075cf2a2af406c7ce5e71bfbef640f4cb3`. The sole
experimental change is the following insertion in the first prompt,
with both values rendered from the common Git adapter's effective
`sourceLimits` configuration.

> An inclusive line range may cover at most 80 lines. Each fragment is limited to 4,400 UTF-8 bytes. Prefer short windows.

The [runner controls](runner-control.json) reconstruct the historical
prompts and match their frozen hashes. They require byte equality
after the exact insertion on each tree, equal first-call prompts
across the three arms, unchanged first-call schemas and packets, and
an unchanged follow-up with the same input. No instructions name the
file, selector, decisive search term or decisive range. S1 remains
withheld. The exact historical requests for lines 1–88 fail with
`line-budget` without opening a Git file. An 80-line fixture window
larger than 4,400 bytes fails with `fragment-byte-budget`. The
admitted short fixture request supplies the viewport link in the
final call. These requests are model-free controls.

## Frozen execution

The same pinned N1 and N2 trees, seeded candidates, scoped diff,
right-side line 107 anchor, and S2–S4 receipts come from the
[historical protocol](../viewport-retrieval-diagnostic/preregistration.md).
The [fixture lock](../reserved-navigation-diagnostic/subjects.lock.json)
fixes the trees and comparisons. The expected verdicts, Chromium
observations and decisive ranges remain evaluator-only.

Reuse GPT-6.1 Sol at low effort, the pinned SDK and CLI, the same
initial request schema and the same final-only verdict contract.
The three arms are fixed, repeat without new source, and one
on-demand retrieval round. The same request-admission rules apply
in every arm. The fixed arm stops after the first call, the repeat
arm returns status without source, and on-demand forwards an admitted
request verbatim to the unchanged common Git adapter. The
[attestation](runner-control.json) freezes the same 18 slots and
order. All calls are new closed sessions, with zero retries and no
GitHub write capability. Run at most 30 calls in total.

Use the same per-call 42-second deadline and case ceilings of
90 seconds, 32,768 gross input tokens and 4,096 output tokens,
including both calls and retrieval time. Keep the historical full
packet, prompt, request, source and receipt budgets. Record whether
admission rejects a request for too many lines or retrieval finds a
fragment that is too large in bytes. Preserve all attempts and
metering, including failures and unknown usage.

## Frozen scoring and comparison

Use the unchanged evaluator and manual causal review criteria from
the prior diagnostic. Count requests that pass the common admission
rule separately from calls that actually reach the adapter. Report
viewport selection and listener evidence separately for retrieval,
delivery and citation. The six on-demand trials must all reach those
three stages, support the full chain and preserve the anchor and
proven budget. Require 3/3 correct refutations in N1 and 3/3 correct
confirmations in N2. An expected conclusive label without a cited
material link is unsupported. The original causal explanation must
place suppression clearing at the fresh mousedown before selection
dispatch. The mutant must preserve suppression there and block
selection at the click handler. Report the first failed stage if
any on-demand trial misses the criterion.

Compare the same 18 historical slots with the new run, including
line and fragment byte rejections, valid inconclusives and
unsupported conclusions. A pass is evidence on this known case and
supports a separate reserved-case design. Production activation
remains disabled.

## Reproduction

Use the [historical fixture procedure](../viewport-retrieval-diagnostic/preregistration.md)
with the pinned SDK and CLI. From this directory, verify the frozen
checksums and run the model-free controls. Then run the trial command
only from the clean preregistration commit and with a fresh output
directory. The final two commands audit measured evidence.

```sh
shasum -a 256 -c frozen.sha256
node run.cjs "$SUBJECTS"
node run.cjs "$SUBJECTS" "$NEW_OUTPUT" "$freeze"
node run.cjs "$SUBJECTS" --audit-receipts "$NEW_OUTPUT/trials.jsonl"
python3 score.py "$NEW_OUTPUT/trials.jsonl" causal-review.json
```
