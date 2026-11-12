# #950 — Installed Action verifier profile

**Decision: no production profile qualifies.** The optional Action profile
and the checkout-backed shadow verifier passed deterministic controls. A live
replay with Codex and GPT-6.1 Sol inherited `xhigh` from the Luna reviewer
configuration. Both findings remained inconclusive because the installed
broker could not deliver the required official dependency evidence. Production
enforcement remains unavailable.

## Live shadow smoke test

The [frozen plan](plan.json) pins Domus #28 at head
`b9a2dfc8179128fb493ab49666c24967d308c979` and base
`8b1cbc110c389b9cdb6ecd11317c95abf2c4b0a9`, including both tree IDs and
the IDs of two earlier findings. The original ledgers prove the candidate
and anchor provenance. We did not repeat detection. The smoke test invoked
the actual Action input reader, configuration policy, installed checkout
adapter and managed provider transport, outside the hosted GitHub workflow.
The evaluator received the [Chromium and matcher controls](../integrated-shadow-xhigh/results.md);
the sessions did not. Both trials started independently in parallel. Codex
CLI was `0.167.0-alpha.3.2`.

| Candidate and exact anchor | Independent evidence | Shadow result | Turns | Wall time |
|---|---|---|---:|---:|
| Definitive rejection prevents correcting the retained draft, [`domus-administration.ts:282`](https://github.com/vypdev/domus/blob/b9a2dfc8179128fb493ab49666c24967d308c979/frontend/src/presentation/domus-administration.ts#L279-L282) | Chromium reproduced the disabled Back control after rejection. | **Inconclusive.** The verifier linked the save action, the rejection update and the disabled control. It could not establish component retention across the parent update with version-matched Lit source. | 11 | 371.425 s |
| Playwright allegedly ignores `enabled: false`, [`catalog.spec.ts:115`](https://github.com/vypdev/domus/blob/b9a2dfc8179128fb493ab49666c24967d308c979/frontend/tests/e2e/catalog.spec.ts#L108-L115) | The pinned Playwright matcher source contradicts the allegation. | **Inconclusive.** The verifier found the lockfile version and the actual call but the installed broker could not provide the implementation of the matcher. | 8 | 127.572 s |

All 19 provider turns used the resolved `gpt-6.1-sol` model argument and
`model_reasoning_effort=xhigh`. The provider events did not report a model ID
independently. No turn reported a technical failure. The longest turns took
173.059 and 28.251 seconds respectively. The [ledger](trials.jsonl) records
optional per-turn usage as reported by the provider; it was not an admission
or acceptance criterion. The [audit](audit.cjs) checks all 25 cited ranges
against the delivered receipts and recomputes their hashes from the pinned
Git tree. The checkout did not change. The replay had no GitHub mutation ports
and recorded **zero attempted writes**.

## Configuration controls and remaining qualification

The deterministic tests exercise absent and explicit verifier settings, the
default/reviewer inheritance and fallbacks, model and backend allowlists,
supported/rejected Codex effort, provider-native OpenCode variants with
OpenAI and Anthropic, and Cursor catalog model selection with no separate
effort. The tests include the same Action inputs through the normal Bugbot
workflow with controlled providers, preservation of ordinary publication
after verifier failure, no approval authority, and pinning of Git reads even
when the checkout contains different local text. Cursor and both OpenCode
backends were checked deterministically; no live session for those runtimes is
claimed here. A standalone Anthropic agent is not supported.

These replays are not an exact-profile full-review benchmark. The installed
Action needs a trusted way to deliver version-matched dependency sources and
matching CI evidence. After that, evaluate the exact intended detector and
verifier profiles against EV-07: historical false positives in fresh full
reviews, paired repetitions, exact-anchor positive controls, integrity and
latency, and the unchanged 174-case independent detection corpus. A separate
explicit maintainer decision is required even if a future profile passes.

## Reproduce

From the Copilot repository, with an authorized local Git checkout or object
store that contains the two pinned Domus commits:

```sh
node quality/bugbot/evidence/issue-950/installed-profile/audit.cjs /path/to/domus.git
pnpm run test:bugbot-shadow-verification
pnpm exec jest --runInBand bugbot_shadow_configuration_policy shadow_verification_adapter bugbot_review_lifecycle.e2e agent_execution_planner pull_request_approval_action
pnpm run eval:bugbot
pnpm run validate:specifications
pnpm run validate:workflows
```

To repeat the live smoke test with an authenticated Codex installation, write
to a new path. This makes model calls, reads only local Git objects, and
does not contact GitHub:

```sh
node quality/bugbot/evidence/issue-950/installed-profile/replay.cjs /path/to/domus.git /tmp/bugbot-950-installed-replay.jsonl
node quality/bugbot/evidence/issue-950/installed-profile/audit.cjs /path/to/domus.git /tmp/bugbot-950-installed-replay.jsonl
```
