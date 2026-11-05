"""Fixed owned sqlite/path controls. Never evaluate corpus or consumer source."""
from contextlib import contextmanager
from dataclasses import dataclass, replace
from pathlib import Path
import json
import platform
import sqlite3
from tempfile import TemporaryDirectory


@dataclass(frozen=True)
class Request:
    request_id: str
    expires: int
    state: str


def request():
    return Request(request_id="request", expires=100, state="pending")


class SQLiteDatabase:
    def __init__(self, path):
        self.path = path
        self.connection = sqlite3.connect(path)
        self.connection.execute("CREATE TABLE requests(request_id TEXT PRIMARY KEY, expires INTEGER, state TEXT)")

    def insert(self, value):
        self.connection.execute("INSERT INTO requests VALUES (?, ?, ?)",
                                (value.request_id, value.expires, value.state))

    def pending(self, now, descending=False, limit=10):
        order = "DESC" if descending else "ASC"
        return tuple(row[0] for row in self.connection.execute(
            "SELECT request_id FROM requests WHERE state = 'pending' AND expires > ? ORDER BY request_id "
            + order + " LIMIT ?", (now, limit)))

    def unfiltered(self, now):
        return tuple(row[0] for row in self.connection.execute(
            "SELECT request_id FROM requests ORDER BY request_id ASC"))


