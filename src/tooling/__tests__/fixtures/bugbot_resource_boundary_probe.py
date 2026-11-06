"""Fixed authored resource-boundary probes; no consumer or corpus text is executed."""

from dataclasses import dataclass, field
import json
import sqlite3


class Denied(Exception):
    pass


class Unavailable(Exception):
    pass


@dataclass(frozen=True)
class Request:
    peer: str = "trusted-supervisor"
    prefix: str = "/ingress/fixture"
    cookie: str = "fictional-bound-cookie"
    subject: str = "fictional-candidate"


@dataclass(frozen=True)
class Response:
    status: int
    body: dict
    headers: dict = field(default_factory=dict)


class Store:
    def __init__(self):
        self.db = sqlite3.connect(":memory:")
        self.db.executescript("""
            CREATE TABLE household (name TEXT NOT NULL);
            INSERT INTO household VALUES ('fictional private household');
            CREATE TABLE grants (subject TEXT NOT NULL);
            CREATE TABLE commands (value TEXT NOT NULL);
        """)

    def household(self):
        return {"household_name": self.db.execute("SELECT name FROM household").fetchone()[0]}

    def issue_grant(self, subject):
        self.db.execute("INSERT INTO grants VALUES (?)", (subject,))
        return "fictional-authority-token"

    def save(self):
        self.db.execute("INSERT INTO commands VALUES ('fictional-command')")

    def counts(self):
        return {table: self.db.execute("SELECT COUNT(*) FROM " + table).fetchone()[0]
                for table in ("household", "grants", "commands")}

    def close(self):
        self.db.close()


class Directory:
    def __init__(self, state):
        self.state, self.calls = state, 0

    def prove(self, subject):
        self.calls += 1
        if self.state == "unavailable":
            raise Unavailable("fictional-directory-unavailable")
        if self.state in ("unknown", "revoked") or subject != "fictional-candidate":
            raise Denied("identity-rejected")
        actual = "fictional-other" if self.state == "mismatched" else subject
        if actual != subject:
            raise Denied("identity-mismatch")
        return {"verified_subject": actual}


@dataclass(frozen=True)
class Actor:
    request: Request
    directory: Directory

    def status(self):
        return self.directory.prove(self.request.subject)


def request_actor(request, directory):
    if (request.peer != "trusted-supervisor" or request.prefix != "/ingress/fixture"
            or request.cookie != "fictional-bound-cookie"
            or request.subject != "fictional-candidate"):
        raise Denied("source-binding-required")
    return Actor(request, directory)


def bundle():
    return {"version": 1, "deployment": "native", "application_base": "/ingress/fixture",
            "style_nonce": "public-style-nonce-not-a-credential"}


def document_response(request, directory, store):
    request_actor(request, directory)
    return Response(200, bundle())


def preview_response(request, directory, store):
    actor = request_actor(request, directory)
    identity = actor.status()
    return Response(200, {"verified_subject": identity["verified_subject"]})


def document_details(request, directory, store):
    request_actor(request, directory)
    return Response(200, {**bundle(), **store.household()})


def document_session(request, directory, store):
    actor = request_actor(request, directory)
    token = store.issue_grant(actor.request.subject)
    return Response(200, {**bundle(), "csrf": token})


def household_read(request, directory, store):
    request_actor(request, directory)
    return Response(200, store.household())


def household_save(request, directory, store):
    request_actor(request, directory)
    store.save()
    return Response(202, {"accepted": True})


def document_current_status(request, directory, store):
    actor = request_actor(request, directory)
    actor.status()
    return Response(200, bundle())


def document_shared_bundle(request, directory, store):
    return Response(200, bundle())


def protected_read(request, directory, store):
    actor = request_actor(request, directory)
    actor.status()
    return Response(200, store.household())


def protected_save(request, directory, store):
    actor = request_actor(request, directory)
    actor.status()
    store.save()
    return Response(202, {"accepted": True})


def dispatch(callback, request, directory, store):
    try:
        return callback(request, directory, store)
    except Denied:
        return Response(401, {"state": "verify-access"})
    except Unavailable:
        return Response(503, {"state": "identity-unavailable"})


# This private experiment plan never enters the supplied reviewer source.
CASES = (
    ("shell-directory-unavailable", document_response, "unavailable", Request(), None),
    ("shell-unknown-subject", document_response, "unknown", Request(), None),
    ("shell-revoked-subject", document_response, "revoked", Request(), None),
    ("shell-mismatched-subject", document_response, "mismatched", Request(), None),
    ("shell-missing-source-cookie", document_response, "accepted", Request(cookie=""), None),
    ("personal-preview", preview_response, "accepted", Request(), None),
    ("document-details", document_details, "unknown", Request(), "return Response(200, {**bundle(), **store.household()})"),
    ("document-session", document_session, "revoked", Request(), "token = store.issue_grant(actor.request.subject)"),
    ("household-read", household_read, "unknown", Request(), "return Response(200, store.household())"),
    ("household-save", household_save, "mismatched", Request(), "store.save()"),
    ("document-current-status", document_current_status, "unavailable", Request(), "actor.status()"),
    ("document-shared-bundle", document_shared_bundle, "accepted", Request(peer="untrusted-peer"), "return Response(200, bundle())"),
)


def observe(case):
    identifier, callback, state, request, _anchor = case
    store, directory = Store(), Directory(state)
    try:
        before = store.counts()
        response = dispatch(callback, request, directory, store)
        first_calls, after = directory.calls, store.counts()
        read = dispatch(protected_read, request, directory, store)
        save = dispatch(protected_save, request, directory, store)
        return {"id": identifier, "callback": callback.__name__, "directoryState": state,
                "request": request.__dict__, "status": response.status, "body": response.body,
                "headers": response.headers, "directoryCallsAtResponse": first_calls,
                "countsBefore": before, "countsAfterResponse": after,
                "protectedReadStatus": read.status, "protectedSaveStatus": save.status}
    finally:
        store.close()


if __name__ == "__main__":
    print(json.dumps({"schemaVersion": 1, "observations": [observe(c) for c in CASES]}, indent=2))
