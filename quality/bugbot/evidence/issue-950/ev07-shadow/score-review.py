"""Score the installed shadow projection against the frozen v4 repository cases."""
import argparse
from collections import Counter
from hashlib import sha256
import importlib.util
import json
import math
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parent
PLAN = json.loads((ROOT / "plan.json").read_text())["repositoryCohort"]
V4 = ROOT.parent / "v4"
assert sha256((V4 / "manifest.json").read_bytes()).hexdigest() == PLAN["manifestSha256"]
assert sha256((V4 / "candidates.json").read_bytes()).hexdigest() == PLAN["oracleSha256"]
SPEC = importlib.util.spec_from_file_location("score_v4", V4 / "score.py")
V4_SCORE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(V4_SCORE)
EXPECTED = V4_SCORE.CASE
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("review_root", type=Path)
parser.add_argument("--public-attempts", type=Path)
parser.add_argument("--checkouts", type=Path, help="Recheck final Git citations against the frozen trees")
ARGS = parser.parse_args()
REVIEW_ROOT = ARGS.review_root


def events(file):
    return [json.loads(line) for line in file.read_text().splitlines()] if file.exists() else []


SLOTS = events(REVIEW_ROOT / "slots.jsonl")
STARTED = {(row["id"], row["repetition"]) for row in SLOTS if row["event"] == "slot-start"}
EXITS = {(row["id"], row["repetition"]): row["exit"] for row in SLOTS if row["event"] == "slot-finish"}


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
    admitted = result.get("success") and payload.get("dryRun") and result.get("checkoutUnchanged") and not write_count
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
    matched = lambda items: next((finding for finding in items
                                  if V4_SCORE.prior.matches(finding, oracle, {"subject": id, "phase": "full-review"})), None)
    baseline_match, shadow_match = matched(findings), matched(active)
    return dict(subject=id, repetition=repetition, status=status, githubWriteAttempts=write_count,
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
    complete=all(row["status"] in ("complete", "incomplete") for row in rows),
    baseline=sum(reproductions.values()) >= PLAN["baselineMinimumAlerts"] and len(reproductions) >= PLAN["baselineMinimumPremises"],
    reduction=all(row["complete"] and row["shadow"] <= row["baseline"] for row in comparisons)
    and sum(row["shadow"] < row["baseline"] for row in comparisons) >= PLAN["minimumStrictlyBetterRepetitions"],
    positives=all(row.get("positiveExact") is True for row in rows if row["subject"].endswith("2")),
    latency=len(times) == len(rows) and p95 <= PLAN["maximumAddedP95Ms"],
    integrity=all(row.get("checkoutUnchanged") is True and row["githubWriteAttempts"] == 0
                  and not (row.get("gitCitationAudit") or {}).get("failure")
                  and row["status"] in ("complete", "incomplete") for row in rows),
)
print(json.dumps(dict(passed=all(checks.values()), checks=checks, historicalBaseline=dict(reproductions),
                      paired=comparisons, observedAddedP95Ms=p95, latencyObservations=len(times), rows=rows), indent=2))
