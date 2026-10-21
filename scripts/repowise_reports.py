"""Manual RepoWise orchestration. Stdlib only; no application/runtime dependency."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import resource
import signal
import subprocess
import sys
import time

from repowise_history import REPOWISE_VERSION

# Maximum wall seconds and virtual MiB per process. Sum fits the 40-minute job,
# leaving setup, tests, publication and cleanup time. No caller-controlled flags.
BUDGETS = {"index": (900, 4096), "health-md": (60, 2048),
           "health-json": (60, 2048), "dead-code": (60, 2048), "security": (1200, 2048)}


def validate_index(path):
    events = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    summaries = [e for e in events if e.get("event") == "summary"]
    dead = [e for e in events if e.get("phase") == "dead_code" and e.get("state") == "done"]
    health = [e for e in events if e.get("phase") == "health" and e.get("state") == "done"]
    if not summaries or summaries[-1].get("status") != "ready" or not dead or not health:
        raise ValueError("Index did not confirm ready status and completed dead-code analysis")
    if any(e.get("state") in ("failed", "error") for e in events):
        raise ValueError("Index contains an incomplete phase")
    state = json.loads(Path(".repowise/state.json").read_text())
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    if state.get("last_sync_commit") != head:
        raise ValueError("Index revision does not match HEAD")


def validate_json(path, kind):
    value = json.loads(path.read_text())
    if kind == "dead-code":
        if not isinstance(value, list) or not all(isinstance(f, dict) and "kind" in f for f in value):
            raise ValueError("Invalid dead-code report")
        if "Read from the index" not in (path.parent / "dead-code.stderr.log").read_text():
            raise ValueError("Dead-code did not reuse the index")
        return value
    if not isinstance(value, dict):
        raise ValueError("Expected a JSON object")
    required = {"health-json": ("targets", "refactoring_plans"),
                "security": ("commits_scanned", "files_scanned", "blobs_scanned", "by_kind", "by_severity")}[kind]
    if not all(k in value for k in required):
        raise ValueError("Incomplete report schema")
    if kind == "health-json" and value.get("source") != "index":
        raise ValueError("Health report did not reuse the index")
    if kind == "health-json":
        head = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
        if value.get("analyzed_commit") != head:
            raise ValueError("Stored health revision does not match HEAD")
    if kind == "security" and (value["commits_scanned"] <= 0 or value["files_scanned"] <= 0):
        raise ValueError("History scan did not cover any commits or source blobs")
    if kind == "security":
        expected = int(subprocess.check_output(["git", "rev-list", "--all", "--count"], text=True))
        measured = json.loads((path.parent / "history-resources.json").read_text())
        if value["commits_scanned"] != expected or measured["blobs_read"] != value["files_scanned"]:
            raise ValueError("History coverage does not match reachable commits and requested source blobs")
    return value


def run_stage(name, command, output, report_dir, validator=None):
    seconds, memory_mib = BUDGETS[name]
    started = time.monotonic()
    measurement = report_dir / (name + ".resources.txt")
    result = {"status": "incomplete", "timeout_seconds": seconds, "virtual_memory_mib": memory_mib}

    def limits():
        resource.setrlimit(resource.RLIMIT_AS, (memory_mib * 1024**2,) * 2)

    try:
        with output.open("w") as out, (report_dir / (name + ".stderr.log")).open("w") as err:
            process = subprocess.Popen(
                ["/usr/bin/time", "-f", "%e %M", "-o", str(measurement), *command],
                stdout=out, stderr=err, start_new_session=True, preexec_fn=limits,
            )
            try:
                code = process.wait(timeout=seconds)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
                raise RuntimeError(f"Timed out after {seconds}s")
        if code:
            raise RuntimeError(f"Command exited {code}; inspect {name}.stderr.log")
        if validator:
            validator(output)
        elif not output.stat().st_size:
            raise ValueError("Empty report")
        result["status"] = "complete"
    except Exception as error:
        result["error"] = str(error)
        # Keep diagnostic/index logs; never publish malformed JSON as a report.
        if output.suffix == ".json":
            output.unlink(missing_ok=True)
        print(f"::warning::RepoWise {name} incomplete: {error}", flush=True)
    finally:
        result["wall_seconds"] = round(time.monotonic() - started, 3)
        if measurement.exists():
            fields = (measurement.read_text().splitlines() or [""])[-1].split()
            if len(fields) == 2 and fields[1].isdigit():
                result["peak_rss_kib"] = int(fields[1])
    print(f"RepoWise {name}: {result['status']} ({result['wall_seconds']}s)", flush=True)
    return result


def write_summary(report_dir, sha, results):
    lines = ["## RepoWise code health", "", f"Analyzed revision: `{sha}`", "",
             "Security scope: full reachable history, RepoWise secret patterns; generated bundles included.",
             "Health and safe-only dead-code: stored results from this revision's completed index.", "",
             "| Phase | Status | Seconds | Peak RSS (MiB) |", "|---|---|---:|---:|"]
    for name, result in results.items():
        rss = result.get("peak_rss_kib")
        lines.append(f"| {name} | {result['status']} | {result.get('wall_seconds', '—')} | {round(rss / 1024, 1) if rss is not None else '—'} |")
    incomplete = any(r["status"] != "complete" for r in results.values())
    lines += ["", ("Analysis incomplete. Inspect phase logs in the artifact, fix the cause, then rerun."
                    if incomplete else "Analysis complete. Findings are advisory; download the reports to review them."),
              "Artifact: `repowise-code-health` (14 days), including scope, timings, logs and completed reports.", ""]
    text = "\n".join(lines)
    (report_dir / "summary.md").write_text(text)
    (report_dir / "timings.json").write_text(json.dumps(results, indent=2) + "\n")
    (report_dir / "advisory-status.txt").write_text("\n".join(f"{n}: {r['status']}" for n, r in results.items()) + "\n")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
            summary.write(text)
    return incomplete


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--report-dir", required=True, type=Path)
    args = parser.parse_args()
    report_dir = args.report_dir.resolve()
    report_dir.mkdir(parents=True, exist_ok=True)
    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    (report_dir / "revision.txt").write_text(sha + "\n")
    refs = subprocess.check_output(["git", "for-each-ref", "--format=%(objectname) %(refname)"], text=True).splitlines()
    (report_dir / "scope.json").write_text(json.dumps({
        "revision": sha, "refs": refs, "repowise_version": REPOWISE_VERSION,
        "security": "full reachable history (--all), RepoWise source extensions and secret patterns; upstream allowlists apply",
        "health": "all indexed origins, cached refactoring targets", "dead_code": "cached safe-only findings",
        "index_commit_limit": 500, "history_commit_limit": None, "logical_cpus": os.cpu_count(),
    }, indent=2) + "\n")
    os.environ.update(OPENBLAS_NUM_THREADS="1", OMP_NUM_THREADS="1", REPOWISE_SKIP_EDITOR_SETUP="1", REPOWISE_NO_SAVE_KEY="1",
                      REPOWISE_HISTORY_METRICS=str(report_dir / "history-resources.json"))
    binary = str(Path(sys.executable).with_name("repowise"))
    commands = {
        "index": ([binary, "init", "--no-prose", "--no-claude-md", "--no-codex", "--no-editor-setup",
                   "--no-onboarding", "--no-distill-hook", "--no-workspace", "--no-seed", "--no-save-key",
                   "--commit-limit", "500", "--progress", "json", "."], "index.log", validate_index),
        "health-md": ([binary, "health", "--no-workspace", "--refactoring-targets", "--scope", "all", "--format", "md", "."], "health.md", None),
        "health-json": ([binary, "health", "--no-workspace", "--refactoring-targets", "--scope", "all", "--format", "json", "."], "health.json", lambda p: validate_json(p, "health-json")),
        "dead-code": ([binary, "dead-code", "--safe-only", "--no-workspace", "--format", "json", "."], "dead-code.json", lambda p: validate_json(p, "dead-code")),
        "security": ([sys.executable, str(Path(__file__).with_name("repowise_history.py"))], "security.json", lambda p: validate_json(p, "security")),
    }
    results = {}
    for name, (command, filename, validator) in commands.items():
        # Exporting cached empty data after a failed index would be misleading.
        if name != "security" and name != "index" and results["index"]["status"] != "complete":
            results[name] = {"status": "incomplete", "error": "Index did not complete"}
            continue
        results[name] = run_stage(name, command, report_dir / filename, report_dir, validator)
    return int(write_summary(report_dir, sha, results))


if __name__ == "__main__":
    sys.exit(main())
