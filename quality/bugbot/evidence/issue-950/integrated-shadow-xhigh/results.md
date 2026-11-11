# Repository verifier in Bugbot's shadow dry-run

The [frozen subjects](subjects.json) are historical snapshots of two real Domus pull requests. The pilot used the usual Bugbot review composition and detector, with the real Git comparisons and fixed PR identities. Discussion and SCM-supplied rules were empty in the fixture. The installed Action omits the verifier binding. The pilot supplies a trusted read-only object store, authenticated official sources and write ports that throw if invoked.

The normal PR input resolves `REVIEWER_EFFORT=xhigh`. The detector and verifier use the same effective model and effort. `BUGBOT_EFFORT=smart` selects the analysis depth. The ledgers record the arguments used by Codex and the provider-reported model when available. The dry-run simulates the ordinary publication decision and stores shadow observations separately. Detection and preparation times come from the workflow's `analysis` and `normalization` timers. Verification time measures the entire phase, including failed attempts. The verifier retains explicit cancellation and treats token use as optional telemetry.

| PR and pinned revisions | Model and effort | Detection | Preparation | Verification wall | Total | Simulated publication and sessions | Ledger |
|---|---|---:|---:|---:|---:|---|---|
| Domus #24 · `4b71969d` → `e129e76e` | Luna · `xhigh` | 260.473 s | 0.001 s | 0 s | 260.561 s | 0 prepared findings and 0 verifier sessions | [JSONL](domus-24-luna.jsonl) |
| Domus #28 · `8b1cbc11` → `b9a2dfc8` | Sol → Sol · `xhigh` | 742.925 s | 0.002 s | 826.986 s | 1,570.006 s | 2 prepared findings, both retained by the ordinary decision. Peak verifier concurrency was 2. | [JSONL](domus-28-sol.jsonl) |

| Finding | Sol verdict | Session wall | Turns | Longest turn | Closure requests | Independent evidence |
|---|---|---:|---:|---:|---:|---|
| Domus #28 · Saved preferences gated by write controls · `domus-administration.ts:338` | `confirmed` | 815.485 s | 17 | 134.243 s | 2 | The controller loads authorized reads. The view gates access to the values through the edit button. Chromium reproduced the fresh read-only view. [Read](https://github.com/vypdev/domus/blob/b9a2dfc8179128fb493ab49666c24967d308c979/frontend/src/application/administration-controller.ts#L140-L148) · [Render](https://github.com/vypdev/domus/blob/b9a2dfc8179128fb493ab49666c24967d308c979/frontend/src/presentation/domus-administration.ts#L334-L341) |
| Domus #28 · Retained draft after definitive rejection · `domus-administration.ts:282` | `confirmed` | 826.676 s | 18 | 153.954 s | 1 | Save sets `sent` and the rejection updates the view. Back to editing remains disabled. Chromium reproduced that component behavior using a preference draft and a definitive rejection in the view. [Save](https://github.com/vypdev/domus/blob/b9a2dfc8179128fb493ab49666c24967d308c979/frontend/src/presentation/domus-administration.ts#L147-L149) · [Rejection handling](https://github.com/vypdev/domus/blob/b9a2dfc8179128fb493ab49666c24967d308c979/frontend/src/application/administration-controller.ts#L306-L316) · [Editor](https://github.com/vypdev/domus/blob/b9a2dfc8179128fb493ab49666c24967d308c979/frontend/src/presentation/domus-administration.ts#L276-L284) |
| Domus #28 · Archived Playwright matcher claim · `catalog.spec.ts:115` | `refuted` | 260.976 s | 12 | 47.313 s | 1 | The cited release honors `enabled: false`. [Replay ledger](domus-28-playwright-replay.jsonl) · [Matcher implementation](https://github.com/microsoft/playwright/blob/cfe490d941f992655948eee8fd4fd94e1c4234bf/packages/playwright/src/matchers/matchers.ts#L152-L162) |

