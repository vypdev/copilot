# On-demand evidence diagnostic results

**Decision: neither profile met the preregistered signal.** Keep production
activation disabled. The 72-slot replay does not support advancing this
mechanism to full-review qualification.

[Preregistration commit](https://github.com/vypdev/copilot/commit/a4c8ca9972845f8391320fb19e16248215e76337) ·
[Protocol](preregistration.md) · [Manifest](manifest.json) · [Attempt journal](trials.jsonl) ·
[Evaluator-only controls](local-controls.json) · [Reproduction](reproduce.md)

## Held-out endpoint

| Model | Fixed correct and metered | Repeat correct and metered | On-demand correct and metered | On-demand decisive receipts cited | Advance |
|---|---:|---:|---:|---:|---:|
| gpt-6-luna | 1/6 | 2/6 | 1/6 | 0/6 | no |
| gpt-6.1-sol | 0/6 | 0/6 | 0/6 | 0/6 | no |

- Both models left all three held-out originals inconclusive in the on-demand
  arm. Luna confirmed one of three held-out mutants at line 164 directly from
  the initial packet, with no retrieval. Luna's no-new-evidence control
  confirmed two of three. Sol left every held-out mutant inconclusive.
- On the held-out pair, the application returned seven valid excerpts across
  both models, recorded three missing paths and denied one directory request.
  No request named the decisive checked-in Playwright config at its full path.
  Several requests sought more bridge or startup code. Other requests named
  the config in the repository root or next to the bridge. The initial packet
  identified the workspace-filtered command and config basename, but offered
  no verified workspace-to-path mapping. The one-round, named-file adapter
  cannot disambiguate a basename or discover a file from a directory request.
- For #875, all arms refuted J1 three times per model. Luna did not ask for
  missing worker source on J2. Sol recovered and cited the exact initial
  sequence/increment in all three on-demand J2 trials and still reported them
  inconclusive. This packet did not add the worker-factory construction edge
  available in the earlier supplement. The journal cannot establish which
  additional premise each Sol response considered decisive.
- The evaluator-only pytest, ASGI and real Playwright controls reproduced
  both pair differences. They establish expected behavior and do not count
  toward the model endpoint. No original candidate was confirmed by any arm.

## Run integrity and overhead

The ledger contains 72 terminal rows and 100 provider attempts. There were
70 completed dispositions, two conclusion envelopes rejected by the
citation/next-step contract, and zero expired, aborted or unmetered trials. There were
no retries, cap breaches, tool events or provider write attempts. The two
invalid envelopes remain failed rows. Every selected host location matches
the pinned oracle. Only a confirmed positive counts as a retained exact
finding. Gross input includes cached input and every call. P95 uses nearest
rank across the 12 planned slots per model and arm.

| Model | Arm | Requests | Calls | Confirmed / refuted / inconclusive / failed | Wall p95 s | Gross input p95 | Cached input p95 | Output p95 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| gpt-6-luna | fixed | 2 | 12 | 1 / 5 / 5 / 1 | 8.27 | 9,868 | 4,864 | 209 |
| gpt-6-luna | repeat | 5 | 17 | 2 / 6 / 4 / 0 | 15.41 | 30,825 | 19,456 | 399 |
| gpt-6-luna | on-demand | 5 | 17 | 1 / 5 / 5 / 1 | 12.40 | 20,878 | 4,864 | 356 |
| gpt-6.1-sol | fixed | 9 | 12 | 0 / 3 / 9 / 0 | 12.29 | 9,841 | 4,864 | 259 |
| gpt-6.1-sol | repeat | 9 | 21 | 0 / 3 / 9 / 0 | 19.84 | 19,758 | 4,864 | 441 |
| gpt-6.1-sol | on-demand | 9 | 21 | 0 / 3 / 9 / 0 | 20.38 | 20,813 | 4,864 | 498 |

## Per-model, arm and case results

Each cell lists repetitions 1, 2 and 3 in that order. `*` marks a returned
fragment covering the decisive span and cited by the verdict. Request locators
show the typed read range or a literal search. The journal contains literal
queries, receipt bindings, citations, timeout fields and per-call metering.
A position is exact even for an inconclusive or failed trial when the host
froze it at the expected line. It does not represent a published finding.

| Model | Arm | Case | Requests | Evidence returned or reason | Verdicts | Exact anchors | Wall s | Gross input / output tokens |
|---|---|---|---|---|---|---|---|---|
| gpt-6-luna | fixed | J1 | —<br>—<br>— | —<br>—<br>— | refuted<br>refuted<br>refuted | 3/3 | 5.73<br>5.84<br>7.95 | 9,073 / 162<br>9,057 / 127<br>9,094 / 175 |
| gpt-6-luna | fixed | J2 | —<br>—<br>— | —<br>—<br>— | refuted<br>missing-witness<br>refuted | 3/3 | 4.87<br>6.47<br>6.67 | 9,023 / 136<br>9,020 / 209<br>9,035 / 159 |
| gpt-6-luna | fixed | R1 | `tests/browser/entry_server.py:1–80`<br>`tests/browser/image_bridge.py:1–80`<br>— | —<br>—<br>— | inconclusive<br>inconclusive<br>inconclusive | 3/3 | 6.46<br>4.51<br>7.07 | 9,832 / 129<br>9,868 / 125<br>9,807 / 193 |
| gpt-6-luna | fixed | R2 | —<br>—<br>— | —<br>—<br>— | confirmed<br>inconclusive<br>inconclusive | 3/3 | 6.00<br>8.27<br>6.88 | 9,773 / 191<br>9,802 / 205<br>9,751 / 199 |
| gpt-6-luna | repeat | J1 | —<br>—<br>— | —<br>—<br>— | refuted<br>refuted<br>refuted | 3/3 | 7.40<br>6.17<br>5.96 | 9,073 / 142<br>9,055 / 136<br>9,096 / 133 |
| gpt-6-luna | repeat | J2 | —<br>—<br>— | —<br>—<br>— | refuted<br>refuted<br>refuted | 3/3 | 6.37<br>6.63<br>7.37 | 9,023 / 135<br>9,020 / 178<br>9,035 / 168 |
| gpt-6-luna | repeat | R1 | `tests/browser/entry_server.py:1–80`<br>`tests/browser/image_bridge.py:1–80`<br>`tests/browser/entry_server.py:363–380` | control-no-new-evidence<br>control-no-new-evidence<br>control-no-new-evidence | inconclusive<br>inconclusive<br>inconclusive | 3/3 | 12.12<br>15.41<br>11.31 | 19,735 / 349<br>30,825 / 399<br>19,689 / 316 |
| gpt-6-luna | repeat | R2 | `tests/browser` (literal search)<br>—<br>`tests/e2e/administration.spec.ts` (literal search) | control-no-new-evidence<br>—<br>control-no-new-evidence | confirmed<br>confirmed<br>inconclusive | 3/3 | 10.62<br>5.72<br>13.11 | 19,620 / 308<br>9,802 / 151<br>19,589 / 380 |
| gpt-6-luna | on-demand | J1 | —<br>—<br>— | —<br>—<br>— | refuted<br>refuted<br>refuted | 3/3 | 6.05<br>5.76<br>6.95 | 9,073 / 176<br>9,057 / 151<br>9,096 / 150 |
| gpt-6-luna | on-demand | J2 | —<br>—<br>— | —<br>—<br>— | refuted<br>missing-witness<br>refuted | 3/3 | 4.66<br>8.67<br>5.50 | 9,021 / 135<br>9,020 / 214<br>9,035 / 138 |
| gpt-6-luna | on-demand | R1 | `tests/browser/image_bridge.py:1–80`<br>`tests/browser/image_bridge.py:1–80`<br>`tests/browser/entry_server.py:363–380` | `tests/browser/image_bridge.py:1–80`<br>`tests/browser/image_bridge.py:1–80`<br>`tests/browser/entry_server.py:363–380` | inconclusive<br>inconclusive<br>inconclusive | 3/3 | 12.40<br>11.34<br>12.16 | 20,791 / 356<br>20,878 / 330<br>20,025 / 342 |
| gpt-6-luna | on-demand | R2 | —<br>`tests/browser` (literal search)<br>`tests/browser/playwright.entry.config.ts:1–80` | —<br>non-regular-path<br>path-absent | confirmed<br>inconclusive<br>inconclusive | 3/3 | 6.21<br>11.75<br>11.17 | 9,775 / 185<br>19,677 / 329<br>19,577 / 329 |
| gpt-6.1-sol | fixed | J1 | —<br>—<br>— | —<br>—<br>— | refuted<br>refuted<br>refuted | 3/3 | 6.11<br>8.95<br>6.32 | 9,066 / 152<br>9,069 / 148<br>9,059 / 142 |
| gpt-6.1-sol | fixed | J2 | `tests/browser/image_channel.py:1–65`<br>`tests/browser/image_channel.py:1–65`<br>`tests/browser/image_channel.py:1–65` | —<br>—<br>— | inconclusive<br>inconclusive<br>inconclusive | 3/3 | 4.61<br>4.99<br>5.51 | 9,021 / 93<br>9,033 / 99<br>9,019 / 93 |
| gpt-6.1-sol | fixed | R1 | `playwright.entry.config.ts` (literal search)<br>`tests/browser/image_bridge.py:65–144`<br>`playwright.entry.config.ts:1–80` | —<br>—<br>— | inconclusive<br>inconclusive<br>inconclusive | 3/3 | 5.94<br>9.54<br>12.29 | 9,841 / 144<br>9,838 / 242<br>9,831 / 251 |
| gpt-6.1-sol | fixed | R2 | `tests/browser/image_bridge.py` (literal search)<br>`tests/browser/image_bridge.py:1–80`<br>`tests/browser/image_bridge.py` (literal search) | —<br>—<br>— | inconclusive<br>inconclusive<br>inconclusive | 3/3 | 10.78<br>7.21<br>10.84 | 9,766 / 228<br>9,764 / 152<br>9,797 / 259 |
| gpt-6.1-sol | repeat | J1 | —<br>—<br>— | —<br>—<br>— | refuted<br>refuted<br>refuted | 3/3 | 6.61<br>6.45<br>5.71 | 9,062 / 143<br>9,069 / 148<br>9,057 / 133 |
| gpt-6.1-sol | repeat | J2 | `tests/browser/image_channel.py:1–65`<br>`tests/browser/image_channel.py:1–65`<br>`tests/browser/image_channel.py:1–64` | control-no-new-evidence<br>control-no-new-evidence<br>control-no-new-evidence | inconclusive<br>inconclusive<br>inconclusive | 3/3 | 11.89<br>11.56<br>11.69 | 18,114 / 234<br>18,142 / 264<br>18,112 / 263 |
| gpt-6.1-sol | repeat | R1 | `playwright.entry.config.ts` (literal search)<br>`tests/browser/image_bridge.py` (literal search)<br>`playwright.entry.config.ts:1–80` | control-no-new-evidence<br>control-no-new-evidence<br>control-no-new-evidence | inconclusive<br>inconclusive<br>inconclusive | 3/3 | 15.69<br>18.86<br>15.74 | 19,758 / 348<br>19,752 / 441<br>19,728 / 377 |
| gpt-6.1-sol | repeat | R2 | `playwright.entry.config.ts:1–80`<br>`tests/browser/image_bridge.py` (literal search)<br>`tests/browser/image_bridge.py:74–153` | control-no-new-evidence<br>control-no-new-evidence<br>control-no-new-evidence | inconclusive<br>inconclusive<br>inconclusive | 3/3 | 14.40<br>16.12<br>19.84 | 19,610 / 383<br>19,600 / 419<br>19,672 / 422 |
| gpt-6.1-sol | on-demand | J1 | —<br>—<br>— | —<br>—<br>— | refuted<br>refuted<br>refuted | 3/3 | 6.25<br>6.13<br>5.57 | 9,064 / 145<br>9,069 / 150<br>9,057 / 146 |
| gpt-6.1-sol | on-demand | J2 | `tests/browser/image_channel.py:1–65`<br>`tests/browser/image_channel.py:1–65`<br>`tests/browser/image_channel.py:1–65` | `tests/browser/image_channel.py:1–65` *<br>`tests/browser/image_channel.py:1–65` *<br>`tests/browser/image_channel.py:1–65` * | inconclusive<br>inconclusive<br>inconclusive | 3/3 | 19.79<br>16.80<br>19.44 | 18,922 / 396<br>18,954 / 374<br>18,912 / 414 |
| gpt-6.1-sol | on-demand | R1 | `playwright.entry.config.ts:1–80`<br>`tests/browser/image_bridge.py:1–80`<br>`playwright.entry.config.ts:1–80` | path-absent<br>`tests/browser/image_bridge.py:1–80`<br>path-absent | inconclusive<br>inconclusive<br>inconclusive | 3/3 | 14.39<br>17.28<br>15.41 | 19,757 / 376<br>20,813 / 406<br>19,731 / 373 |
| gpt-6.1-sol | on-demand | R2 | `tests/browser/image_bridge.py` (literal search)<br>`tests/browser/image_bridge.py:1–80`<br>`tests/browser/image_bridge.py` (literal search) | `tests/browser/image_bridge.py:44–82`<br>`tests/browser/image_bridge.py:1–80`<br>`tests/browser/image_bridge.py:44–82` | inconclusive<br>inconclusive<br>inconclusive | 3/3 | 19.77<br>16.48<br>20.38 | 20,245 / 461<br>20,668 / 395<br>20,319 / 498 |

## Qualification still pending

This run establishes bounded source retrieval and shows where the available
request vocabulary failed to find the relevant configuration. For the held-out
pair, the measured gate requires all three original and all three mutant
repetitions per model to reach the correct decision with the recovered,
cited witness. The result is 0/6 decisive citations for each model. The earlier
v4 and Sol contrast stay diagnostic. Full-review historical false-positive
reproduction, reproducible paired reduction, exact positive-control retention,
integrity, cost and latency under the intended configuration, and the separate
174-case detection corpus remain pending for any profile. The
[historical matrix](../traceability.md) distinguishes executed pairs from
planned coverage. The pull request stays draft and production remains disabled.
