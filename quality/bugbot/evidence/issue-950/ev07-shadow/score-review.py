"""Score the installed shadow projection against the frozen v4 repository cases."""
import argparse
from collections import Counter
from hashlib import sha256
import json
import math
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parent
PLAN_FILE = Path(os.environ["COPILOT_EV07_PLAN"]) if "COPILOT_EV07_PLAN" in os.environ else ROOT / "plan.json"
PLAN_BYTES = PLAN_FILE.read_bytes()
SELECTED_PLAN = json.loads(PLAN_BYTES)
PLAN = SELECTED_PLAN["repositoryCohort"]
PLAN_SHA256 = sha256(PLAN_BYTES).hexdigest()
try:
    PREREGISTRATION = json.loads(subprocess.check_output(
        ["node", str(ROOT / "implementation.cjs"), "--plan-provenance"], text=True))
except subprocess.CalledProcessError:
    raise ValueError("selected plan provenance admission failed") from None
V4 = ROOT.parent / "v4"
assert sha256((V4 / "manifest.json").read_bytes()).hexdigest() == PLAN["manifestSha256"]
assert sha256((V4 / "candidates.json").read_bytes()).hexdigest() == PLAN["oracleSha256"]
SUBJECTS = {row["id"]: row for row in json.loads((V4 / "manifest.json").read_text())["subjects"]}
EXPECTED = json.loads((V4 / "candidates.json").read_text())
# Same full-review premise rules as the frozen v4 evaluator.
PATTERNS = {
    "U": r"surrogate|supplementary|unicode flag|utf.?16|astral",
    "F": r"fixture|expected_schema",
    "S": r"histor|restor|fixed exception|retained|source guard|excluded original",
    "X": r"foreign.key|parent key|unique index",
    "M": r"migration|rollback|link|href",
    "P": r"toBeEnabled|edit preferences|disabled|enabled",
    "J": r"transport|frame|integer|identity",
}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("review_root", type=Path)
parser.add_argument("--public-attempts", type=Path)
parser.add_argument("--checkouts", type=Path, help="Recheck final Git citations against the frozen trees")
ARGS = parser.parse_args()
REVIEW_ROOT = ARGS.review_root


def events(file):
    return [json.loads(line) for line in file.read_text().splitlines()] if file.exists() else []


SLOTS = events(REVIEW_ROOT / "slots.jsonl")
STARTS = [row for row in SLOTS if row["event"] == "start"]
if (len(STARTS) != 1 or STARTS[0].get("plan") != PLAN_SHA256
        or STARTS[0].get("preregistration") != PREREGISTRATION
        or STARTS[0].get("implementation") != SELECTED_PLAN["implementation"]):
    raise ValueError("full-review plan provenance mismatch")
STARTED = {(row["id"], row["repetition"]) for row in SLOTS if row["event"] == "slot-start"}
EXITS = {(row["id"], row["repetition"]): row["exit"] for row in SLOTS if row["event"] == "slot-finish"}
CONTAINED = bool(SELECTED_PLAN.get("containment"))
if CONTAINED:
    expected_slots = [(id, repetition) for repetition in range(1, PLAN["repetitions"] + 1) for id in PLAN["order"]]
    planned = [(row.get("id"), row.get("repetition")) for row in SLOTS if row["event"] == "slot-planned"]
    if (planned != expected_slots or len(expected_slots) != 42
            or len(STARTED) != sum(row["event"] == "slot-start" for row in SLOTS)
            or len(EXITS) != sum(row["event"] == "slot-finish" for row in SLOTS)
            or not STARTED.issubset(set(expected_slots)) or not set(EXITS).issubset(STARTED)):
        raise ValueError("full-review fixed42 inventory mismatch")
    for row in SLOTS:
        if row["event"].startswith(("scope-", "operation-")):
            if (row.get("slot", {}).get("id"), row.get("slot", {}).get("repetition")) not in STARTED:
                raise ValueError("full-review orphan operation inventory")
    finishes = [row for row in SLOTS if row["event"] == "finish"]
    SCHEDULER_COMPLETE = (len(finishes) == 1 and len(STARTED) == len(EXITS) == 42
                          and finishes[0] == dict(event="finish", admitted=42, unstarted=0, interrupted=False, failed=False)
                          and (REVIEW_ROOT / "slots.jsonl").read_bytes().endswith(b"\n"))