All 10 detector invocations and all 47 verifier turns used the specified model and `xhigh`. The CLI did not report a separate model identity. Three distinct verifier sessions produced three accepted verdicts with unchanged anchors. The audit recalculated the hashes of 203 cited ranges from the pinned Git blobs and official sources. The pilot and the archived control recorded zero attempted PR writes and zero provider failures. The two fresh confirmed findings agree with the independent component control. The archived replay supplies the false-positive check. The fresh sample contains no Luna candidate, so the live detector-to-verifier handoff is covered by Sol in this sample.

The live runs used the adapter in a worktree based on `5f38bf9bf`. The [source hashes](live-sources.sha256) identify the adapter and runner versions used. The final revision adds lint fixes and reruns the deterministic controls. The pilot evaluates shadow behavior and leaves production qualification pending.

The supplementary control uses the archived Domus #28 finding from the [historical producer](https://github.com/vypdev/domus/actions/runs/41610125444). It enters at the verifier adapter with the original claim, revision and anchor. The historical producer's reasoning effort is outside the comparison. The new verifier uses Sol at `xhigh` and receives source and version evidence through the same adapter as the fresh runs. Independent reference evidence comes from the [resolved lockfile](https://github.com/vypdev/domus/blob/b9a2dfc8179128fb493ab49666c24967d308c979/pnpm-lock.yaml#L33-L35), [versioned matcher source](https://github.com/microsoft/playwright/blob/cfe490d941f992655948eee8fd4fd94e1c4234bf/packages/playwright/src/matchers/matchers.ts#L152-L162), and [the historical consumer CI](https://github.com/vypdev/domus/actions/runs/41610125553/job/125829637535). These observations remain outside the model prompt.

The earlier Sol investigation on Domus #29 ended with the provider's `cy` code on turn 15. The new transport distinguishes provider safety stops from context-window failures. The former ends the investigation and preserves the available evidence in the ledger. The deterministic control records one failed attempt with zero context retries, verdicts, or writes. The live sample here uses Domus #24 and #28.

The independent Chromium control uses the Domus #28 component and Lit, Playwright and esbuild versions pinned in its lockfile. A ready view supplies saved preferences with read permission and disables the edit control. Chromium sees the disabled button and zero fields for the saved language. With editing enabled, the harness changes the language, submits once and supplies a definite rejection. The component disables Back to editing. Reset remains available and restores the saved language. These observations test the pinned UI with an in-memory view fixture and the page network blocked. [Control](control-administration.cjs) · [Observations](domus-28-chromium.json)

Use a remote-free `domus.git` with the Git objects in `subjects.json`, the exact files in the [official source manifest](../shadow-real-prs/official.json), and Python 3.14.6 linked to SQLite 3.53.3 for the scoped local version evidence. `LAB` points to that directory. `LOGS` is a writable destination and the individual files must be new.

```sh
export REVIEWER_EFFORT=xhigh BUGBOT_EFFORT=smart
export AGENT_ALLOWED_MODEL_PROVIDERS=openai
export AGENT_ALLOWED_MODELS=openai/gpt-6-luna,openai/gpt-6.1-sol
export PILOT_LOCAL_PYTHON=/absolute/path/to/pinned/python
evidence=quality/bugbot/evidence/issue-950
protocol="$evidence/integrated-shadow-xhigh/subjects.json"

node "$evidence/normal-flow-shadow/run.cjs" "$LAB" 24 "$LOGS/domus-24.jsonl" "$protocol"
node "$evidence/normal-flow-shadow/run.cjs" "$LAB" 28 "$LOGS/domus-28.jsonl" "$protocol"
node "$evidence/integrated-shadow-xhigh/replay.cjs" "$LAB" "$LOGS/domus-28-replay.jsonl"
node "$evidence/integrated-shadow-xhigh/control-administration.cjs" "$DOMUS_28_CHECKOUT" "$PNPM_VIRTUAL_STORE"
```
