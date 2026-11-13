# #950 — Installed evidence, publication gate and approval receipt

Production remains disabled. The managed pull request is a draft. This
iteration exercised the Action's installed verifier on frozen prepared
candidates and checked the publication and approval path with controlled
ports. It does not qualify a release profile.

## Shadow replay

The [frozen plan](../installed-profile/plan.json) pins Domus #28 at head
`b9a2dfc8179128fb493ab49666c24967d308c979`, base
`8b1cbc110c389b9cdb6ecd11317c95abf2c4b0a9`, and both tree IDs. Each prepared
candidate went to a fresh Codex session with GPT-6.1 Sol at `xhigh`. Detection
was reused, and the [independent observations](../integrated-shadow-xhigh/results.md)
were held out. The driver used the same Action input policy and installed
adapter as the earlier replay, with the new official and CI readers. It ran
locally, outside the hosted workflow.

| Candidate | Independent observation | Earlier installed replay | This replay |
|---|---|---|---|
| Matcher alleged to ignore `enabled: false`, `catalog.spec.ts:115` | The exact 1.64.1 matcher dispatches the false option to the disabled expectation. | Inconclusive. Upstream code was missing. | **Refuted in 135.803 s, six turns.** Sol cited the pinned call and [matcher implementation, lines 152–162](https://github.com/microsoft/playwright/blob/cfe490d941f992655948eee8fd4fd94e1c4234bf/packages/playwright/src/matchers/matchers.ts#L152-L162). |
| Definitive rejection disables correction, `domus-administration.ts:282` | Chromium reproduced the disabled Back control after rejection. | Inconclusive. Lit component retention was unproven. | **Confirmed in 1,231.136 s, 23 turns.** Sol linked the definitive conflict, restored editing authority, retained component draft and [Back guard, lines 276–284](https://github.com/vypdev/domus/blob/b9a2dfc8179128fb493ab49666c24967d308c979/frontend/src/presentation/domus-administration.ts#L276-L284). It cited [LitElement 4.2.2](https://github.com/lit/lit/blob/0fc671bc390cac3b9900fc3616347eeeecd91d5a/packages/lit-element/src/lit-element.ts#L162-L171) and [Lit HTML 3.3.3](https://github.com/lit/lit/blob/20afabd3c5bfd49fdcdf1b8518e05c7f99a46db6/packages/lit-html/src/lit-html.ts#L1673-L1678) for component retention. The conclusion was scoped to the demonstrated standalone route. |

The provider transport passed `gpt-6.1-sol`, `xhigh`, and read-only sandbox
settings. The longer session needed three same-session citation repairs.
Its longest turn took 174.666 seconds. The checkout stayed unchanged
and both replays attempted zero writes. Use the [recorded attempts](trials.jsonl) for exact durations and
optional usage. The [audit](audit.cjs) checks delivery and recomputes cited
range digests against the pinned Git object or approved upstream source.

## CI receipt

The [CI control](ci-control.jsonl) used the installed adapter and a simulated
verifier against the real GitHub Actions API. The receipt covers the exact
Domus head, run `41610125553`, attempt `1`, job `125829637535`, and
[step 16, Run pnpm test:frontend-catalog](https://github.com/vypdev/domus/actions/runs/41610125553/job/125829637535#step:16:1).
GitHub reported `completed/success`. GitHub did not report an associated PR.
The verifier cited the status and stayed inconclusive on the individual
matcher because the receipt did not establish the checkout or per-test
result. The controlled replay took 2.002 seconds and attempted zero writes.

## Publication and approval controls

| Case | Verified behavior |
|---|---|
| Confirmed, refuted, and inconclusive candidates in one review | The ordinary dry-run remains intact. The simulated verified projection removes the refuted finding, promotes the confirmed overflow finding, and retains the specific inconclusive gap. |
| Integrity or technical failure | Trusted enforcement stops before any finding, history, or status write. Shadow retains the ordinary publication decision. |
| Same head, different base | Trusted enforcement suppresses publication when the comparison revision changes after verification. |
| Complete provider observation | The verified publication facts bind the repository, PR, head, base, policy generation and digest. The native check serializer additionally binds the run and attempt. |
| Approval and policy changes | The approval repository consumes a current authoritative receipt. A policy change at the same head or a later incomplete, failed, or queued attempt blocks the old receipt. Shadow and dry-run do not authorize approval. |

The Action wires trusted receipt authority into both producer and consumer.
The installed rollout continues to admit disabled and shadow only; no
authority was installed. The existing approval prerequisites remain in place.

The official reader is initially limited to reviewed release sources and pnpm
consumer resolution. The CI receipt covers named-step metadata. Profile
qualification still requires the historical full-review comparison, exact
positive controls, integrity and latency, and the unchanged 174-case corpus.
Native Claude Code remains a separate requirement.

## Reproduce

Run from the Copilot repository with Node 24, dependencies installed, a read
credential for the Domus repository and a local Git object store containing
the pinned commits. Only the second command starts model sessions.

```sh
dir=quality/bugbot/evidence/issue-950/installed-evidence-and-receipt
node "$dir/replay.cjs" /path/to/domus.git /tmp/bugbot-950-ci-new.jsonl --ci
node "$dir/replay.cjs" /path/to/domus.git /tmp/bugbot-950-live-new.jsonl
node "$dir/audit.cjs" /path/to/domus.git "$dir/ci-control.jsonl"
node "$dir/audit.cjs" /path/to/domus.git "$dir/trials.jsonl"
pnpm run test:bugbot-shadow-verification
pnpm exec jest --runInBand installed_bugbot_official github_bugbot_ci_reader detect_potential_problems_use_case copilot_evidence_policy pull_request_approval_repository
pnpm run validate:specifications
pnpm run validate:workflows
```
