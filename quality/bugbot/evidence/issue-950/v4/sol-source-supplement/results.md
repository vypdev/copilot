# V4 Sol source-closure supplement results

The 18 slots compare the Sol Source/CI replay with its expanded source packet.
The runner verified all 18 predecessor prompt hashes before any provider call.
Execution ran from `2026-11-09T10:23:15Z` to
`2026-11-09T10:23:58Z`. The main 504-slot
results and activation decision are independent of this diagnostic.

[Protocol](protocol.md) · [Frozen excerpts](receipts.json) · [Trial ledger](trials.jsonl)

## Dispositions and gross usage

Token pairs are observed gross verifier input and output. Unmetered calls
are reported separately and their usage is unknown.

| Subject | Original verdicts | Supplement verdicts | Original tokens | Supplement tokens | Unmetered old → new |
|---|---|---|---:|---:|---:|
| X1 | 3 refuted | 3 refuted | 26,269 / 255 | 27,790 / 287 | 0 → 0 |
| X2 | 3 inconclusive | 3 confirmed | 25,705 / 531 | 27,227 / 489 | 0 → 0 |
| P1 | 3 refuted | 3 refuted | 27,234 / 230 | 32,437 / 255 | 0 → 0 |
| P2 | 3 inconclusive | 3 confirmed | 27,014 / 460 | 32,235 / 440 | 0 → 0 |
| J1 | 3 refuted | 3 refuted | 24,044 / 362 | 25,523 / 317 | 0 → 0 |
| J2 | 3 inconclusive | 3 confirmed | 24,047 / 459 | 25,552 / 418 | 0 → 0 |
| Total | 9 inconclusive, 9 refuted | 9 confirmed, 9 refuted | 154,313 / 2,297 | 170,764 / 2,206 | 0 → 0 |

## Paired slots

| Subject / repetition | V4 trial and disposition | Supplement trial and disposition | Anchor | Added citations |
|---|---|---|---:|---|
| X1 / 1 | `37b3a53c50b91315` refuted | `3f42d0d4b22b24b6` refuted | 8 | `evidence-4` |
| X1 / 2 | `25faf0a9e9186ddb` refuted | `7d1ed21345f8a7ff` refuted | 8 | `evidence-4` |
| X1 / 3 | `9358b2696e46d672` refuted | `ab2e88966f896025` refuted | 8 | `evidence-4` |
| X2 / 1 | `61485f8353a5a1b5` inconclusive | `87519c9bada86d50` confirmed | 8 | `evidence-4` |
| X2 / 2 | `c8282e73b11a9fb9` inconclusive | `bfbe9a7070e12aae` confirmed | 8 | `evidence-4` |
| X2 / 3 | `ca0bf3db3bf81366` inconclusive | `f5d9028d032f6c00` confirmed | 8 | `evidence-4` |
| P1 / 1 | `560a05c0e2dc982e` refuted | `48f627c5babfb188` refuted | 115 | `evidence-7` |
| P1 / 2 | `5d84a3d16c51693d` refuted | `a02cc8318f3b73f3` refuted | 115 | `evidence-7` |
| P1 / 3 | `382c82033e3dfd5c` refuted | `fd0fb571a66f1480` refuted | 115 | `evidence-7` |
| P2 / 1 | `76ac9157407adeb8` inconclusive | `030372e929b8ce76` confirmed | 115 | `evidence-7` |
| P2 / 2 | `c45aae9b9bb90cee` inconclusive | `0360d5e88108089a` confirmed | 115 | `evidence-7`, `evidence-8` |
| P2 / 3 | `655dff07f5189d16` inconclusive | `3f908da35985f7cb` confirmed | 115 | `evidence-7` |
| J1 / 1 | `e68e29e61cc8ae06` refuted | `791e15d05764d856` refuted | 115 | `evidence-4` |
| J1 / 2 | `942564164cf82bd7` refuted | `f41a860397fffc0e` refuted | 115 | `evidence-4` |
| J1 / 3 | `56a1348ad795db73` refuted | `42fa94d591a749ec` refuted | 115 | `evidence-4` |
| J2 / 1 | `86c9b828e080e18e` inconclusive | `e3f9c7faa55dfde9` confirmed | 115 | `evidence-4`, `evidence-5` |
| J2 / 2 | `8efdb2f40e9ca3de` inconclusive | `4a096348fa53ad75` confirmed | 115 | `evidence-4`, `evidence-5` |
| J2 / 3 | `94868e3cb46e58ce` inconclusive | `7173b2e44380128c` confirmed | 115 | `evidence-4`, `evidence-5` |

## Exact added witnesses

The checkout hash, blob and lines for every receipt are in the frozen JSON.
The same citations denote the listed excerpts in each original and its mutant.

| Subjects | Receipt | File and lines | Causal edge |
|---|---|---|---|
| X1 / X2 | `evidence-4` | `backend/src/domus/infrastructure/sqlite.py:351–386` | SQLite connection enables foreign keys before the relevant initialization and migrations |
| P1 / P2 | `evidence-7` | `frontend/src/presentation/domus-administration.ts:286–339` | Component renders the named button with the computed disabled binding |
| P1 / P2 | `evidence-8` | `frontend/src/presentation/administration-messages.ts:8–11` | English label resolves the matcher locator to that button |
| J1 / J2 | `evidence-4` | `tests/browser/image_channel.py:17–45` | The worker initializes its sequence and increments it before its first request |
| J1 / J2 | `evidence-5` | `tests/python/test_image_channel.py:22–23` | The fixture constructs that worker for the reviewed test |
