# Shadow replay of execution-order evidence for #950

## Inputs and checks

This replay starts at the normal verifier adapter with the Domus #24
prepared candidate frozen in the [normal-flow ledger](../normal-flow-shadow/domus-24-luna.jsonl).
It uses Luna at low effort, head
`e129e76e25deff7314efe3b72996d295cf73f7f3`, and the existing anchor at
`sqlite_member_profile_schema.py:8`. It sends the normal candidate context.
The expected refutation, source ranges, and local test results remain in the
evaluator. The read-only broker and dry-run ports retain their write guards.

The closure checks the first operation, second operation, and ordering
mechanism for each claimed route. The offline evaluator validates receipt
ranges and SHA, then checks that the cited excerpts cover the two schema
entries and the execution loop, the exact unique index, and the applicable
official SQLite rule. If the verdict relies on migrations, the assessment
also checks whether it distinguishes versions below 5 from versions with
the index already present.

The first [provider attempt](domus-24-luna-expired.jsonl) reached its
46-second first-turn deadline with zero source requests and zero attempted
PR writes. It produced no verdict. The technical retry kept the candidate,
model, and protocol unchanged.

The environment probe measured Python 3.14.6 and SQLite 3.53.3 locally.
The SQLite library linked by the historical hosted CI remains unproven.
The independent local control reran the 74 member profile tests successfully.
[Earlier runtime and test evidence](../shadow-closure-replay/results.md)

## Observed outcome

| Attempt | Provider outcome | Evidence before interruption | Attempted PR writes |
|---|---|---|---:|
| [Initial](domus-24-luna-expired.jsonl) | `provider-expired` on turn 1 | No source requests | 0 |
| [Technical retry](domus-24-luna-interrupted.jsonl) | `unexpected-provider-tool` on turn 3 | The broker returned the profile schema, initialization file, and scoped runtime receipt. | 0 |
| [Final technical retry](domus-24-luna-closure.jsonl) | `unexpected-provider-tool` on turn 7 | Luna reached the closure twice in the same thread. It requested more source after the first response from closure. | 0 |

The first three attempts used the same timed protocol. None emitted an accepted verdict.
The final attempt received the index definition and both entries and the loop
from the pinned tree. It also resolved SQLite 3.53.3 from the runtime receipt
with `version: null`. Its two searches of the official source returned
`official-no-match`. The release was accredited and no official excerpt was
delivered.

On turn 4, closure rejected the ordering mechanism excerpts for the fresh
database and migration routes because their quoted text did not occur in
their cited ranges. It also requested the missing official evidence. The
same thread read `sqlite.py:338–383` and `sqlite_task_schema.py:3–6` and
searched the official source again. On turn 6, closure identified a sequence
premise with no structured order proof. The next provider turn was
interrupted. These were recovery requests for drafts. There are no final
citations to score.

A [follow-up without verifier deadlines](domus-24-luna-no-deadline.jsonl)
kept the same pinned candidate and Luna at low effort. It received a
provider response on turn 1. The response failed the investigation shape
check before any source request. No verdict or write attempt was recorded.
The virtual-clock control demonstrates that elapsed time beyond the former
46-second turn and 260-second investigation limits leaves a valid session
active. Explicit cancellation remains covered.

The independent evaluator verified the SHA, anchor, model, unique sessions
and zero attempted writes across the four attempts. Its source checkpoints identify exactly what
still needed final citation. [Offline evaluation](evaluation.json)

