# Tree retrieval diagnostic results

The prior on-demand pilot at `e477e0e4b` remains the baseline. This replay
compares the frozen prototype against both controls. The two decisions below
apply independently and only to possible evaluation in full review.

[Preregistration commit](https://github.com/vypdev/copilot/commit/1e1213385d769603f5d3c9d62cb798de5db40cb4) ·
[Protocol](preregistration.md) · [Manifest](manifest.json) ·
[Attempt journal](trials.jsonl) · [Reproduction](reproduce.md)

## Held-out decision

| Model | Decisive evidence retrieved on demand | Decisive evidence cited on demand | Correct and metered, fixed | Correct and metered, repeat | Correct and metered, on demand | Advance to full-review evaluation |
|---|---:|---:|---:|---:|---:|---|
| gpt-6-luna | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | no |
| gpt-6.1-sol | 0/6 | 0/6 | 0/6 | 0/6 | 0/6 | no |

The held-out endpoint requires the correct three original verdicts, three
mutant confirmations with the exact anchor, six decisive retrieved citations,
proved budgets and an improvement over each control. The known #869 regression
and local evaluator controls remain separate. An exact location below means
the host preserved the oracle position, even if the model returned an
inconclusive or invalid verdict. It does not imply a confirmed defect.

## Accounting

All 72 preregistered slots are included. Slot statuses are
completed 66, expired 5, failed 1. Verdicts are confirmed 1, inconclusive 62, refuted 3. Failure categories are
closed-session-tool-event 1, provider-turn-timeout 5. The journal recorded 143 finished provider attempts,
29 unmetered attempts and 24 retry attempts. Budgets were
proved for 48/72 slots. Dry-run provider writes attempted are zero.
Retrieval responses across both follow-up arms are budget 14, denied 1, partial 3, provided 6, unresolved 1, withheld 22.
Each wall p95 includes retrieval and both calls where applicable. Gross input
includes cached tokens. Unmetered usage remains unknown.

| Model | Arm | Requests | Provider attempts | Completed / failed / expired / aborted | Wall p95 s | Gross input p95 | Output p95 |
|---|---|---:|---:|---:|---:|---:|---:|
| gpt-6-luna | fixed | 12 | 18 | 12 / 0 / 0 / 0 | 64.21 | 9,949 | 211 |
| gpt-6-luna | repeat | 11 | 31 | 8 / 1 / 3 / 0 | 88.82 | 20,001 | 377 |
| gpt-6-luna | on-demand | 12 | 34 | 10 / 0 / 2 / 0 | 88.82 | 18,517 | 386 |
| gpt-6.1-sol | fixed | 12 | 12 | 12 / 0 / 0 / 0 | 15.49 | 9,989 | 230 |
| gpt-6.1-sol | repeat | 12 | 24 | 12 / 0 / 0 / 0 | 19.70 | 20,097 | 424 |
| gpt-6.1-sol | on-demand | 12 | 24 | 12 / 0 / 0 / 0 | 27.26 | 21,293 | 437 |

## Per-model, arm and revision results

Each slash-separated entry lists repetitions 1, 2 and 3. The journal retains
each query literal, status, receipt binding, digest, citation and attempt.
Recovered or cited means the full decisive oracle span was present or cited.
A retrieval can return another fragment and still miss that span.

| Model | Arm | Revision | Request targets | Returned source or reason | Verdicts | Decisive retrieved | Decisive cited | Correct verdict | Exact anchor |
|---|---|---|---|---|---|---:|---:|---:|---:|
| gpt-6-luna | fixed | R1 | `literal:tests/browser` + `literal:tests/browser`<br>`literal:tests/browser` + `literal:tests/browser` + `literal:tests/browser/image_bridge.py`<br>`literal:tests/browser` + `literal:tests/browser` | —<br>—<br>— | inconclusive<br>inconclusive<br>inconclusive | 0/3 | 0/3 | 0/3 | 3/3 |
| gpt-6-luna | fixed | R2 | `literal:tests/browser` + `literal:tests` + `literal:.github/workflows`<br>`literal:tests/browser` + `name:tests/browser`<br>`literal:tests/browser` + `literal:tests/browser/image_bridge.py` + `literal:tests/browser` | —<br>—<br>— | inconclusive<br>inconclusive<br>inconclusive | 0/3 | 0/3 | 0/3 | 3/3 |
| gpt-6-luna | fixed | T1 | `literal:backend/src/domus/application` + `backend/src/domus/application/recurrence_review_target.py:55–129`<br>`literal:backend/src/domus` + `literal:backend/src/domus`<br>`literal:backend` + `literal:backend` | —<br>—<br>— | inconclusive<br>inconclusive<br>inconclusive | 0/3 | 0/3 | 0/3 | 3/3 |
| gpt-6-luna | fixed | T2 | `literal:backend/src/domus` + `literal:backend/src/domus`<br>`literal:backend/src/domus` + `literal:backend/src/domus`<br>`literal:backend/src/domus` + `literal:backend/src/domus` | —<br>—<br>— | inconclusive<br>inconclusive<br>inconclusive | 0/3 | 0/3 | 0/3 | 3/3 |
| gpt-6-luna | repeat | R1 | `literal:tests/browser` + `literal:tests/browser`<br>`literal:tests/browser` + `literal:tests/browser` + `name:tests/e2e` in `@domus/frontend`<br>— | control-no-new-evidence<br>control-no-new-evidence<br>— | inconclusive<br>inconclusive<br>closed-session-tool-event | 0/3 | 0/3 | 0/3 | 3/3 |
| gpt-6-luna | repeat | R2 | `literal:tests/browser` + `literal:tests/browser`<br>`literal:tests/browser` + `name:tests/browser` + `literal:(root)`<br>`literal:tests/browser` + `literal:tests/browser` | control-no-new-evidence<br>control-no-new-evidence<br>control-no-new-evidence | inconclusive<br>provider-turn-timeout<br>inconclusive | 0/3 | 0/3 | 0/3 | 3/3 |
| gpt-6-luna | repeat | T1 | `literal:backend/src/domus` + `literal:backend/src/domus`<br>`literal:backend/src/domus` + `literal:backend/src/domus`<br>`literal:backend/src/domus` + `literal:backend/src/domus` + `literal:backend/src/domus` | control-no-new-evidence<br>control-no-new-evidence<br>control-no-new-evidence | inconclusive<br>inconclusive<br>provider-turn-timeout | 0/3 | 0/3 | 0/3 | 3/3 |
| gpt-6-luna | repeat | T2 | `literal:backend/src/domus` + `literal:backend/src/domus`<br>`literal:backend/src/domus` + `literal:backend/src/domus`<br>`literal:backend/src/domus` + `backend/src/domus/application/recurrence_review_target.py:83–110` | control-no-new-evidence<br>control-no-new-evidence<br>request-shape | inconclusive<br>inconclusive<br>provider-turn-timeout | 0/3 | 0/3 | 0/3 | 3/3 |
| gpt-6-luna | on-demand | R1 | `literal:tests/browser` + `literal:tests/browser` + `name:tests/browser`<br>`literal:tests/browser` + `literal:tests/browser/image_bridge.py` + `name:(root)` in `@domus/frontend`<br>`literal:tests/browser` + `literal:tests/browser` + `literal:tests/browser` | `tests/browser/image_bridge.py:145–183`, `tests/browser/image_bridge.py:1–80` (partial)<br>`frontend/playwright.entry.config.ts:1–15` (partial)<br>`tests/browser/image_bridge.py:58–122` (partial) | inconclusive<br>confirmed<br>provider-turn-timeout | 1/3 | 1/3 | 0/3 | 3/3 |
| gpt-6-luna | on-demand | R2 | `literal:(root)` + `literal:tests/browser`<br>`literal:tests/browser` + `literal:tests` + `literal:tests/browser`<br>`literal:tests/browser` + `literal:tests/browser` + `literal:tests/browser` | search-file-budget<br>search-file-budget<br>unresolved | inconclusive<br>inconclusive<br>inconclusive | 0/3 | 0/3 | 0/3 | 3/3 |
| gpt-6-luna | on-demand | T1 | `literal:backend/src/domus` + `literal:backend/src/domus`<br>`literal:backend/src/domus` + `literal:backend/src/domus` + `literal:backend/src/domus/application`<br>`literal:backend/src/domus` + `literal:backend/src/domus` | search-file-budget<br>search-file-budget<br>search-file-budget | inconclusive<br>inconclusive<br>provider-turn-timeout | 0/3 | 0/3 | 0/3 | 3/3 |
| gpt-6-luna | on-demand | T2 | `literal:backend/src/domus` + `literal:backend/src/domus` + `literal:backend/src/domus`<br>`literal:backend/src/domus` + `literal:backend/src/domus`<br>`literal:backend/src/domus` + `literal:backend/src/domus` | search-file-budget<br>search-file-budget<br>search-file-budget | inconclusive<br>inconclusive<br>inconclusive | 0/3 | 0/3 | 0/3 | 3/3 |
| gpt-6.1-sol | fixed | R1 | `name:(root)` in `@domus/frontend` + `literal:tests/browser/image_bridge.py`<br>`name:(root)` in `@domus/frontend` + `literal:tests/browser/image_bridge.py`<br>`name:(root)` in `@domus/frontend` + `literal:tests/browser/image_bridge.py` | —<br>—<br>— | inconclusive<br>inconclusive<br>inconclusive | 0/3 | 0/3 | 0/3 | 3/3 |
| gpt-6.1-sol | fixed | R2 | `name:(root)` in `@domus/frontend` + `literal:tests/browser/image_bridge.py`<br>`name:(root)` in `@domus/frontend` + `literal:tests/browser/image_bridge.py`<br>`name:(root)` in `@domus/frontend` + `literal:tests/browser/image_bridge.py` | —<br>—<br>— | inconclusive<br>inconclusive<br>inconclusive | 0/3 | 0/3 | 0/3 | 3/3 |
| gpt-6.1-sol | fixed | T1 | `literal:backend/src/domus` + `literal:backend/src/domus` + `literal:backend/src/domus/application/recurrence_review_target.py`<br>`literal:backend/src/domus` + `literal:backend/src/domus` + `literal:backend/src/domus/application/recurrence_review_target.py`<br>`literal:backend/src/domus` + `literal:backend/src/domus` + `literal:backend/src/domus` | —<br>—<br>— | inconclusive<br>inconclusive<br>inconclusive | 0/3 | 0/3 | 0/3 | 3/3 |
| gpt-6.1-sol | fixed | T2 | `literal:backend/src/domus` + `literal:backend/src/domus` + `literal:backend/src/domus`<br>`literal:backend` + `literal:backend` + `literal:backend/src/domus/application/recurrence_review_target.py`<br>`literal:backend` + `literal:backend` + `literal:backend/src/domus/application/recurrence_review_target.py` | —<br>—<br>— | inconclusive<br>inconclusive<br>inconclusive | 0/3 | 0/3 | 0/3 | 3/3 |
| gpt-6.1-sol | repeat | R1 | `name:(root)` in `@domus/frontend` + `literal:tests/browser/image_bridge.py`<br>`name:(root)` in `@domus/frontend` + `literal:tests/browser/image_bridge.py`<br>`name:(root)` in `@domus/frontend` + `literal:tests/browser/image_bridge.py` | control-no-new-evidence<br>control-no-new-evidence<br>control-no-new-evidence | inconclusive<br>inconclusive<br>inconclusive | 0/3 | 0/3 | 0/3 | 3/3 |
| gpt-6.1-sol | repeat | R2 | `name:(root)` in `@domus/frontend` + `literal:tests/browser/image_bridge.py`<br>`name:(root)` in `@domus/frontend` + `literal:tests/browser/image_bridge.py`<br>`name:(root)` in `@domus/frontend` + `literal:tests/browser/image_bridge.py` | control-no-new-evidence<br>control-no-new-evidence<br>control-no-new-evidence | inconclusive<br>inconclusive<br>inconclusive | 0/3 | 0/3 | 0/3 | 3/3 |
| gpt-6.1-sol | repeat | T1 | `literal:backend/src/domus` + `literal:backend/src/domus` + `literal:backend/src/domus`<br>`literal:backend/src/domus` + `literal:backend/src/domus` + `literal:backend/src/domus`<br>`literal:backend/src/domus` + `literal:backend/src/domus` | control-no-new-evidence<br>control-no-new-evidence<br>control-no-new-evidence | inconclusive<br>inconclusive<br>inconclusive | 0/3 | 0/3 | 0/3 | 3/3 |
| gpt-6.1-sol | repeat | T2 | `literal:backend/src/domus` + `literal:backend/src/domus` + `literal:backend/src/domus/application/recurrence_review_target.py`<br>`literal:backend/src/domus` + `literal:backend/src/domus`<br>`literal:backend/src` + `literal:backend/src` + `literal:backend/src` | control-no-new-evidence<br>control-no-new-evidence<br>control-no-new-evidence | inconclusive<br>inconclusive<br>inconclusive | 0/3 | 0/3 | 0/3 | 3/3 |
| gpt-6.1-sol | on-demand | R1 | `name:(root)` in `@domus/frontend` + `literal:tests/browser/image_bridge.py`<br>`name:(root)` in `@domus/frontend` + `literal:tests/browser/image_bridge.py`<br>`name:(root)` in `@domus/frontend` + `literal:tests/browser/image_bridge.py` | `frontend/playwright.entry.config.ts:1–15`, `tests/browser/image_bridge.py:44–82`<br>`frontend/playwright.entry.config.ts:1–15`, `tests/browser/image_bridge.py:44–82`<br>`frontend/playwright.entry.config.ts:1–15`, `tests/browser/image_bridge.py:44–82` | refuted<br>refuted<br>refuted | 3/3 | 3/3 | 3/3 | 3/3 |
| gpt-6.1-sol | on-demand | R2 | `name:(root)` in `@domus/frontend` + `literal:tests/browser/image_bridge.py`<br>`name:(root)` in `@domus/frontend` + `literal:tests/browser/image_bridge.py`<br>`name:(root)` in `@domus/frontend` + `literal:tests/browser/image_bridge.py` | `frontend/playwright.entry.config.ts:1–15`, `tests/browser/image_bridge.py:44–82`<br>`frontend/playwright.entry.config.ts:1–15`, `tests/browser/image_bridge.py:44–82`<br>`frontend/playwright.entry.config.ts:1–15`, `tests/browser/image_bridge.py:44–82` | inconclusive<br>inconclusive<br>inconclusive | 3/3 | 3/3 | 0/3 | 3/3 |
| gpt-6.1-sol | on-demand | T1 | `literal:backend` + `literal:backend` + `literal:backend`<br>`literal:backend` + `literal:backend` + `literal:backend`<br>`literal:backend/src/domus` + `literal:backend/src/domus` | search-file-budget<br>search-file-budget<br>search-file-budget | inconclusive<br>inconclusive<br>inconclusive | 0/3 | 0/3 | 0/3 | 3/3 |
| gpt-6.1-sol | on-demand | T2 | `literal:backend/src` + `literal:backend/src`<br>`literal:backend/src/domus` + `literal:backend/src/domus` + `literal:backend/src/domus`<br>`literal:backend/src/domus` + `literal:backend/src/domus` + `literal:backend/src/domus/application/recurrence_review_target.py` | search-file-budget<br>search-file-budget<br>search-file-budget | inconclusive<br>inconclusive<br>inconclusive | 0/3 | 0/3 | 0/3 | 3/3 |

## What the experiment established

- The Git controls reproduced the former line 9 to line 11 jump and verified
  the stricter change-block rule. The pinned #869 and #875 controls exercised
  workspace resolution and a complementary multi-fragment result. The
  SQLite oracle confirmed the #918 original and mutant diverge in both
  date-only and timed cases. [Deterministic tests](contract.test.cjs) ·
  [SQLite control observations](local-controls.jsonl)
- In #869, Sol received and cited the decisive config in all six on-demand
  slots. It refuted all three originals and left all three mutants unresolved.
  Luna received and cited that config once and confirmed the original false
  positive in that slot. One attempt in that slot had unreported usage.
  Source delivery and correct use of the source were separate outcomes.
- Every on-demand #918 request reached the file-count limit before the
  adapter read. The requests sought the relevant method in scopes such as
  `backend/src/domus`, which has 175 regular tracked files against the cap
  of 80. A separate post-run lookup scoped to the 50-file infrastructure
  directory retrieved the decisive method in both revisions with the same
  frozen retriever. The evaluator supplied that narrower scope after the
  trials. It contributes no model success. [Post-run locator controls](post-run-locator-controls.jsonl)
- The five expired slots and the rejected `mcp_tool_call` event were on Luna.
  The closed transport rejected the tool event before accepting a verdict.
  The journal records the event type and zero provider write-port calls.
  It does not establish the attempted tool's target or effects.

Neither model cleared the held-out gate. Full-review evaluation and production
activation are outside this diagnostic result.