else:
    SCHEDULER_COMPLETE = True


def attempt_admission(id, repetition, records):
    if SELECTED_PLAN.get("schemaVersion") != 2:
        return dict(complete=True)
    script = ("const fs=require('node:fs');const input=JSON.parse(fs.readFileSync(0,'utf8'));"
              "const result=require(process.argv[1]).validateCompleteReviewAttempts(input);"
              "process.stdout.write(JSON.stringify(result));")
    request = dict(records=records, caseId=f"{id}:r{repetition}", selected=SELECTED_PLAN,
                   detectorDirectory=str(REVIEW_ROOT / f"{id}-{repetition}.jsonl.attempts"),
                   verifierDirectory=str(REVIEW_ROOT / f"{id}-{repetition}.jsonl.verifier-attempts"))
    run = subprocess.run(["node", "-e", script, str(ROOT / "../../issue974/attempt-ledger.cjs")],
                         input=json.dumps(request), text=True, capture_output=True)
    return json.loads(run.stdout) if run.returncode == 0 else dict(complete=False, failure="actual-call-evidence")


def containment_admission(id, repetition, records):
    if not CONTAINED:
        return dict(complete=True)
    try:
        slot = (id, repetition)
        exit = EXITS.get(slot) or {}
        assert exit.get("code") == 0 and not exit.get("signal") and not exit.get("error")
        assert exit.get("namespaceInitStopped") is True
        sidecar = REVIEW_ROOT / f"{id}-{repetition}.jsonl.scopes.jsonl"
        assert sidecar.read_bytes().endswith(b"\n")
        scope = events(sidecar)
        assert [row["event"] for row in scope] == ["scope-create-start", "scope-created", "operation-start", "scope-start",
                                                   "scope-stopped", "operation-stopped", "scope-remove-start", "scope-removed"]
        scheduled_scope = [row for row in SLOTS if row["event"].startswith(("scope-", "operation-"))
                           and row.get("slot") == dict(id=id, repetition=repetition)]
        without_slot = lambda row: {key: value for key, value in row.items() if key != "slot"}
        assert list(map(without_slot, scheduled_scope)) == list(map(without_slot, scope))
        assert not any(row["event"] == "operation-incomplete" for row in scope)
        starts = [row for row in scope if row["event"] == "operation-start"]
        ends = [row for row in scope if row["event"] == "operation-stopped"]
        stopped = [row for row in scope if row["event"] == "scope-stopped"]
        created = [row for row in scope if row["event"] == "scope-created"]
        assert len(starts) == len(ends) == len(stopped) == len(created) == 1
        start, end = starts[0], ends[0]
        identity = start["identity"]
        assert set(identity) == {"ownerId", "operationId", "planSha256", "implementation", "imageSha256", "purpose"}
        assert re.fullmatch(r"[a-f0-9]{64}", identity["ownerId"])
        assert re.fullmatch(r"[a-f0-9]{64}", start["scopeId"])
        assert identity == dict(ownerId=identity["ownerId"], operationId=f"review:{id}:r{repetition}",
                                planSha256=PLAN_SHA256, implementation=SELECTED_PLAN["implementation"],
                                imageSha256=SELECTED_PLAN["containment"]["image"][7:], purpose="paired-review")
        assert all(row.get("identity") == identity and row.get("scopeId") == start["scopeId"]
                   for row in [*created, *stopped, end])
        assert stopped[0].get("namespaceInitStopped") is True and end.get("namespaceInitStopped") is True
        assert end.get("exitCode") == 0 and end.get("interrupted") is False
        host = STARTS[0]["provenance"]
        assert host["executionContext"] == "host" and host["implementation"] == SELECTED_PLAN["implementation"]
        for field in ("tree", "sourceSha256", "dependencyLockSha256", "compilerConfigurationSha256"):
            assert re.fullmatch(r"[a-f0-9]{40}" if field == "tree" else r"[a-f0-9]{64}", host[field])
        if SELECTED_PLAN.get("sourceTree") is not None:
            assert host["tree"] == SELECTED_PLAN["sourceTree"]
        assert host["bootstrap"] == dict(bootstrapSha256=SELECTED_PLAN["inspectedArtifacts"]["../qualification-bootstrap.cjs"],
                                         planCommit=PREREGISTRATION["commit"], planPath=PREREGISTRATION["path"], planSha256=PLAN_SHA256)
        assert host["drivers"] == SELECTED_PLAN["inspectedArtifacts"]
        assert host["containment"] == SELECTED_PLAN["containment"] and host["workerRuntime"] == SELECTED_PLAN["runtime"]
        runtime_fields = {"dependencyTreeSha256", "dependencyEntries", "os", "arch", "kernel", "node", "nodeSha256",
                          "gitExecutable", "gitSha256", "typescript", "typescriptSha256", "git"}
        assert set(host["runtime"]) == runtime_fields
        assert all(value == SELECTED_PLAN["hostRuntime"][key] for key, value in host["runtime"].items())
        worker = dict(host, executionContext="worker", runtime={key: SELECTED_PLAN["runtime"][key] for key in host["runtime"]})
        assert records[0]["provenance"] == worker
        assert all(row.get("identity") == identity and row.get("scopeId") in (None, start["scopeId"])
                   for row in scope if row["event"].startswith("scope-"))
        return dict(complete=True, scopeId=start["scopeId"], ownerId=identity["ownerId"])
    except (AssertionError, KeyError, OSError, ValueError, TypeError):
        return dict(complete=False, failure="namespace-or-runtime-evidence")