| Evidence required for the pinned case | Independent checkpoint |
|---|---|
| Unique index on the exact parent pair | [`sqlite_task_schema.py:5`](https://github.com/vypdev/domus/blob/e129e76e25deff7314efe3b72996d295cf73f7f3/backend/src/domus/infrastructure/sqlite_task_schema.py#L5) |
| Task entry, profile entry, and effective execution loop | [`sqlite.py:97–101`](https://github.com/vypdev/domus/blob/e129e76e25deff7314efe3b72996d295cf73f7f3/backend/src/domus/infrastructure/sqlite.py#L97-L101) · [`sqlite.py:369–371`](https://github.com/vypdev/domus/blob/e129e76e25deff7314efe3b72996d295cf73f7f3/backend/src/domus/infrastructure/sqlite.py#L369-L371) |
| Official rule for the accredited local runtime | [SQLite 3.53.3, `fkey.c:144–151`](https://github.com/sqlite/sqlite/blob/92a6c5c3636faa021ecc3be5403a00f50f65eda7/src/fkey.c#L144-L151) |
| Conditional migration, if the verdict relies on it | [`sqlite.py:378–390`](https://github.com/vypdev/domus/blob/e129e76e25deff7314efe3b72996d295cf73f7f3/backend/src/domus/infrastructure/sqlite.py#L378-L390). The migration adds the task index below version 5. A verdict about later versions must ground the pre-existing index. |

The eight focused controls demonstrate same-session recovery, route
narrowing, exact excerpt validation, inconclusive closure when proof stays
unavailable, continuation without a time cutoff, and the unchanged
foreign-receipt failure. The live run
demonstrates the two recovery requests and leaves the expected refutation
and final citation checks pending. Production activation remains disabled.

## Replays at xhigh reasoning effort

The follow-ups use the same frozen subjects and the new order closure. An
explicit replay effort selects the provider setting for each invocation.
The two runs keep the original models, Git heads and anchors. The ledgers
record the override separately from the frozen `low` effort. The active
verifier imposes no elapsed-time cutoff. No repository or organization
variables were edited by the pilot.

Domus #24 is compared with the low-effort attempts in this report. Domus
#29 is compared with the [previous Sol closure replay](../shadow-closure-replay/results.md#domus-29-evidence),
which confirmed the stale-receipt defect at low effort under the previous
closure protocol. The observations are specific to the recorded attempts
and their protocols.

### Domus #24 at xhigh

[Luna's session](domus-24-luna-xhigh.jsonl) returned `refuted` after 12
turns and 844.794 seconds. Its longest completed provider turn took
228.555 seconds. The closure asked Luna to repair order excerpts and to
ground a sequence premise on turn 9. It continued in the same thread
and supplied corrected evidence. The evaluator checked 35 cited ranges
against the pinned source and release.

Luna cited the exact `UNIQUE` index at `sqlite_task_schema.py:5` and the
rule at `fkey.c:144–147` for the locally accredited SQLite 3.53.3. For
fresh initialization it cited the task entry at `sqlite.py:97`, the
profile entry at line 101, and the branch and execution loop at
369–371. It linked those entries to the index declaration and both
profile foreign keys.
[Unique index](https://github.com/vypdev/domus/blob/e129e76e25deff7314efe3b72996d295cf73f7f3/backend/src/domus/infrastructure/sqlite_task_schema.py#L5) ·
[Schema entries](https://github.com/vypdev/domus/blob/e129e76e25deff7314efe3b72996d295cf73f7f3/backend/src/domus/infrastructure/sqlite.py#L97-L101) ·
[Execution loop](https://github.com/vypdev/domus/blob/e129e76e25deff7314efe3b72996d295cf73f7f3/backend/src/domus/infrastructure/sqlite.py#L369-L371) ·
[SQLite release rule](https://github.com/sqlite/sqlite/blob/92a6c5c3636faa021ecc3be5403a00f50f65eda7/src/fkey.c#L144-L147)

For versions 1–4, the cited migration inserts the task statements
conditionally at line 383, places the profile statements at line 387,
and executes the ordered list at 389–390. For versions 5–8, Luna cited
the matching index in each tracked input: v5:55, v6:79, v7:39, and v8:61.
Its conclusion was limited to the repository-defined fresh and
migration routes and those tracked inputs. The SQLite version of the
historical hosted CI remains unproven. The independent evaluator
confirmed both the fresh and migration evidence. This case met the
expected refutation and exact citation criteria.
[Migration branch](https://github.com/vypdev/domus/blob/e129e76e25deff7314efe3b72996d295cf73f7f3/backend/src/domus/infrastructure/sqlite.py#L378-L390)

### Domus #29 at xhigh

[Sol's session](domus-29-sol-xhigh.jsonl) returned `confirmed` after
13 turns and 537.731 seconds. Its longest completed provider turn took
132.994 seconds. The closure asked for exact mechanism excerpts on six
routes on turn 11. Sol continued in the same thread and supplied corrected
evidence before finishing. The evaluator checked 83 cited ranges against
the pinned Git tree.

The supported route is a second, locally invalid creation under unchanged
authorization after a prior successful creation. Sol cited the command
validation and early return at `task-controller.ts:131–132`, with the
ordering code at 129–133. It cited the opening of the invalid form at
`domus-tasks.ts:65`, the subsequent clearing at line 75 and the guard at
73–75. Its evidence also traces the saved receipt, same-authority
reconciliation and publication of the unchanged task outcome.
[Early return](https://github.com/vypdev/domus/blob/57a8b4c6a9f52afb1ffc8e38275bcfd13575a3ae/frontend/src/application/task-controller.ts#L129-L133) ·
[Form update](https://github.com/vypdev/domus/blob/57a8b4c6a9f52afb1ffc8e38275bcfd13575a3ae/frontend/src/presentation/domus-tasks.ts#L62-L76)

The independent Chromium rerun matched the previous control byte for byte.
The invalid draft stayed open without a prior receipt. With a prior
committed receipt, the draft cleared and closed. The invalid submission
sent no new request. Sol met the expected verdict and exact citation
criteria for this route. The prior `low` replay also confirmed the defect.
This replay records explicit order evidence and same-thread recovery
under the new contract. [Chromium control](../shadow-closure-replay/chromium-control.json)

## Decision

Both xhigh replays met their individual verdict and evidence criteria.
Each exceeded the former turn and investigation limits and recovered an
incomplete closing draft in the same thread. The pinned scope, model,
anchor, and write guards remained intact. All six recorded attempts in
this report attempted zero writes to the evaluated PRs. The two xhigh
runs supplied 118 validated citations. [Offline evaluation](evaluation.json)

The low-effort Luna runs under this order protocol ended without an
accepted verdict. The earlier low-effort Sol run already confirmed its
case under the preceding closure protocol. The replays establish the
observed xhigh outcomes and their evidence. They do not isolate reasoning
effort as the only cause of the differences across the protocols. These
case results leave production activation disabled.

## Reproduction

Use the remote-free fixture and verified official source cache described in
[the prior replay](../shadow-closure-replay/results.md#reproduce-and-evaluate).
The replay commands call the provider. The evaluator checks each ledger
offline. Use a fresh output filename for each replay.

```sh
pilot=quality/bugbot/evidence/issue-950
node "$pilot/shadow-closure-replay/replay.cjs" "$fixture_dir" 24 /tmp/order-24.jsonl "$pinned_local_python"
node "$pilot/shadow-closure-replay/replay.cjs" "$fixture_dir" 24 /tmp/order-24-xhigh.jsonl "$pinned_local_python" --effort xhigh
node "$pilot/shadow-closure-replay/replay.cjs" "$fixture_dir" 29 /tmp/order-29-xhigh.jsonl --effort xhigh
node "$pilot/shadow-order-replay/evaluate.cjs" "$fixture_dir" /tmp/order-24-xhigh.jsonl
node "$pilot/shadow-order-replay/evaluate.cjs" "$fixture_dir" /tmp/order-29-xhigh.jsonl
pnpm run test:bugbot-shadow-verification
```
