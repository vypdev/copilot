# Reserved navigation gesture diagnostic

This diagnostic tests the BBE950-D05 common Git path on one reserved
non-Python pair. The #913 replay at `0d920826c` motivated a new held-out
test. The historical #892 gesture and its mutation were selected after
the common adapter was fixed. They did not contribute to that fix or
to the TypeScript or Python analyzers. Both revisions use the existing
corrected common adapter with no language analyzer.

N1 pins the reviewed ha-ui revision from #892. N2 changes one argument
in the fresh mouse-down handler. Both use the same historical base and
a path-scoped comparison for the changed controller. The candidate
keeps its original right-side anchor at line 107 on both trees.
The initial packet contains the candidate and pinned diff excerpt.
The exact source trees, comparison hashes, candidate, anchor, packet
contents and initial prompt hashes are frozen below. The model
receives neither the decisive range nor any browser observations or
expected verdict. The browser control and oracle are evaluator inputs.

[Subject lock](subjects.lock.json) · [Frozen packets and transport control](runner-control.json) ·
[Historical report](https://github.com/vypdev/copilot/issues/892)

The independent control bundles the actual tabs entry point from
each pinned checkout with the locked ha-ui browser dependencies. It
runs a native pointer sequence in headless Chromium with network
requests aborted. It checks the outside release and the first fresh
click in navigation and panel modes, left-to-right and right-to-left.
The keyboard action checks that the selection path remains live.
The preflight separately simulates the 36 trial slots. It checks
identical first-prompt hashes across arms, partial common Git delivery,
foreign-revision citation rejection and failure of the write port
before provider dispatch.

[Control implementation](browser-control.cjs) · [Evaluator observations](browser-control.jsonl)

The [manifest](manifest.json) freezes 36 slots across two revisions,
GPT-6 Luna and GPT-6.1 Sol, three arms and three repetitions.
The runner dispatches the frozen order within each model using three
workers, low effort, the pinned SDK and CLI, and fresh closed sessions.
A model starts at round one and may give a verdict or make one typed
request. The fixed arm ends after that round. The repeat arm returns
a request status with no new receipts. The on-demand arm returns the
status and receipts from `packet-audit/git-evidence.cjs`. Both follow-up
arms apply the same request validation and response schema. Rejected
queries expose a bounded status without an unauthorized read. The
verifier cannot change the anchor. A second request or foreign citation
fails integrity.

The profile keeps the prior SDD diagnostic ceilings of 90 seconds,
32,768 gross input tokens, 4,096 output tokens and three provider
attempts per slot. The call ceiling is 42 seconds. One bounded retry
is available only after a timeout with zero completed turns and no
tool event. The shared source limits include four seconds, 512 KiB,
80 files, 16 matches, 4,096 tree entries and five receipts. The evidence
ceiling is 9,000 bytes, the full packet ceiling 15,500 and the rendered
prompt ceiling 21,500. Keep all attempts and usage, including failures,
expirations and unknown metering. The run traps GitHub writes.

Score verdict, anchor and budget independently. Track decisive
retrieval by the evaluator's pinned range and receipt provenance.
Delivery requires that the second prompt included that receipt and
the transport recorded a started or completed provider turn. Citation
requires a validated final verdict citing it. For each model, require
all three original refutations and all three mutant confirmations
at the exact anchor, proved budget and decisive retrieval, delivery
and citation in all six on-demand slots. Those six supported outcomes
must exceed the correct, exact, metered count of each control arm.
A model or write-port side effect disqualifies that profile. Record the
first failed stage per slot and the other scoring fields. Passing
permits a separate full-review diagnostic. Production stays disabled.

Recreate the pinned checkouts with a local ha-ui Git repository and
dependencies installed from its frozen lock. Use the audited SDK and
CLI from the preceding diagnostic.

```sh
d=quality/bugbot/evidence/issue-950/reserved-navigation-diagnostic
python3 "$d/prepare.py" "$HA_UI_GIT" "$SUBJECTS" > /tmp/subjects-check.json
cmp /tmp/subjects-check.json "$d/subjects.lock.json"
node "$d/browser-control.cjs" "$SUBJECTS" "$HA_UI_DEPS"
node "$d/run.cjs" "$SUBJECTS"
node "$d/run.cjs" "$SUBJECTS" "$NEW_JOURNAL" "$PREREGISTERED_SHA"
python3 "$d/score.py" "$NEW_JOURNAL"
```

The measured command requires the exact clean preregistered commit
and a new journal path.
