"""Evaluator-only exact SQLite probe for the held-out original and mutant."""
from dataclasses import replace
from pathlib import Path
import json
import sqlite3
import sys
from tempfile import TemporaryDirectory

from domus.domain.recurrence_records import ScheduleState
from domus.infrastructure.sqlite import SQLiteDatabase
from test_recurrence_review import fixed_move


def observe(timed):
    with TemporaryDirectory(prefix="bugbot950-tree-probe-") as directory:
        review, choice, _, _ = fixed_move(Path(directory), timed=timed)
        store = review.transactions
        with store.write() as unit:
            rule = unit.recurrence.schedule("home", choice.schedule_id)
            unit.recurrence.save_schedule(replace(rule, revision=rule.revision + 1, state=ScheduleState.RETIRED), rule.revision)
        reopened = SQLiteDatabase(store.path, store.installation)
        with reopened.read() as unit:
            stored = unit.recurrence.schedule("home", choice.schedule_id)
            assert stored.state is ScheduleState.RETIRED
            current = unit.recurrence.current_schedule_id("home", stored.definition_id)
        target = replace(review, transactions=reopened).target(choice.occurrence_id)
        return {"timed": timed, "stillStored": True, "current": current == choice.schedule_id,
                "actions": list(target.actions), "scheduleReturned": target.schedule is not None}


if __name__ == "__main__":
    results = [observe(timed) for timed in (False, True)]
    if sys.argv[1] == "T1":
        assert all(not row["current"] and not row["scheduleReturned"] and row["actions"] == [] for row in results)
    elif sys.argv[1] == "T2":
        assert all(row["current"] and row["scheduleReturned"] and set(row["actions"]) >=
                   {"fixed-state", "fixed-pattern", "fixed-replacement", "fixed-exclude", "fixed-add"} for row in results)
    else:
        raise ValueError("unknown held-out subject")
    print(json.dumps({"subject": sys.argv[1], "sqlite": sqlite3.sqlite_version, "observations": results}))
