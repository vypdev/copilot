# Normal Bugbot flow in shadow for #950

## Selection and execution

The [pinned subjects](subjects.json) were selected because Domus #24 had a
historical SQLite false positive and Domus #29 had an independently reproduced
functional finding. Each is a real PR at the indicated historical head and
comparison base. A local detached checkout provided the pinned trees and the
complete Git comparison. The replay used empty SCM discussion and SCM-supplied
rules. Archived findings and independent outcomes stayed in the evaluator.

Each review went through `DetectPotentialProblemsUseCase.invoke`, ordinary
candidate preparation and the production `FindingsAgentAdapter`,
`AgentCliClient` and execution planner. The native detector could inspect its
read-only checkout. Normal partitioning and retries determined the number of
detector calls. The integrated observer opened an independent broker-backed
session for each prepared active candidate, with the same resolved provider,
model and effort. The detector and verifier both ran at low effort with Codex
CLI 0.167.0-alpha.3.2. The pilot used a 260-second per-finding verification
deadline and a 46-second provider-turn deadline. Usage was optional telemetry.

The initial runs used the integrated observer. Follow-up runs used the same
subjects and model configuration after adding a guard for a conclusive response
that omits requested official evidence and correcting changed-file metadata to
compare against the real base even when base reads are closed. Initial records
retain their original verdicts and metadata. The ledger `implementation` field
identifies the managed parent `d497a644096fcdb1ae532b4c7d00a14a31c1cadd`. The runs
used the corresponding working changes before the evidence was committed.

