# Deterministic causal replay for #918

All 12 original requests returned `search-file-budget` at `f1b782117`.
All 12 returned a sufficient pinned source chain after the correction.
Both runs used the original request objects, target order, trial identities,
candidate anchor, comparison and limits. The replay invoked zero models.

[Baseline records](before.jsonl) · [Corrected records with receipts](after.jsonl) ·
[SQLite controls](sqlite-controls.jsonl) · [Focused tests](retrieve.test.cjs)

## Per-request results

Scope abbreviations are `B` for `backend`, `BS` for `backend/src`, `D` for
`backend/src/domus`, `A` for `backend/src/domus/application`, and `F` for
`backend/src/domus/application/recurrence_review_target.py`. All targets
are literals, with null workspace and line bounds. The journal retains
their complete typed shape and order. The evidence bundle names link to
the common fragment ranges below. Each row has separately bound receipts.

| Trial | Revision | Original ordered targets | Before | After | Fragments and effective binding | Before / after files opened | After discovery + source bytes | Before / after wall ms |
|---|---|---|---|---|---|---:|---:|---:|
| `16db05534b8893c1` | T2 | `D` `def current_schedule_id(`<br>`D` `review_target(`<br>`D` `def schedule(` | `search-file-budget` | `provided`, sufficient | [Bundle T2](#returned-fragments) · SQLiteRecurrences | 0 / 37 | 20,605 + 266,234 | 56 / 2181 |
| `22e13c3a2a292402` | T1 | `D` `def current_schedule_id(`<br>`D` `review_target(` | `search-file-budget` | `provided`, sufficient | [Bundle T1](#returned-fragments) · SQLiteRecurrences | 0 / 37 | 20,605 + 266,270 | 41 / 2043 |
| `3018a426420840e2` | T2 | `D` `def current_schedule_id`<br>`D` `review_target(`<br>`F` `fixed` | `search-file-budget` | `provided`, sufficient | [Bundle T2](#returned-fragments) · SQLiteRecurrences | 0 / 37 | 20,605 + 266,234 | 48 / 2233 |
| `869ae827f73ecb5f` | T1 | `B` `def current_schedule_id`<br>`B` `def schedule(`<br>`B` `review_target(` | `search-file-budget` | `provided`, sufficient | [Bundle T1](#returned-fragments) · SQLiteRecurrences | 0 / 37 | 20,681 + 266,270 | 48 / 2097 |
| `94254b65f6e537b8` | T2 | `BS` `def current_schedule_id(`<br>`BS` `review_target(` | `search-file-budget` | `provided`, sufficient | [Bundle T2](#returned-fragments) · SQLiteRecurrences | 0 / 37 | 20,605 + 266,234 | 47 / 2100 |
| `b60903da637517c5` | T1 | `B` `def current_schedule_id(`<br>`B` `def schedule(`<br>`B` `review_target(` | `search-file-budget` | `provided`, sufficient | [Bundle T1](#returned-fragments) · SQLiteRecurrences | 0 / 37 | 20,681 + 266,270 | 49 / 2107 |
| `abf94e0841df8650` | T2 | `D` `def current_schedule_id`<br>`D` `review_target(` | `search-file-budget` | `provided`, sufficient | [Bundle T2](#returned-fragments) · SQLiteRecurrences | 0 / 37 | 20,605 + 266,234 | 53 / 2158 |
| `cac2a99f83c17e03` | T2 | `D` `def current_schedule_id`<br>`D` `review_target(` | `search-file-budget` | `provided`, sufficient | [Bundle T2](#returned-fragments) · SQLiteRecurrences | 0 / 37 | 20,605 + 266,234 | 49 / 2050 |
| `d9d6e2c49bef9b6f` | T1 | `D` `def current_schedule_id`<br>`D` `def retire`<br>`A` `review_target(` | `search-file-budget` | `provided`, sufficient | [Bundle T1](#returned-fragments) · SQLiteRecurrences | 0 / 37 | 20,605 + 266,270 | 42 / 2117 |
| `ea91227bd0b9f19b` | T2 | `D` `def current_schedule_id`<br>`D` `review_target(`<br>`D` `retired` | `search-file-budget` | `provided`, sufficient | [Bundle T2](#returned-fragments) · SQLiteRecurrences | 0 / 37 | 20,605 + 266,234 | 45 / 2035 |
| `f50951bad8ae7d0d` | T1 | `D` `review_target(`<br>`D` `def current_schedule_id` | `search-file-budget` | `provided`, sufficient | [Bundle T1](#returned-fragments) · SQLiteRecurrences | 0 / 37 | 20,605 + 266,270 | 46 / 2134 |
| `feaf501566b25918` | T1 | `D` `DefinitionState.RETIRED`<br>`D` `current_schedule_id(` | `search-file-budget` | `provided`, sufficient | [Bundle T1](#returned-fragments) · SQLiteRecurrences | 0 / 37 | 20,605 + 266,270 | 50 / 2151 |

The largest request opened 37 of 80 files and consumed
286,951
of 524,288 discovery and source bytes. It stayed within the original
four-second ceiling. The maximum recorded wall time was 2,233 ms.
The largest packet was 8,445 of 9,000 bytes, including
the receipts, link locators, caller flow and per-target statuses. The
largest request charged 9 of 16 matches. Tree and diff
inventories share the 4,096-entry ceiling. All counters, including the
Git call count and raw metadata byte counts, are in the corrected records.

The response gives supplementary targets their own disposition. Literal
matches outside the proven chain stay unresolved with
`outside-returned-chain` rather than making a completeness claim about
the original broad scope. 4 of
30 targets had this
disposition. The causal evaluator verifies the necessary link even when
a supplementary literal stays unresolved.

## Returned fragments

The paths below are relative to `backend/src/domus/`. Disjoint spans
from one Git blob share a receipt. Each returned witness includes its
receipt ID and range. The evaluator re-reads each blob from the pinned
head and verifies the exact spans, text, digest, operation, candidate,
head and tree. It also checks the pre-existing caller receipt and the
initial pinned diff hunk at line 82.

| Link | Blob path | Bundle T1 | Bundle T2 |
|---|---|---|---|
| Read transaction and pass the unit into review_target | `application/recurrence_review.py` | 27, 161–162, 173–176 | 27, 161–162, 173–176 |
| Pass the configured store into RecurrenceReview | `composition/tasks.py` | 10, 33–34, 44 | 10, 33–34, 44 |
| Construct the SQLite store and compose the runtime | `composition/ingress.py` | 21, 39, 85, 87, 90–91, 99 | 21, 39, 85, 87, 90–91, 99 |
| Yield the concrete unit and construct its recurrence adapter | `infrastructure/sqlite.py` | 40, 307–309, 460, 469, 478–479 | 40, 307–309, 460, 469, 478–479 |
| Current schedule query and fixed schedule lookup | `infrastructure/sqlite_recurrence.py` | 118, 125–137, 290–301 | 118, 125–136, 289–300 |

The existing receipt for `application/recurrence_review_target.py` covers
lines 55–82. The call at line 69 assigns the current schedule ID. Lines
76–77 return empty actions for an owned slot when the ID is absent.
Line 79 passes the ID to the fixed schedule lookup and line 80 gates the
actions branch. The fixed actions begin at line 82 in the pinned diff.
The evaluator also checks the final action return through line 103.

## Observed SQLite behavior

| Revision | Stored retired schedule | Returned as current | Fixed action branch |
|---|---|---|---|
| T1, date-only and timed | yes | no | no schedule and empty actions |
| T2, date-only and timed | yes | yes | schedule returned with seven actions |

The local oracle uses the original fixture, commits the retirement to
SQLite, reopens storage and evaluates the actual review target. T1
preserves the retired row and excludes it at discovery. Removing the
predicate in T2 allows the same retained schedule to reach action
selection. These observations are evaluator evidence and do not enter
the resolver.

## Reproduce

Use Node 24.20.0 and Python 3.14.6. Rebuild the two frozen checkouts using
the [tree-search instructions](../tree-search/reproduce.md) and set
`TREE_SUBJECTS` to their parent directory. No SDK login or provider
access is needed. Run from the Copilot checkout.

```sh
pilot=quality/bugbot/evidence/issue-950
node "$pilot/causal-replay/replay-before.cjs" "$TREE_SUBJECTS" > before.jsonl
node "$pilot/causal-replay/replay.cjs" "$TREE_SUBJECTS" > after.jsonl
node --test "$pilot/causal-replay/retrieve.test.cjs"
for subject in T1 T2; do
  checkout="$TREE_SUBJECTS/$subject"
  PYTHONDONTWRITEBYTECODE=1 PYTHONPATH="$checkout/backend/src:$checkout/tests/backend:$TREE_PY_DEPS" \
    python3 "$pilot/tree-search/local-probe.py" "$subject"
done
```

`TREE_PY_DEPS` is the v4 pinned Python dependency directory. Only wall
times are expected to vary. The original preregistration and measured
journal stay in [tree-search](../tree-search/preregistration.md).

The resolver supports static Python call and assembly shapes. It starts
from the frozen anchor, uses the comparison inventory to prioritize
related modules, and follows imports, explicit constructor wiring and
transaction returns. An unlinked declaration or competing wired
constructors produces an explicit unresolved or ambiguous result.
Dynamic registrations and other Python shapes need independent proof.
This deterministic result establishes source-chain sufficiency for #918.
Production activation remains disabled.
