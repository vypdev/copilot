# #950 real-PR shadow review results

**Three historical false positives refuted, two real documentary defects
confirmed, one valid inconclusive and one investigation ended before a
verdict.** Five real PRs supplied seven findings from four selected published
reviews and one successful no-finding check. The pilot reused the deployed
detector's exact-head output and made no new detector calls. All seven
findings received a fresh Sol session. The report is a historical shadow
diagnostic and does not establish production detection recall or qualification.

[Preregistration](preregistration.md) ·
[Frozen commit](https://github.com/vypdev/copilot/commit/8866fa5c4849d6649cb379b0e31c8be7b0b88aa5) ·
[Producer and tree provenance](cohort.json) · [Deterministic controls](controls.json) ·
[Original ledger](ledger.jsonl) · [Audited results and all exact citations](audited-results.json)

## Findings

Input is gross and includes cached tokens. Costs shown are measured tokens
for the verification only. The provider did not return a billed amount.
A recovered final is a response that Sol already returned in the measured
session and that the offline audit validated against the same prompt and
retrieval receipts. It uses zero extra model calls.

| Historical detector finding | Independent Sol verdict | Decisive evidence and independent comparison | Seconds · turns · input/output tokens |
| --- | --- | --- | --- |
| [Domus #24, composite foreign key would block creation and migration](https://github.com/vypdev/domus/pull/24#discussion_r4443394859) | **Unfinished**, no verdict | Sol read the unchanged [index declaration](https://github.com/vypdev/domus/blob/e129e76e25deff7314efe3b72996d295cf73f7f3/backend/src/domus/infrastructure/sqlite_task_schema.py#L3-L5) and queried SQLite 3.53.3 release source after establishing the locally probed version. Its final recorded turn requested more official evidence about the index rule and an exact schema8 fixture read. The independent exact-head creation and migration tests refute the historical finding, without crediting the verifier. [Independent record](https://github.com/vypdev/copilot/issues/859) | 56.7 · 6 · 99,003/1,539 |
| [Domus #24, owner-spec blob ID is wrong](https://github.com/vypdev/domus/pull/24#discussion_r4443394870) | **Confirmed**, live | The [cited object](https://github.com/vypdev/domus/blob/e129e76e25deff7314efe3b72996d295cf73f7f3/specs/household-administration-integration.md#L40-L42) differs from the actual blob read in the [stated base](https://github.com/vypdev/domus/blob/4b71969d3b3f6df5f28d617ab0da4e86c9be5884/specs/household-administration.md#L1-L13). Independent Git object lookup reproduced the mismatch. The historical dismissal was excluded from the verifier and evaluator's judgment. [Git control](controls.json) | 24.7 · 3 · 32,831/625 |
| [Domus #28, Playwright ignores the enabled option](https://github.com/vypdev/domus/pull/28#discussion_r4452825495) | **Refuted**, recovered final | The [unchanged lockfile](https://github.com/vypdev/domus/blob/b9a2dfc8179128fb493ab49666c24967d308c979/pnpm-lock.yaml#L33-L35) resolves Playwright 1.64.1. The [release matcher](https://github.com/microsoft/playwright/blob/cfe490d941f992655948eee8fd4fd94e1c4234bf/packages/playwright/src/matchers/matchers.ts#L152-L162) selects the disabled check when the option is false. Sol traced [the test](https://github.com/vypdev/domus/blob/b9a2dfc8179128fb493ab49666c24967d308c979/frontend/tests/e2e/catalog.spec.ts#L106-L115) through the story and button configuration. The exact-head frontend run and locked Chromium matcher control corroborate it. [Consumer CI](https://github.com/vypdev/domus/actions/runs/41610125553/job/125829637535) · [Independent browser control](../v4/results.md#controls-and-trial-integrity) | 54.8 · 6 · 103,262/1,408 |
| [Domus #29, a historical exception aborts replacement at materialization](https://github.com/vypdev/domus/pull/29#discussion_r4500071414) | **Inconclusive**, recovered final | Sol found the downstream [predicate](https://github.com/vypdev/domus/blob/3d890522003c2d2e7d03fa1f51b1bd84f0d0f10f/backend/src/domus/application/fixed_batch_review.py#L363-L372) and [suppression](https://github.com/vypdev/domus/blob/3d890522003c2d2e7d03fa1f51b1bd84f0d0f10f/backend/src/domus/application/fixed_materialization.py#L232-L243), but could not show a reachable historical-only exclusion. The independent SQLite restoration test and guard-removal control identify the earlier source guard that prevents this route. [Independent control](../v4/results.md#controls-and-trial-integrity) | 60.3 · 5 · 91,726/1,305 |
| [Domus #29, roadmap claims relative maintenance is unwired](https://github.com/vypdev/domus/pull/29#discussion_r4500071416) | **Confirmed**, recovered final | The [roadmap statement](https://github.com/vypdev/domus/blob/3d890522003c2d2e7d03fa1f51b1bd84f0d0f10f/docs/roadmap.md#L26) contradicts the [maintenance composition](https://github.com/vypdev/domus/blob/3d890522003c2d2e7d03fa1f51b1bd84f0d0f10f/backend/src/domus/composition/recurrence.py#L39-L54), called through the [unchanged worker](https://github.com/vypdev/domus/blob/3d890522003c2d2e7d03fa1f51b1bd84f0d0f10f/backend/src/domus/infrastructure/recurrence_worker.py#L67-L90). The follow-up corrected the roadmap with a byte-identical composition blob. [Git control](controls.json) · [Follow-up](https://github.com/vypdev/domus/commit/e222212cda04890fb60831c9c3fad22ff04f8a2b) | 67.6 · 5 · 83,190/1,612 |
| [HA UI #10, padding click should hit the input](https://github.com/vypdev/ha-ui/pull/10#discussion_r4473894574) | **Refuted**, recovered final | The [16px horizontal inset](https://github.com/vypdev/ha-ui/blob/55174696e97a4c8b424c7f57d7da7a61e4b157fd/packages/core/src/components/field.ts#L24-L30) places (4,4) in the control padding. The [control click handler](https://github.com/vypdev/ha-ui/blob/55174696e97a4c8b424c7f57d7da7a61e4b157fd/packages/core/src/components/field.ts#L147-L153) explains why input focus can still occur. Native three-engine observations corroborate the hit target in the original test. The broker found no official document for the specific positional query. [Independent browser record](https://github.com/vypdev/copilot/issues/891) | 70.8 · 6 · 81,635/1,333 |
| [HA UI #10, drag suppresses the next legitimate click](https://github.com/vypdev/ha-ui/pull/10#discussion_r4473894599) | **Refuted**, live | The [viewport listener](https://github.com/vypdev/ha-ui/blob/55174696e97a4c8b424c7f57d7da7a61e4b157fd/packages/core/src/components/navigation-overflow.ts#L24-L30) receives the new mousedown. The [handler clears suppression](https://github.com/vypdev/ha-ui/blob/55174696e97a4c8b424c7f57d7da7a61e4b157fd/packages/core/src/components/navigation-overflow.ts#L89-L111) before [the tab activation](https://github.com/vypdev/ha-ui/blob/55174696e97a4c8b424c7f57d7da7a61e4b157fd/packages/core/src/components/tabs.ts#L69-L77) consumes it. The exact-head Chromium control emits once on the original and zero times when the reset is removed. [Independent browser control](../reserved-navigation-diagnostic/browser-control.jsonl) | 34.6 · 4 · 44,725/769 |

[Domus #31's successful review check](https://github.com/vypdev/domus/runs/128108103928)
reports no findings at `82b7e0f72`. There was no candidate to verify.
This records detector coverage for the selected run, without establishing
that the PR was defect-free.

## Contribution of broader investigation

The Playwright verifier first attempted to resolve whether the option was
ignored. The broker refused the unproven version request. After reading the
lockfile, Sol requested the same question for 1.64.1 and received the
[versioned docs](https://github.com/microsoft/playwright/blob/cfe490d941f992655948eee8fd4fd94e1c4234bf/docs/src/api/class-locatorassertions.md#L756-L805)
and the release matcher, which it cited. This resolved the library premise.
Reading the component and story connected the option to the real disabled
button. The roadmap verifier used unchanged lifecycle entry points and the
worker to establish reachability rather than inferring it from the presence
of a service. Git metadata in the audit identifies unchanged files and
whether each head range intersects changed lines.

## Metering incident and audit

The live runner summed the cumulative usage values returned by resumed Codex
CLI sessions. This caused five premature stops recorded as
`token-budget-or-unknown`. Actual consumption stayed below the frozen
limits. The [offline audit](audit-usage.cjs) matches each saved rollout to the
recorded session digest and each prompt to its exact hash, verifies the
reported cumulative value and delta against the rollout for every turn, and
replays broker observations and citation validation against the immutable
trees without model calls. Four stopped sessions had already emitted final
responses. Their validated outcomes are shown separately from the two live
verdicts. The SQLite session's last response was a request. It remains
unfinished and receives no synthetic verdict. Full rollouts remain local.
The audit publishes their hashes, terminal response hashes, verified usage
and verdict evidence. [Codex token accounting](https://github.com/openai/symphony/blob/main/elixir/docs/token_accounting.md)

The measured window was 12:08:44–12:11:27 UTC on 2026-11-11. The seven
independent sessions used 35 turns, 536,372 gross input tokens, including
382,848 cached tokens, and 8,591 output tokens. There were zero GitHub write
attempts during detection replay, measured verification and offline audit.
The source trees and previous pilot artifacts are preserved. PR #951 remains
draft and production verification remains disabled.

## Reproduce the audit

Run the frozen controls as described in the preregistration. If the original
local Codex rollouts are present, use the pinned Git and official-source
fixture lab to regenerate the audit.

```sh
node audit-usage.cjs "$LAB" ledger.jsonl "$ROLLOUT_DIRECTORY" \
  2026-11-11T12:08:44Z 2026-11-11T12:11:27Z > /tmp/shadow-real-prs-audit.json
cmp audited-results.json /tmp/shadow-real-prs-audit.json
```