| Pinned PR and head | Run | Resolved detector → verifier | Detector calls / raw findings / prepared candidates | Wall time | Evaluated PR write attempts |
|---|---|---|---:|---:|---:|
| [Domus #24](https://github.com/vypdev/domus/pull/24) · `e129e76e25deff7314efe3b72996d295cf73f7f3` | [Initial](domus-24-luna.jsonl) | `gpt-6-luna` → `gpt-6-luna` | 6 / 3 / 1 | 165.002 s | 0 |
| Domus #24 · same head | [Follow-up](domus-24-luna-follow-up.jsonl) | `gpt-6-luna` → no candidate | 4 / 0 / 0 | 52.164 s | 0 |
| [Domus #29](https://github.com/vypdev/domus/pull/29) · `57a8b4c6a9f52afb1ffc8e38275bcfd13575a3ae` | [Initial](domus-29-sol.jsonl) | `gpt-6.1-sol` → `gpt-6.1-sol` | 11 / 1 / 1 | 291.378 s | 0 |
| Domus #29 · same head | [Follow-up](domus-29-sol-follow-up.jsonl) | `gpt-6.1-sol` → no candidate | 11 / 0 / 0 | 205.520 s | 0 |

The raw findings in the first #24 run included two occurrences of the same
foreign-key hypothesis and an unlocated profile-read claim. Only the foreign-key
hypothesis reached normal publication preparation. The ledgers retain all raw
detector outputs by ID and title, including empty responses. The
provider-reported model was unavailable in both stages. The recorded model is
the effective configuration supplied to each call. Usage below is the last
available cumulative sample for each verifier session.

## Findings

| PR / candidate | Ordinary dry-run decision | Verifier result | Independent evaluation | Verifier time and use |
|---|---|---|---|---|
| #24 · [`sqlite_member_profile_schema.py:8`](https://github.com/vypdev/domus/blob/e129e76e25deff7314efe3b72996d295cf73f7f3/backend/src/domus/infrastructure/sqlite_member_profile_schema.py#L8) · profile foreign keys reference a non-unique composite key | One finding would publish | `confirmed` in the initial run. Cited the child key declaration, the inline parent table, profile insertion and enforcement. Two official requests returned `official-source-unavailable`. | False positive. The effective schema already creates the matching `task_member_scope` unique index. The evaluator's 74 tests passed under local SQLite 3.53.3. The historical runner's linked SQLite release remains unknown. | 50.155 s, 5 turns, 289,173 input and 1,464 output tokens reported |
| #29 · [`domus-tasks.ts:73–75`](https://github.com/vypdev/domus/blob/57a8b4c6a9f52afb1ffc8e38275bcfd13575a3ae/frontend/src/presentation/domus-tasks.ts#L73-L75) · a stale creation receipt can clear the next submitted draft | One finding would publish | `confirmed` in the initial run. Explained that local validation returns before clearing the previous outcome, so the earlier receipt satisfies the UI clearing condition. | Confirmed functional effect in Chromium. With a prior receipt, an invalid title clears the new description and closes the form. Without a prior receipt, the draft stays open and intact. The rejected submission made zero sends. | 84.083 s, 9 turns, 182,110 input and 1,776 output tokens reported |

For #24, `sqlite.py:67–73` alone does not inventory separately declared
indexes. The decisive code is the unique index at
[`sqlite_task_schema.py:5`](https://github.com/vypdev/domus/blob/e129e76e25deff7314efe3b72996d295cf73f7f3/backend/src/domus/infrastructure/sqlite_task_schema.py#L5)
and its installation before the profile declarations at
[`sqlite.py:97–101`](https://github.com/vypdev/domus/blob/e129e76e25deff7314efe3b72996d295cf73f7f3/backend/src/domus/infrastructure/sqlite.py#L97-L101).
The [SQLite release source and test evidence](../two-live-verifications/results.md)
explain why the matching unique index satisfies the local runtime's requirement.
The active runner now rejects a conclusive response that lacks an official
receipt after the session explicitly investigates that dependency. The
deterministic control proves that behavior. The fresh Luna follow-up found
zero candidates, so it provides no new live verdict on the index.

For #29, Sol cited the [form and receipt consumer](https://github.com/vypdev/domus/blob/57a8b4c6a9f52afb1ffc8e38275bcfd13575a3ae/frontend/src/presentation/domus-tasks.ts#L62-L114),
the [entry dispatch](https://github.com/vypdev/domus/blob/57a8b4c6a9f52afb1ffc8e38275bcfd13575a3ae/frontend/src/composition/entry-page.ts#L206-L220),
the [domain command parser](https://github.com/vypdev/domus/blob/57a8b4c6a9f52afb1ffc8e38275bcfd13575a3ae/frontend/src/domain/tasks.ts#L60-L71)
and the controller's prior-outcome and receipt writes. Its explanation included
the early validation return. Its final cited controller ranges stop before and
resume after the decisive
[`task-controller.ts:129–132`](https://github.com/vypdev/domus/blob/57a8b4c6a9f52afb1ffc8e38275bcfd13575a3ae/frontend/src/application/task-controller.ts#L129-L132)
guard. The application verified the provenance of the submitted citations. The
evaluator credits the functional verdict and records that citation gap. The
separate [Chromium control](control-stale-receipt.cjs) ran the pinned component,
intent decoder, controller and journal with an isolated mock server and
network blocked. Its [observations and hashes](stale-receipt-control.json)
record both paths. The earlier U+0085 candidate was absent from these live
detector outputs.

## Decision and reproducibility

Both effective models reached independent sessions through the usual Bugbot
entry in the initial runs. The follow-ups exercised the zero-candidate branch
with real detectors. The simulated native publication control also proves
that verifier failure or a reported model substitution leaves the same review
drafts and thread state. All four checkouts stayed clean and both layers of
write guards registered zero attempts. The matched false positive survived
the initial verifier. The independently reproduced defect survived, with one
gap in final citation coverage. The evidence supports the integration and
leaves verifier qualification pending. The PR remains a draft and production
verification stays disabled.

Prepare the remote-free bare Domus fixture and verified official source cache
using the [prior fixture instructions](../shadow-real-prs/preregistration.md#reproduction)
and the commits in [subjects.json](subjects.json). Each live replay invokes
the configured provider. Use a new output filename for each attempt.

```sh
pnpm run test:bugbot-shadow-verification
pnpm exec jest --runInBand --runTestsByPath \
  src/application/usecases/steps/commit/__tests__/bugbot_review_lifecycle.e2e.test.ts
node quality/bugbot/evidence/issue-950/normal-flow-shadow/run.cjs \
  "$fixture_dir" 24 /tmp/domus-24-new.jsonl
node quality/bugbot/evidence/issue-950/normal-flow-shadow/run.cjs \
  "$fixture_dir" 29 /tmp/domus-29-new.jsonl
node quality/bugbot/evidence/issue-950/normal-flow-shadow/control-stale-receipt.cjs \
  "$pinned_domus_29_checkout" "$domus_pnpm_virtual_store"
```

The Chromium command uses the clean pinned #29 checkout, the specified package
versions in a pnpm virtual store and the local Playwright browser. Its output
records the lockfile and bundle hashes. The pilot log and historical evaluator
remain independent of the next verification prompt.
