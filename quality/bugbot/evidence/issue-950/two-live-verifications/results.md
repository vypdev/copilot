# #950 two live shadow verifications

Both live GPT-6.1 Sol sessions returned evidence-backed verdicts. SQLite was
**refuted** and the Unicode whitespace defect was **confirmed**. The
investigations used the read-only [runner at 92791402b](https://github.com/vypdev/copilot/tree/92791402bd1ac6cc9fe214ec4a2d43ce8dd2760a/quality/bugbot/evidence/issue-950/shadow-verification)
with the previous Sol/low profile. The runner held one distinct provider
session per finding. Both sessions finished in eight turns without context
recovery, interruption, or GitHub write attempts.

[Fixed inputs](inputs.json) · [Pre-measurement hashes](frozen.sha256) ·
[Evaluator-only facts](evaluator.json) · [Raw ledger](ledger.jsonl) ·
[Receipt and outcome audit](audit.json)

| Historical finding and reviewed commit | Live verdict | Independent evidence | Latency | Cumulative input / output tokens |
| --- | --- | --- | ---: | ---: |
| [Domus #24, composite foreign key](https://github.com/vypdev/domus/pull/24#discussion_r4443394859), `e129e76e2`, line 8 | **Refuted** | All 74 pinned profile tests passed, including fresh creation and all eight real migration fixtures. | 72.062 s | 179,392 / 1,765 |
| [Domus #29, review actions enabled by whitespace](https://github.com/vypdev/domus/pull/29#discussion_r4497291296), `57a8b4c6a`, line 153 | **Confirmed** | Chromium reproduced both actions becoming clickable with U+0085 and reporting `invalid_input`, with zero sends to the mock server. | 69.600 s | 203,986 / 1,737 |

Latency is the runner's elapsed wall time per finding, including source reads.
Input totals include cached input. The ledger retains each cumulative provider
snapshot. The table uses the final snapshot of each session.

## SQLite parent index

The candidate and anchor are byte-identical to the archived Domus #24 finding.
The live verifier found that `TASK_STATEMENTS` defines an external unique
index for the exact referenced pair. Fresh initialization creates the index
before the profile tables. Old migrations create the index or inherit it from
the prior schema before profile backfill. The schema8 dump contains it.
New-member insertion precedes profile creation. These sources directly
contradict the asserted missing-parent-key mismatch.

- [Composite foreign key and profile DDL](https://github.com/vypdev/domus/blob/e129e76e25deff7314efe3b72996d295cf73f7f3/backend/src/domus/infrastructure/sqlite_member_profile_schema.py#L5-L20)
- [Unchanged unique index](https://github.com/vypdev/domus/blob/e129e76e25deff7314efe3b72996d295cf73f7f3/backend/src/domus/infrastructure/sqlite_task_schema.py#L3-L5)
- [Initialization order](https://github.com/vypdev/domus/blob/e129e76e25deff7314efe3b72996d295cf73f7f3/backend/src/domus/infrastructure/sqlite.py#L92-L103)
  and [migration ordering](https://github.com/vypdev/domus/blob/e129e76e25deff7314efe3b72996d295cf73f7f3/backend/src/domus/infrastructure/sqlite.py#L361-L390)
- [Schema8 fixture](https://github.com/vypdev/domus/blob/e129e76e25deff7314efe3b72996d295cf73f7f3/tests/fixtures/sqlite/v8.sql#L61)
  and [member save path](https://github.com/vypdev/domus/blob/e129e76e25deff7314efe3b72996d295cf73f7f3/backend/src/domus/infrastructure/sqlite_identity.py#L89-L99)
- [Cited SQLite 3.53.3 release implementation](https://github.com/sqlite/sqlite/blob/92a6c5c3636faa021ecc3be5403a00f50f65eda7/src/fkey.c#L229-L233)
  and [official foreign-key rule](https://sqlite.org/foreignkeys.html#fk_indexes)

Sol established the locally measured release from the project's Python version
and the runner's runtime receipt, then requested the official matching source.
The local reproduction used CPython 3.14.6 linked to SQLite 3.53.3. The
[historical backend job](https://github.com/vypdev/domus/actions/runs/41459181271/job/125323533010)
used CPython 3.14.6 on Linux and a synthetic merge whose tree matches the
reviewed tree. Its log does not establish the linked SQLite version. The
[local 74-test record](sqlite-tests.txt) includes the original schema8 migration,
both persisted member defaults and a clean foreign-key check.

The [previous shadow session](../shadow-real-prs/results.md) stopped before a
verdict when it summed cumulative usage. This session continued to a live
refutation. No offline verdict recovery was used.

## Unicode whitespace in task review

The real detector comment, review snapshot and neutral check bind to the same
head and original line. The published review and check precede cancellation of
the historical workflow run. [Detector check](https://github.com/vypdev/domus/runs/128137879608)

Sol traced the [button guard and emitted intent](https://github.com/vypdev/domus/blob/57a8b4c6a9f52afb1ffc8e38275bcfd13575a3ae/frontend/src/presentation/domus-tasks.ts#L149-L156),
the [entry-page dispatch](https://github.com/vypdev/domus/blob/57a8b4c6a9f52afb1ffc8e38275bcfd13575a3ae/frontend/src/composition/entry-page.ts#L206-L220),
the [required-reason predicate](https://github.com/vypdev/domus/blob/57a8b4c6a9f52afb1ffc8e38275bcfd13575a3ae/frontend/src/domain/tasks.ts#L14-L19)
and the [controller rejection](https://github.com/vypdev/domus/blob/57a8b4c6a9f52afb1ffc8e38275bcfd13575a3ae/frontend/src/application/task-controller.ts#L129-L145).
The verdict also cited server-side action eligibility, the runtime view and
the displayed notice. U+0085 survives `trim()` but satisfies the Unicode
`White_Space` predicate, so the enabled button emits an intent that fails
validation before a request is sent.

The [Chromium control](functional-control.json) bundles the exact-source Lit
component and controller. It uses the pinned Lit 3.3.3 and Playwright 1.64.1
and reports Chromium 156.0.8078.4 and V8 15.6.75 from CDP. It exercises both
actions with ASCII space, U+0085 and a nonempty reason. The fixture bridges the
pinned verify/reopen dispatch, uses the real controller and journal, and
intercepts all network calls. ASCII space disables both buttons. U+0085 makes
them clickable and produces the visible invalid-input notice without calling
the mock server. A nonempty reason sends one command for each action.

The evaluator separately checked the [exact V8 implementation](https://github.com/v8/v8/blob/b976f35da8356fcf4e5e176d1d810ba6a6f05718/src/builtins/string-trim.tq#L16-L40),
[ECMAScript TrimString](https://tc39.es/ecma262/2026/#sec-trimstring) and the
[Unicode White_Space data](https://www.unicode.org/Public/17.0.0/ucd/PropList.txt).
The functional verdict cited repository source. The fixed runner catalog
did not deliver V8 or Unicode references to that session. This verdict
finished above the retired 200,000-input-token ceiling.

## Integrity and reproduction

The final audit re-read all 18 Git ranges at their reviewed SHAs and the
SQLite release citation from its authenticated source bytes. It matched each
citation to a delivered receipt and preserved both anchors. Both independent
controls were frozen before the first call and stayed outside the verifier
inputs. The evaluated PRs recorded zero writes from the runner. Historical
artifacts remain intact, PR #951 remains draft, and production activation is
disabled.

From this directory, verify the frozen inputs with
`shasum -a 256 -c frozen.sha256`. For the SQLite control, archive the reviewed
commit, install its lockfile with `uv sync --frozen --offline` in the archived
tree and run the command in `evaluator.json`. For the browser control, archive
`57a8b4c6a9f52afb1ffc8e38275bcfd13575a3ae` into an isolated tree and run
`node functional-control.cjs "$ARCHIVE" "$PNPM_VIRTUAL_STORE"` with the pinned
packages and Chromium available. These commands do not invoke a model.

To reproduce the live protocol, prepare a remote-free `domus.git` with the
two reviewed trees and their bases plus the official files described in the
[archived runner protocol](../shadow-real-prs/preregistration.md#reproduction).
Run `node run-two.cjs "$RUNNER_CHECKOUT" "$LAB" inputs.json "$NEW_LEDGER"` from
a clean checkout of `92791402b`. This command starts two new model sessions.
