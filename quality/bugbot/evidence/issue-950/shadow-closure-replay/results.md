# Prepared-candidate shadow replays for #950

The replay starts at the normal verifier adapter with the candidate frozen in
the earlier [normal-flow pilot](../normal-flow-shadow/results.md). It passes the
same claim, anchor, head, comparison and effective model. Both original models
use low effort. Each attempt opens a new verifier session. The prior verdicts,
decisive ranges, SQLite tests and Chromium observations are evaluator inputs.
The run does not invoke the detector. The per-attempt ledgers preserve protocol
hashes, the frozen candidate, reads, closure issues, verdict and write count.

| Prepared candidate | Model and head | Attempt | Observed verdict | Expected verdict | Exact evidence and result |
|---|---|---|---|---|---|
| Domus #24, composite parent key, anchor line 8 | Luna · `e129e76e25deff7314efe3b72996d295cf73f7f3` | [Initial](domus-24-luna.jsonl) | `inconclusive` | `refuted` | The probe rejected the backend manifest receipt. Luna closed after the same session requested official evidence again. It missed the effective index and its installation order. |
| Domus #24, same candidate | Luna · same head | [Basis guidance](domus-24-luna-follow-up.jsonl) | `confirmed` | `refuted` | An exact search for one inline constraint spelling missed the standalone index. Luna cited schema composition but skipped the official lookup and drew an unsupported conclusion. |
| Domus #24, same candidate | Luna · same head | [Code refutation](domus-24-luna-index.jsonl) | `refuted` | `refuted` | It found the unique index and traced the execution loop. Its citations stopped before the profile entry and omitted the official source. |
| Domus #24, same candidate | Luna · same head | [Provider interruption](domus-24-luna-provider-interruption.jsonl) | Technical failure | `refuted` | The transport reported an unexpected provider item and stopped before a verdict. |
| Domus #24, same candidate | Luna · same head | [Same-protocol retry](domus-24-luna-final.jsonl) | `refuted` | `refuted` | It cited the exact index and the version-matched official rule. The fresh-order citation still stops before the profile entry. The full evidence criterion remains unmet. |
| Domus #29, stale creation receipt, anchor lines 73–75 | Sol · `57a8b4c6a9f52afb1ffc8e38275bcfd13575a3ae` | [Initial](domus-29-sol.jsonl) | `confirmed` | `confirmed` | The cited controller and form ranges contain the two decisive operations. The Chromium control reproduced the behavior. |

## Domus #24 evidence

In the initial attempt, the broker returned `runtime-basis` when Luna used
`backend/pyproject.toml` as proof. Its two official lookups returned
`official-version-not-proven`. The accepted inconclusive verdict names the
missing accredited SQLite release and its matching official source. Its citation
to the inline table declaration fails to support its statement about the
effective parent key.

The next attempt added a specific prerequisite to the broker error and
strengthened the search instructions. Luna searched for an inline declaration
with the exact target columns. That search returned no result. It cited the ordered schema expansion but did not follow the imported task
statements. It also emitted a
conclusion about SQLite without calling the official-source operation. The
final runner extends the closure check to a catalogued dependency named in the
conclusion, including when no lookup occurred.

The first code refutation exposed that checking the closing prose alone can
lose a dependency identified by the anchored file. The final runner retains
that dependency requirement from the prepared candidate. The first run with
this policy was interrupted by the provider. The same-protocol retry resolved
SQLite 3.53.3 with `version: null` using the delivered runtime receipt.
The official lookup returned source and retained the local-only scope.
Luna cited the exact parent index at `sqlite_task_schema.py:3–5` and the
official parent-key rule at `fkey.c:142–182`. Lines 144–151 describe the
constraint and the matching unique index. This is a valid version-matched
source citation. The fixed line inventory also tracks the implementation at
230–233, which the session did not cite.

For initialization the final premise cites `sqlite.py:87–100` and
`sqlite.py:276–302`. The first range contains the task expansion at line 97
and stops one line before the profile expansion at line 101. The second
covers connection setup. It contains neither the execution loop at 369–371
nor the migration at 378–390. The migration claim also needs to distinguish
versions below 5, which add the index in this migration, from later versions
where the task schema is already installed. The verdict label and SQLite
version proof passed. The cited installation order remains incomplete.

