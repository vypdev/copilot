# Partial common Git diagnostic v1 results

The [preregistered commit](https://github.com/vypdev/copilot/commit/77eb5df05cf3b16e1d2ef6bd8c0e7234c7049ee9)
froze all 72 slots, the successor runner, both pairs and the independent
evaluator. The journal records 68 completed,
0 expired, 4 failed and 0
aborted slots, with 110 attempts, 0 unmetered attempts
and 0 write attempts. Earlier pilots remain frozen.
[Preregistration](preregistration.md) · [Raw trial journal](trials.jsonl)

## Required runner control

The versioned runner replayed the ten original #913 requests in journal
order through both rounds with a simulated verifier. In all ten cases the
second prompt contained the attested decisive receipt. Six responses
remained partial, with their per-target reasons and the decisive fragment.
The first packet stayed intact. The largest combined second packet was
12,712 bytes
and the largest rendered prompt was
17,883 bytes.
All ten retained their anchors and recorded zero write attempts.
[Control code](control.cjs) · [Per-request records](runner-controls.jsonl)

## Subjects and scoring

H1/H2 are the known #913 pair. P1/P2 are the reserved #880 pair.
The latter uses the historical controller anchor and a mutation limited
to the pagination labels. The local control executed the exact controller
and localization code with deterministic session, access and list ports.
Both revisions show first page, next page, then first page after refresh,
with fresh identity and access checks on each read. P1 presents a next-page
contract and P2 presents an accumulating-list promise. The English label
is the decisive scored witness. No probe result or expected verdict enters
the verifier prompts.
[Pagination controls](pagination-controls.jsonl) ·
[Historical #880 report](https://github.com/vypdev/copilot/issues/880)

Recovery requires an attested receipt spanning the decisive source on the
reviewed head and tree. Delivery means the runner submitted that receipt
on a second attempt. Citation means a final validated verdict cites it.
Exact anchor reports the application-selected position and is independent
of the verdict. The budget column requires metered attempts and all
configured ceilings. Counts use all planned slots.

| Model | Arm | Revision | Requests | Lookup outcomes | Recovered | Delivered | Cited | Verdicts and statuses | Correct verdict | Exact anchor | Budget proved |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| gpt-6-luna | fixed | H1 | 2/3 | 3 none | 0/3 | 0/3 | 0/3 | 1 failed, 2 inconclusive | 0/3 | 3/3 | 3/3 |
| gpt-6-luna | fixed | H2 | 1/3 | 3 none | 0/3 | 0/3 | 0/3 | 1 failed, 2 inconclusive | 0/3 | 3/3 | 3/3 |
| gpt-6-luna | fixed | P1 | 2/3 | 3 none | 0/3 | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 |
| gpt-6-luna | fixed | P2 | 3/3 | 3 none | 0/3 | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 |
| gpt-6-luna | repeat | H1 | 1/3 | 2 none, 1 withheld | 0/3 | 0/3 | 0/3 | 1 failed, 2 inconclusive | 0/3 | 3/3 | 3/3 |
| gpt-6-luna | repeat | H2 | 2/3 | 1 none, 2 withheld | 0/3 | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 |
| gpt-6-luna | repeat | P1 | 3/3 | 3 withheld | 0/3 | 0/3 | 0/3 | 2 confirmed, 1 inconclusive | 0/3 | 3/3 | 3/3 |
| gpt-6-luna | repeat | P2 | 1/3 | 2 none, 1 withheld | 0/3 | 0/3 | 0/3 | 1 confirmed, 2 inconclusive | 1/3 | 3/3 | 3/3 |
| gpt-6-luna | on-demand | H1 | 2/3 | 1 budget, 1 none, 1 provided | 1/3 | 1/3 | 0/3 | 1 failed, 2 inconclusive | 0/3 | 3/3 | 3/3 |
| gpt-6-luna | on-demand | H2 | 2/3 | 1 none, 2 partial | 2/3 | 2/3 | 2/3 | 1 confirmed, 1 inconclusive, 1 refuted | 1/3 | 3/3 | 3/3 |
| gpt-6-luna | on-demand | P1 | 1/3 | 2 none, 1 partial | 0/3 | 0/3 | 0/3 | 1 confirmed, 2 inconclusive | 0/3 | 3/3 | 3/3 |
| gpt-6-luna | on-demand | P2 | 2/3 | 1 ambiguous, 1 none, 1 unresolved | 0/3 | 0/3 | 0/3 | 2 confirmed, 1 inconclusive | 2/3 | 3/3 | 3/3 |
| gpt-6.1-sol | fixed | H1 | 3/3 | 3 none | 0/3 | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 |
| gpt-6.1-sol | fixed | H2 | 3/3 | 3 none | 0/3 | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 |
| gpt-6.1-sol | fixed | P1 | 3/3 | 3 none | 0/3 | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 |
| gpt-6.1-sol | fixed | P2 | 3/3 | 3 none | 0/3 | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 |
| gpt-6.1-sol | repeat | H1 | 3/3 | 3 withheld | 0/3 | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 |
| gpt-6.1-sol | repeat | H2 | 3/3 | 3 withheld | 0/3 | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 |
| gpt-6.1-sol | repeat | P1 | 3/3 | 3 withheld | 0/3 | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 |
| gpt-6.1-sol | repeat | P2 | 3/3 | 3 withheld | 0/3 | 0/3 | 0/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 |
| gpt-6.1-sol | on-demand | H1 | 3/3 | 3 partial | 3/3 | 3/3 | 3/3 | 3 refuted | 3/3 | 3/3 | 3/3 |
| gpt-6.1-sol | on-demand | H2 | 3/3 | 3 partial | 3/3 | 3/3 | 3/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 |
| gpt-6.1-sol | on-demand | P1 | 3/3 | 3 partial | 1/3 | 1/3 | 1/3 | 2 inconclusive, 1 refuted | 1/3 | 3/3 | 3/3 |
| gpt-6.1-sol | on-demand | P2 | 3/3 | 2 partial, 1 unresolved | 1/3 | 1/3 | 1/3 | 3 inconclusive | 0/3 | 3/3 | 3/3 |

## Attempts and budgets

Gross input includes cached input. Input p95 uses metered slots. Packet
and prompt maxima are observed at transport submission. See the journal
for every attempt, per-target retrieval outcome and failed case reason.

| Model | Arm | Completed / expired / failed / aborted | Attempts | Unmetered | Write attempts | Wall p95 ms | Input p95 | Known input / output totals | Max packet / prompt bytes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| gpt-6-luna | fixed | 10 / 0 / 2 / 0 | 12 | 0 | 0 | 11,992 | 19,704 | 136,377 / 1,956 | 5,373 / 10,420 |
| gpt-6-luna | repeat | 11 / 0 / 1 / 0 | 19 | 0 | 0 | 20,428 | 29,046 | 214,835 / 3,123 | 5,828 / 10,899 |
| gpt-6-luna | on-demand | 11 / 0 / 1 / 0 | 19 | 0 | 0 | 35,049 | 22,210 | 193,570 / 2,932 | 14,228 / 19,398 |
| gpt-6.1-sol | fixed | 12 / 0 / 0 / 0 | 12 | 0 | 0 | 14,348 | 9,862 | 116,784 / 3,230 | 5,373 / 10,420 |
| gpt-6.1-sol | repeat | 12 / 0 / 0 / 0 | 24 | 0 | 0 | 20,582 | 19,870 | 235,334 / 5,084 | 5,890 / 11,027 |
| gpt-6.1-sol | on-demand | 12 / 0 / 0 / 0 | 24 | 0 | 0 | 35,839 | 21,890 | 257,518 / 5,244 | 14,632 / 18,541 |

The journal retains terminal errors per profile.

- `gpt-6-luna` recorded 3 `citation-integrity` results.

- `gpt-6-luna` recorded 1 `closed-session-tool-event` result.

The closed-session gate rejected unexpected tool-event metadata. The journal retains the event type and shell inspection count, with no tool identity or effect in the recorded facts. The affected profile is ineligible for advancement. Write attempt counts cover the application's GitHub mutation ports.

## Full-review advancement

The reserved pair alone determines advancement. Each profile needs all
three correct originals and three exact confirmed mutants with decisive
recovery, delivery, citation and proved budgets. Its six decisions must
beat each control arm.

| Profile | Correct, exact, metered fixed · repeat · on-demand | Recovered | Delivered | Cited | Full-review evaluation |
| --- | --- | ---: | ---: | ---: | --- |
| gpt-6-luna low | 0/6 · 1/6 · 2/6 | 0/6 | 0/6 | 0/6 | Criterion unmet |
| gpt-6.1-sol low | 0/6 · 0/6 · 1/6 | 2/6 | 2/6 | 2/6 | Criterion unmet |

The known regression measures the connection separately from the reserved gate.

- `gpt-6-luna` recovered and delivered 3/6 decisive #913 receipts, cited 2/6 and gave 1/6 correct verdicts. For #880, 2/6 verdicts were correct and 6/6 frozen anchors were exact.

- `gpt-6.1-sol` recovered and delivered 6/6 decisive #913 receipts, cited 6/6 and gave 3/6 correct verdicts. For #880, 1/6 verdicts were correct and 6/6 frozen anchors were exact.

## Separate #918 reachability audit

The reviewed fixed-schedule creation and state-change commands do not
establish a normal route to the retired-with-slot state. The SQLite result
is conditional on the seeded persisted row. The auditor-selected fragments
demonstrate packing capacity. This audit is outside the model matrix.
[Reachability and auditor-selected fragments](retirement-audit.md)

The 71 focused tests and Graphify update completed. Graphify reported partial
extraction in some repository files. The existing pilot checksums and the
new freeze verified. Production activation remains disabled.
