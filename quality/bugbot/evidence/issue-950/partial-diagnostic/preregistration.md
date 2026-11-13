# Partial common Git diagnostic v1

This diagnostic tests whether preserving partial Git evidence helps a closed
verifier distinguish a product contract from a real defect. Production
activation is disabled. Earlier experiments remain frozen at their commits.

## Subjects

| Role | Subjects | Frozen source |
| --- | --- | --- |
| Known regression | H1/H2, #913 | Reuse the exact prior revisions, material quantity candidate, anchor and initial packet. |
| Reserved pair | P1/P2, #880 | Original Domus review at `93d7d77b` and one mutation of the English and Spanish labels for the pagination control. Both preserve the historical controller anchor and the identical list replacement behavior. |

The reserved comparison includes the controller, presentation and messages
paths. The initial packet shows the application hunk, controller and caller
receipts. It withholds the resolved label value. The known regression reuses
its earlier fixture without edits. Neither the oracle nor the local
execution probe enters either model packet. Both pairs use only the
corrected common Git adapter, with no language analyzer.

## Preflight, matrix and controls

The versioned runner first passed all ten previously recorded #913
requests through both rounds with an in-process verifier. The control
requires an attested decisive receipt in every second prompt, six partial
lookups with a per-target reason, zero write attempts and complete
packet/prompt budgets. The control ledger and local #880 behavior probe
are frozen with this protocol.

Run 72 slots in dry-run using GPT-6 Luna and GPT-6.1 Sol, low effort, the
audited SDK and Codex CLI, and three workers per model in stable slot
order. The verifier uses a fresh closed session with no checkout or tools.
GitHub writes are trapped. For each model, subject and repetition, the
candidate, initial packet and prompt bytes are identical across arms.

| Arm | Follow-up after a valid request |
| --- | --- |
| Fixed | No call. An evidence request yields inconclusive. |
| Repeat | Same original packet with a typed no-new-evidence response. |
| On-demand | Same original packet and the common Git response, including partial results and retained receipts. |

The repeat and on-demand arms use the same follow-up admission,
verifier schema and case limits. The candidate anchor cannot move.
A second request or invalid citation fails verification.

Use the unchanged ceilings of 90 seconds, 32,768 gross input tokens
(including cached input), 4,096 output tokens and three provider
attempts per slot. Count both rounds, retries and retrieval. The runner
uses a 42-second call ceiling with a 1.2-second termination margin and
allows at most one bounded retry after a timeout with zero completed
turns and no tool event. Retain all failures, expirations and unmetered
attempts. The Git adapter keeps the published four seconds, 512 KiB
source, 80 files, 16 matches, 4,096 tree entries and five receipts.
The evidence ceiling is 9,000 bytes, complete packets 15,500 bytes,
and rendered prompts 21,500 bytes.

## Scoring and advancement

Record receipt recovery, round-two delivery, final citation, verdict,
exact frozen anchor and proved budget as separate fields. The decisive
receipt must cover the evaluator's source span on the exact reviewed
tree and head. Citation means a valid final verdict cites that receipt.
An expired, failed, aborted or unmetered slot cannot support advancement.
A provider or mutation attempt outside the read-only contract is retained
and disqualifies that profile.

For each model independently, require the on-demand arm to refute
all three reserved originals, confirm all three mutants at the exact
anchor, recover and cite decisive source in all six, and prove every
case budget. The six correct, exact, budget-proved outcomes must exceed
the corresponding counts in each control arm. The known regression
cannot qualify a profile. A pass permits full-review evaluation, which
has separate gates. It cannot enable production.

## Reproduce

Provision the pinned SDK and both #913 checkouts with the
[prior diagnostic](../module-diagnostic/preregistration.md). Fetch the
#880 original and comparison base from [prepare.py](prepare.py) into a
disposable Domus Git repository. Set `KNOWN_SUBJECTS` and
`RESERVED_SUBJECTS` to the corresponding checkout parents.

```sh
diagnostic=quality/bugbot/evidence/issue-950/partial-diagnostic
python3 "$diagnostic/prepare.py" "$DOMUS_GIT" "$RESERVED_SUBJECTS" > fixture-check.json
cmp fixture-check.json "$diagnostic/held-out.lock.json"
node "$diagnostic/control.cjs" "$KNOWN_SUBJECTS"
node "$diagnostic/pagination-control.cjs" "$RESERVED_SUBJECTS"
node "$diagnostic/run.cjs" "$KNOWN_SUBJECTS" "$RESERVED_SUBJECTS"
node "$diagnostic/run.cjs" "$KNOWN_SUBJECTS" "$RESERVED_SUBJECTS" "$NEW_JOURNAL" "$PREREGISTERED_SHA"
python3 "$diagnostic/score.py" "$NEW_JOURNAL" --json scores.json
```

The first runner invocation checks the freeze without a provider call.
The measured invocation requires the exact clean preregistered checkout,
the audited SDK in `BUGBOT_PILOT_SDK` and authorized provider access.