def project(record, fields):
    return {field: record[field] for field in fields if field in record}


def evidence_outcomes(investigation):
    return dict(Counter(row["operation"] + "/" + row["outcome"] for row in investigation.get("evidence", [])))


def public_attempt(id, repetition, records):
    attempt = dict(subject=id, repetition=repetition)
    attempt["events"] = [row for row in records if row["event"] in (
        "start", "detector", "detector-admitted", "verifier", "forbidden-write")]
    result = next((row for row in records if row["event"] == "result"), None)
    if result:
        payload = result.get("payload") or {}
        report = payload.get("bugbotShadowVerification") or {}
        attempt["result"] = project(result, ("wallMs", "success", "githubWriteAttempts", "checkoutUnchanged"))
        attempt["result"]["dryRun"] = payload.get("dryRun")
        attempt["ordinaryFindings"] = [project(row, ("id", "file", "line", "endLine", "severity", "category"))
                                       for row in (payload.get("findings") or [])]
        attempt["shadow"] = project(report, ("review", "provider", "resolvedModel", "detectorEffort",
                                             "detectorModelProvider", "verifier", "timing", "publicationSimulation"))
        attempt["shadow"]["candidates"] = [
            dict(project(row, ("id", "status", "verdict", "wallMs", "reportedModel", "ordinaryPublication")),
                 anchor=(row.get("candidate") or {}).get("anchor"),
                 failure=row.get("reason") if row.get("status") == "technical-failure" else None,
                 investigation=project(row.get("investigation") or {},
                                       ("turnDurationsMs", "contextRestarts", "closureRepairs")),
                 evidenceOutcomes=evidence_outcomes(row.get("investigation") or {}),
                 citations=[project(citation, ("kind", "path", "sha", "blob", "first", "last", "receipt",
                                                "textSha256", "url", "version"))
                            for citation in row.get("citations") or []])
            for row in report.get("candidates") or []
        ]
    return attempt