def create_store(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    return SQLiteDatabase(path)


def snapshot(store, destination):
    source_root = store.path.parent
    if (source_root / ".owned").is_file() and destination.is_relative_to(source_root):
        raise ValueError("destination_inside_source")
    destination.mkdir()


def destination_rejected(store, destination):
    try:
        snapshot(store, destination)
    except ValueError as error:
        if str(error) != "destination_inside_source":
            raise
        return True
    return False


@contextmanager
def owned_store(tmp_path, directory=False):
    path = tmp_path / "database" / "state.sqlite" if directory else tmp_path / "database"
    store = create_store(path)
    try:
        (store.path.parent / ".owned").write_text("owned test", encoding="utf-8")
        yield store
    finally:
        store.connection.close()


def test_file_source_parent(tmp_path, observed):
    with owned_store(tmp_path) as store:
        destination = tmp_path / "snapshot"
        rejected = destination_rejected(store, destination)
        observed.update(databaseIsFile=store.path.is_file(), sourceRoot=store.path.parent.relative_to(tmp_path).as_posix(), rejected=rejected)
        assert rejected is True


def test_file_source_peer(tmp_path, observed):
    with owned_store(tmp_path) as store:
        destination = tmp_path / "snapshot"
        rejected = destination_rejected(store, destination)
        observed.update(databaseIsFile=store.path.is_file(), sourceRoot=store.path.parent.relative_to(tmp_path).as_posix(), rejected=rejected)
        assert rejected is False


def test_directory_source_peer(tmp_path, observed):
    with owned_store(tmp_path, directory=True) as store:
        destination = tmp_path / "snapshot"
        rejected = destination_rejected(store, destination)
        observed.update(databaseIsFile=store.path.is_file(), sourceRoot=store.path.parent.relative_to(tmp_path).as_posix(), rejected=rejected)
        assert rejected is False


def test_directory_source_child(tmp_path, observed):
    with owned_store(tmp_path, directory=True) as store:
        destination = tmp_path / "database" / "snapshot"
        rejected = destination_rejected(store, destination)
        observed.update(databaseIsFile=store.path.is_file(), sourceRoot=store.path.parent.relative_to(tmp_path).as_posix(), rejected=rejected)
        assert rejected is False


def test_default_id_order(tmp_path, observed):
    with owned_store(tmp_path) as store:
        a = request()
        b = replace(request(), request_id="b")
        store.insert(a)
        store.insert(b)
        result = store.pending(now=50)
        limited = store.pending(now=50, limit=1)
        observed.update(aId=a.request_id, bId=b.request_id, result=result, limited=limited)
        assert (result, limited) == ((b.request_id, a.request_id), (b.request_id,))


def test_default_id_alternate_order(tmp_path, observed):
    with owned_store(tmp_path) as store:
        a = request()
        b = replace(request(), request_id="b")
        store.insert(a)
        store.insert(b)
        result = store.pending(now=50)
        observed.update(aId=a.request_id, bId=b.request_id, result=result)
        assert result == (a.request_id, b.request_id)


def test_overridden_id_order(tmp_path, observed):
    with owned_store(tmp_path) as store:
        a = replace(request(), request_id="a")
        b = replace(request(), request_id="b")
        store.insert(a)
        store.insert(b)
        result = store.pending(now=50)
        observed.update(aId=a.request_id, bId=b.request_id, result=result)
        assert result == (a.request_id, b.request_id)


def test_overridden_id_alternate_order(tmp_path, observed):
    with owned_store(tmp_path) as store:
        a = replace(request(), request_id="a")
        b = replace(request(), request_id="b")
        store.insert(a)
        store.insert(b)
        result = store.pending(now=50)
        observed.update(aId=a.request_id, bId=b.request_id, result=result)
        assert result == (b.request_id, a.request_id)


def test_descending_order(tmp_path, observed):
    with owned_store(tmp_path) as store:
        a = request()
        b = replace(request(), request_id="b")
        store.insert(a)
        store.insert(b)
        result = store.pending(now=50, descending=True)
        observed.update(aId=a.request_id, bId=b.request_id, result=result)
        assert result == (a.request_id, b.request_id)


def test_descending_alternate_order(tmp_path, observed):
    with owned_store(tmp_path) as store:
        a = request()
        b = replace(request(), request_id="b")
        store.insert(a)
        store.insert(b)
        result = store.pending(now=50, descending=True)
        observed.update(aId=a.request_id, bId=b.request_id, result=result)
        assert result == (b.request_id, a.request_id)


def test_pending_exclusions(tmp_path, observed):
    with owned_store(tmp_path) as store:
        active = request()
        expired = replace(request(), request_id="expired", expires=50)
        terminal = replace(request(), request_id="terminal", state="done")
        for value in (active, expired, terminal):
            store.insert(value)
        result = store.pending(now=50)
        observed.update(result=result, atExpiryExcluded=expired.request_id not in result, terminalExcluded=terminal.request_id not in result)
        assert result == (active.request_id,)


def test_pending_alternate_query(tmp_path, observed):
    with owned_store(tmp_path) as store:
        active = request()
        expired = replace(request(), request_id="expired", expires=50)
        terminal = replace(request(), request_id="terminal", state="done")
        for value in (active, expired, terminal):
            store.insert(value)
        result = store.unfiltered(now=50)
        observed.update(result=result, atExpiryExcluded=expired.request_id not in result, terminalExcluded=terminal.request_id not in result)
        assert result == (active.request_id,)


SCENARIOS = (
    ("db-file-parent", test_file_source_parent),
    ("db-file-peer", test_file_source_peer),
    ("db-directory-peer", test_directory_source_peer),
    ("db-directory-child", test_directory_source_child),
    ("ids-default-asc", test_default_id_order),
    ("ids-default-inverted", test_default_id_alternate_order),
    ("ids-override-asc", test_overridden_id_order),
    ("ids-override-inverted", test_overridden_id_alternate_order),
    ("ids-default-desc", test_descending_order),
    ("ids-desc-inverted", test_descending_alternate_order),
    ("ids-filtered", test_pending_exclusions),
    ("ids-unfiltered", test_pending_alternate_query),
)


def main():
    observations = []
    for identifier, function in SCENARIOS:
        with TemporaryDirectory(prefix="copilot-834-owned-") as directory:
            observed = {"id": identifier}
            try:
                function(Path(directory), observed)
            except AssertionError:
                observed["assertionPassed"] = False
            else:
                observed["assertionPassed"] = True
            observations.append(observed)
    print(json.dumps({"python": platform.python_version(), "sqlite": sqlite3.sqlite_version,
                      "kind": "fixed-owned-sqlite-and-paths", "observations": observations}, indent=2))


if __name__ == "__main__":
    main()
