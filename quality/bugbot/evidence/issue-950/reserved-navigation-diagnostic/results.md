# Reserved #892 common Git diagnostic

The browser control ran the same pointer journey against the original
and one-line mutation in four mode and direction combinations. The
original emitted one selection request after the fresh click. The
mutation emitted zero. Enter still emitted one request on each tree.
The model trials used only the frozen candidate and diff at round one.
[Preregistered commit](https://github.com/vypdev/copilot/commit/fa14c19395444f708309078141522a5ea25d3c33) ·
[Browser control](browser-control.jsonl) · [36-slot journal](trials.jsonl)

| Profile | Fixed | Second call without sources | On demand | Decisive recovered / delivered / cited | Advance to full review |
| --- | ---: | ---: | ---: | ---: | --- |
| GPT-6 Luna | 0/6 | 0/6 | 1/6 | 5/6 / 5/6 / 5/6 | no |
| GPT-6.1 Sol | 0/6 | 0/6 | 0/6 | 1/6 / 1/6 / 1/6 | no |

Each score requires the expected verdict, exact anchor and proved
budget. The on-demand gate also requires the decisive receipt in
all six slots and a strictly higher score than each control.
[Scoring rules](preregistration.md) · [Evaluator oracle](oracle.json)

## GPT-6 Luna

All 18 slots reached a terminal verdict. Luna made 31 provider attempts
with zero write attempts. The third N1 repeat slot had an unmetered
timeout on its second round, followed by the allowed retry. That slot
has no proved budget.

On demand, Luna's first N1 read requested lines 1–119 and hit the
80-line cap. The remaining five slots received and cited the decisive
range. The two other original trials and two mutant trials stayed
inconclusive. The first N2 trial confirmed the defect at line 107.

| Revision | Arm | Expected | Outcomes | Correct, exact and metered |
| --- | --- | --- | --- | ---: |
| N1 | Fixed | refuted | 3 inconclusive | 0/3 |
| N1 | Second call without sources | refuted | 3 inconclusive | 0/3 |
| N1 | On demand | refuted | 3 inconclusive | 0/3 |
| N2 | Fixed | confirmed | 3 inconclusive | 0/3 |
| N2 | Second call without sources | confirmed | 3 inconclusive | 0/3 |
| N2 | On demand | confirmed | 1 confirmed, 2 inconclusive | 1/3 |

| Slot | Trial | Typed request | Lookup | Decisive R/D/C | Verdict or status | Anchor | Budget | First failed stage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| N1 fixed 1 | `3baa778a35b0b417` | yes | — | –/–/– | inconclusive | exact | proved | verdict:inconclusive |
| N1 fixed 2 | `72a14a842c8c641d` | yes | — | –/–/– | inconclusive | exact | proved | verdict:inconclusive |
| N1 fixed 3 | `d1170f43ad5253b6` | yes | — | –/–/– | inconclusive | exact | proved | verdict:inconclusive |
| N1 repeat 1 | `9d33396893e98dcf` | yes | budget/line-budget | –/–/– | inconclusive | exact | proved | verdict:inconclusive |
| N1 repeat 2 | `addfbd9b67141467` | yes | withheld/control-no-new-evidence | –/–/– | inconclusive | exact | proved | verdict:inconclusive |
| N1 repeat 3 | `e4f9b9634ea7a16b` | yes | withheld/control-no-new-evidence | –/–/– | inconclusive | exact | unproved | verdict:inconclusive |
| N1 on-demand 1 | `d1081ad6e4b84374` | yes | budget/line-budget | –/–/– | inconclusive | exact | proved | retrieval:budget |
| N1 on-demand 2 | `aa34a9fdf73fdca6` | yes | provided | Y/Y/Y | inconclusive | exact | proved | verdict:inconclusive |
| N1 on-demand 3 | `4d03abd9497128d4` | yes | provided | Y/Y/Y | inconclusive | exact | proved | verdict:inconclusive |
| N2 fixed 1 | `f62cd83748002045` | yes | — | –/–/– | inconclusive | exact | proved | verdict:inconclusive |
| N2 fixed 2 | `a0ee0d6d2e83bef7` | yes | — | –/–/– | inconclusive | exact | proved | verdict:inconclusive |
| N2 fixed 3 | `b06fe02fff841967` | yes | — | –/–/– | inconclusive | exact | proved | verdict:inconclusive |
| N2 repeat 1 | `3630d26c9e29699d` | yes | withheld/control-no-new-evidence | –/–/– | inconclusive | exact | proved | verdict:inconclusive |
| N2 repeat 2 | `08ef56ef82bf7f1f` | yes | withheld/control-no-new-evidence | –/–/– | inconclusive | exact | proved | verdict:inconclusive |
| N2 repeat 3 | `a5d550d4ed76397d` | yes | denied/request-shape | –/–/– | inconclusive | exact | proved | verdict:inconclusive |
| N2 on-demand 1 | `db3ce8a9d1aeda7a` | yes | provided | Y/Y/Y | confirmed | exact | proved | — |
| N2 on-demand 2 | `83cff1959f8b5214` | yes | provided | Y/Y/Y | inconclusive | exact | proved | verdict:inconclusive |
| N2 on-demand 3 | `8fea95b04c389459` | yes | provided | Y/Y/Y | inconclusive | exact | proved | verdict:inconclusive |

## GPT-6.1 Sol

All 18 slots reached a terminal verdict. Sol made 30 metered provider
attempts with zero write attempts.

Three on-demand reads requested lines 35–114 and exceeded the
per-fragment byte cap. Two reads received lines 1–80, which end before
the decisive handler. Those two appear as `retrieval:provided` in the
stage table because the adapter supplied the requested source and the
range missed the premise. The remaining mutant trial received and
cited the decisive range and returned an inconclusive verdict.

| Revision | Arm | Expected | Outcomes | Correct, exact and metered |
| --- | --- | --- | --- | ---: |
| N1 | Fixed | refuted | 3 inconclusive | 0/3 |
| N1 | Second call without sources | refuted | 3 inconclusive | 0/3 |
| N1 | On demand | refuted | 3 inconclusive | 0/3 |
| N2 | Fixed | confirmed | 3 inconclusive | 0/3 |
| N2 | Second call without sources | confirmed | 3 inconclusive | 0/3 |
| N2 | On demand | confirmed | 3 inconclusive | 0/3 |

| Slot | Trial | Typed request | Lookup | Decisive R/D/C | Verdict or status | Anchor | Budget | First failed stage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| N1 fixed 1 | `557eae29a8a56349` | yes | — | –/–/– | inconclusive | exact | proved | verdict:inconclusive |
| N1 fixed 2 | `0c1c978341d49e49` | yes | — | –/–/– | inconclusive | exact | proved | verdict:inconclusive |
| N1 fixed 3 | `0d8736a67efe443d` | yes | — | –/–/– | inconclusive | exact | proved | verdict:inconclusive |
| N1 repeat 1 | `a53f044ffa0f0492` | yes | withheld/control-no-new-evidence | –/–/– | inconclusive | exact | proved | verdict:inconclusive |
| N1 repeat 2 | `a21c2dd76d777e47` | yes | withheld/control-no-new-evidence | –/–/– | inconclusive | exact | proved | verdict:inconclusive |
| N1 repeat 3 | `da0e5b84351c697a` | yes | withheld/control-no-new-evidence | –/–/– | inconclusive | exact | proved | verdict:inconclusive |
| N1 on-demand 1 | `c87d105479f6e057` | yes | provided (provided) | –/–/– | inconclusive | exact | proved | retrieval:provided |
| N1 on-demand 2 | `273d5302ccbfccdd` | yes | budget (fragment-byte-budget) | –/–/– | inconclusive | exact | proved | retrieval:budget |
| N1 on-demand 3 | `b1050b68d35e3cb9` | yes | budget (fragment-byte-budget) | –/–/– | inconclusive | exact | proved | retrieval:budget |
| N2 fixed 1 | `95e0cc2fbefca66d` | yes | — | –/–/– | inconclusive | exact | proved | verdict:inconclusive |
| N2 fixed 2 | `2237d14bc62494bc` | yes | — | –/–/– | inconclusive | exact | proved | verdict:inconclusive |
| N2 fixed 3 | `cb5cdcd8a8f25f97` | yes | — | –/–/– | inconclusive | exact | proved | verdict:inconclusive |
| N2 repeat 1 | `2197d56f07c2f85a` | yes | withheld/control-no-new-evidence | –/–/– | inconclusive | exact | proved | verdict:inconclusive |
| N2 repeat 2 | `b9bbef355d610091` | yes | withheld/control-no-new-evidence | –/–/– | inconclusive | exact | proved | verdict:inconclusive |
| N2 repeat 3 | `5676bcffc85b5f6d` | yes | withheld/control-no-new-evidence | –/–/– | inconclusive | exact | proved | verdict:inconclusive |
| N2 on-demand 1 | `f5061793b6022fd4` | yes | budget (fragment-byte-budget) | –/–/– | inconclusive | exact | proved | retrieval:budget |
| N2 on-demand 2 | `95846ac985434ccf` | yes | provided (provided) | –/–/– | inconclusive | exact | proved | retrieval:provided |
| N2 on-demand 3 | `8aba7b8ccc967317` | yes | partial | Y/Y/Y | inconclusive | exact | proved | verdict:inconclusive |

Neither profile met the preregistered gate for full-review evaluation.
Luna exceeded both controls with one supported confirmation and lacked
the required six supported outcomes. Sol tied both controls. The
reported results use the unchanged preregistered scorer and limits.
Production activation remains disabled.