def audit_git_citations(id, subject, observations):
    if ARGS.checkouts is None:
        return None
    checked = 0
    for observation in observations:
        for citation in observation.get("citations") or []:
            if citation["kind"] != "git":
                continue
            if citation["sha"] not in (subject["head"], subject["base"]):
                return dict(checked=checked, failure="citation-revision")
            spec = citation["sha"] + ":" + citation["path"]
            checkout = ARGS.checkouts / id
            command = ["git", "-C", str(checkout)]
            try:
                blob = subprocess.check_output([*command, "rev-parse", "--verify", spec], stderr=subprocess.DEVNULL)
                source = subprocess.check_output([*command, "cat-file", "blob", spec], stderr=subprocess.DEVNULL)
                lines = re.split(r"\r?\n", source.decode("utf8").removesuffix("\n"))
            except (subprocess.CalledProcessError, UnicodeError):
                return dict(checked=checked, failure="citation-source")
            first, last = citation["first"], citation["last"]
            if not 1 <= first <= last <= len(lines) or blob.decode().strip() != citation["blob"]:
                return dict(checked=checked, failure="citation-blob-or-range")
            excerpt = "\n".join(lines[first - 1:last]).encode()
            if sha256(excerpt).hexdigest() != citation["textSha256"]:
                return dict(checked=checked, failure="citation-text")
            checked += 1
    return dict(checked=checked, failure=None)


def score(id, repetition):
    records = events(REVIEW_ROOT / f"{id}-{repetition}.jsonl")
    if records:
        starts = [row for row in records if row["event"] == "start"]
        if (len(starts) != 1 or starts[0].get("plan") != PLAN_SHA256
                or starts[0].get("preregistration") != PREREGISTRATION
                or starts[0].get("implementation") != SELECTED_PLAN["implementation"]
                or starts[0].get("subject") != SUBJECTS[id] or starts[0].get("repetition") != repetition):
            raise ValueError("slot plan provenance mismatch")
    result = next((row for row in records if row["event"] == "result"), None)
    write_count = sum(row["event"] == "forbidden-write" for row in records)
    if not result:
        slot = (id, repetition)
        exit = EXITS.get(slot)
        status = "missing-terminal" if records or slot in STARTED else "not-started"
        if not records and exit and exit.get("signal"):
            status = "canceled-before-runner"
        return dict(subject=id, repetition=repetition, status=status, schedulerExit=exit,
                    githubWriteAttempts=write_count)
    payload = result.get("payload") or {}
    report = payload.get("bugbotShadowVerification") or {}
    simulation = report.get("publicationSimulation") or {}
    findings = payload.get("findings") or []
    observations = report.get("candidates") or []
    subject = records[0]["subject"]
    citation_audit = audit_git_citations(id, subject, observations)
    attempts = attempt_admission(id, repetition, records)
    containment = containment_admission(id, repetition, records)
    admitted = (result.get("success") and payload.get("dryRun") and result.get("checkoutUnchanged") and not write_count
                and attempts["complete"] and containment["complete"])
    status = simulation.get("status", "invalid") if admitted else "invalid"
    head = subject["head"]
    confirmed = {row["id"] for row in observations if row.get("status") == "verdict"
                 and row.get("verdict") == "confirmed"
                 and any(c.get("kind") == "git" and c.get("sha") == head for c in row.get("citations", []))}
    active = [finding for finding in findings if finding["id"] in confirmed] if status != "invalid" else []
    if status in ("complete", "incomplete"):
        observed = set(simulation["individual"])
        assert observed == {f["id"] for f in active[:20]}
        assert simulation["overflow"] == max(0, len(active) - 20)
    oracle = EXPECTED[id][0]
    positive = id.endswith("2")
    def matched(items):
        return next((finding for finding in items
                     if finding.get("file") == oracle["path"]
                     and abs((finding.get("line") or -100) - oracle["line"]) <= 8
                     and re.search(PATTERNS[id[0]], finding["title"] + " " + finding["description"], re.I)), None)
    baseline_match, shadow_match = matched(findings), matched(active)
    return dict(subject=id, repetition=repetition, status=status, githubWriteAttempts=write_count,
                actualCalls=attempts, containment=containment,
                checkoutUnchanged=result["checkoutUnchanged"], baseline=len(findings), shadow=len(active),
                gitCitationAudit=citation_audit,
                historicalBaseline=bool(admitted and not positive and baseline_match),
                baselineUnsupported=len(findings) - int(positive and bool(baseline_match)),
                shadowUnsupported=len(active) - int(positive and bool(shadow_match)),
                positiveDetected=bool(positive and baseline_match),
                positiveExact=bool(positive and shadow_match and shadow_match["line"] == oracle["line"]),
                anchor=shadow_match["line"] if positive and shadow_match else None,
                expectedAnchor=oracle["line"] if positive else None,
                verdicts=dict(Counter(row.get("verdict") or row.get("status") for row in observations)),
                addedMs=(report.get("timing") or {}).get("verificationWallMs"))