The independent check verified 529 tracked blobs of the evaluator checkout
against the pinned tree and ran the 74 profile tests successfully under Python
3.14.6 and SQLite 3.53.3. The parent's separately declared unique index covers
the exact pair. Fresh initialization installs the task statements before the
profile statements. The release source selects a non-partial unique index with
matching columns. The local result leaves the linked SQLite release of the
historical hosted CI unproven.
[Unique index](https://github.com/vypdev/domus/blob/e129e76e25deff7314efe3b72996d295cf73f7f3/backend/src/domus/infrastructure/sqlite_task_schema.py#L4-L6) ·
[Initialization order](https://github.com/vypdev/domus/blob/e129e76e25deff7314efe3b72996d295cf73f7f3/backend/src/domus/infrastructure/sqlite.py#L97-L101) ·
[SQLite 3.53.3 implementation](https://github.com/sqlite/sqlite/blob/92a6c5c3636faa021ecc3be5403a00f50f65eda7/src/fkey.c#L229-L275) ·
[Local tests](sqlite-control.txt)

## Domus #29 evidence

Premise 4 cited the controller's lines 125–135. Line 127 stores the outcome,
line 132 returns after patching only the notice, and line 133 starts the
operation whose state reset the invalid request never reaches. The premise
also cites the patch and reset implementations. Premise 6 cited the form's
lines 62–76. The invalid notice opens the form and the next branch clears it
when the view still has a committed creation receipt and the draft matches.
Those exact ranges support the two material claims. The previous Sol report
described the same return while citing neighboring controller ranges.

The [Chromium rerun](chromium-control.json) exercised both states at the
same pinned head. With no prior receipt the rejected draft stayed open with its
description. With a prior committed receipt it cleared and closed. The second
submission made no new server request.
[Controller](https://github.com/vypdev/domus/blob/57a8b4c6a9f52afb1ffc8e38275bcfd13575a3ae/frontend/src/application/task-controller.ts#L125-L135) ·
[Form](https://github.com/vypdev/domus/blob/57a8b4c6a9f52afb1ffc8e38275bcfd13575a3ae/frontend/src/presentation/domus-tasks.ts#L62-L76)

## Outcome

Sol met the expected verdict and both decisive citation checks. Luna reached
the expected refutation and proved the versioned official lookup on the last
attempt. Its exact citation gap for schema installation prevents acceptance of
the complete SQLite case. The [offline evaluation](evaluation.json) verifies
46 cited ranges against pinned sources and records the exact-range checks,
including misses. All six sessions were distinct and recorded zero attempts to
write to either evaluated PR. These results are shadow evidence. The PR
remains a draft and production activation remains disabled.

## Reproduce and evaluate

Prepare the remote-free Git repository and versioned official source cache as
described in the [earlier pilot](../shadow-real-prs/preregistration.md#reproduction).
Use a fresh output filename. The following replay commands call the provider.
The evaluator works offline and checks the Git object, text hashes, receipt
ranges, separate sessions and zero writes. The case assessment above checks
whether the cited statements actually establish the claimed behavior.

```sh
pnpm run test:bugbot-shadow-verification
replay=quality/bugbot/evidence/issue-950/shadow-closure-replay
node "$replay/replay.cjs" "$fixture_dir" 24 /tmp/domus-24-replay.jsonl "$pinned_local_python"
node "$replay/replay.cjs" "$fixture_dir" 29 /tmp/domus-29-replay.jsonl
node "$replay/evaluate.cjs" "$fixture_dir" "$replay"/domus-*.jsonl
```

The SQLite evaluator used `.venv/bin/python -m pytest
tests/backend/test_sqlite_member_profiles.py -q` in the pinned source archive.
The Chromium evaluator reused the
[stale-receipt control](../normal-flow-shadow/control-stale-receipt.cjs) with
the pinned checkout, resolved packages and local browser.