rows = [score(id, repetition) for repetition in range(1, PLAN["repetitions"] + 1) for id in PLAN["order"]]
if CONTAINED:
    observed = [row.get("containment", {}) for row in rows if row.get("containment", {}).get("complete")]
    if (len({row["scopeId"] for row in observed}) != len(observed)
            or len({row["ownerId"] for row in observed}) != len(observed)):
        raise ValueError("full-review reused namespace or owner identity")
if ARGS.public_attempts:
    with ARGS.public_attempts.open("x", encoding="utf8") as output:
        for row in rows:
            id, repetition = row["subject"], row["repetition"]
            attempt = public_attempt(id, repetition, events(REVIEW_ROOT / f"{id}-{repetition}.jsonl"))
            print(json.dumps(dict(attempt, score=row), separators=(",", ":")), file=output)
reproductions = Counter(row["subject"] for row in rows if row.get("historicalBaseline"))
comparisons = []
for repetition in range(1, PLAN["repetitions"] + 1):
    cohort = [row for row in rows if row["repetition"] == repetition]
    complete = all(row["status"] == "complete" for row in cohort)
    comparisons.append(dict(repetition=repetition, complete=complete,
                            baseline=sum(row.get("baselineUnsupported", 0) for row in cohort),
                            shadow=sum(row.get("shadowUnsupported", 0) for row in cohort)))
times = sorted(row["addedMs"] for row in rows if row.get("addedMs") is not None)
p95 = times[math.ceil(0.95 * len(times)) - 1] if times else None
checks = dict(
    complete=SCHEDULER_COMPLETE and all(row["status"] in ("complete", "incomplete") for row in rows),
    baseline=sum(reproductions.values()) >= PLAN["baselineMinimumAlerts"] and len(reproductions) >= PLAN["baselineMinimumPremises"],
    reduction=all(row["complete"] and row["shadow"] <= row["baseline"] for row in comparisons)
    and sum(row["shadow"] < row["baseline"] for row in comparisons) >= PLAN["minimumStrictlyBetterRepetitions"],
    positives=all(row.get("positiveExact") is True for row in rows if row["subject"].endswith("2")),
    latency=len(times) == len(rows) and p95 <= PLAN["maximumAddedP95Ms"],
    integrity=all(row.get("checkoutUnchanged") is True and row["githubWriteAttempts"] == 0
                  and row.get("gitCitationAudit") is not None and not row["gitCitationAudit"].get("failure")
                  and row["status"] in ("complete", "incomplete") for row in rows),
)
print(json.dumps(dict(passed=all(checks.values()), checks=checks, historicalBaseline=dict(reproductions),
                      paired=comparisons, observedAddedP95Ms=p95, latencyObservations=len(times), rows=rows), indent=2))
