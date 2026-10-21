"""Pinned-package compatibility and resource/failure regressions for manual CI."""

import asyncio
from contextlib import contextmanager
from importlib.metadata import version
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import repowise_history as history
import repowise_reports as reports
from repowise.core.analysis import history_scan
from repowise.core.analysis.security import scanner
from repowise.core.analysis.security.patterns import SECRET_KINDS


@contextmanager
def optimized():
    names = ("_PATTERNS", "_SPANNING_PATTERNS", "_ANY_PATTERN", "_call_findings")
    saved = {name: getattr(scanner, name) for name in names}
    try:
        history.configure_secret_scan()
        yield
    finally:
        for name, value in saved.items():
            setattr(scanner, name, value)


class SecretCompatibility(unittest.TestCase):
    def compare(self, kind, text):
        expected = [f for f in scanner.scan_source("src/code.ts", text) if f["kind"] in SECRET_KINDS]
        self.assertIn(kind, {f["kind"] for f in expected})
        with optimized():
            self.assertEqual(expected, scanner.scan_source("src/code.ts", text))

    def test_pin(self):
        self.assertEqual(history.REPOWISE_VERSION, version("repowise"))

    def test_password(self):
        self.compare("hardcoded_password", 'password = "Q9vLm2rX7pNs4kT8"')

    def test_secret(self):
        self.compare("hardcoded_secret", 'API_KEY = "V8mK2qZ9fT4nY7jP"')

    def test_unicode_case(self):
        self.compare("hardcoded_secret", 'APı_KEY = "V8mK2qZ9fT4nY7jP"')

    def test_aws(self):
        self.compare("aws_access_key", 'const x = "AK' + 'IA' + 'QWERTYUIOPASDFGH"')

    def test_github(self):
        self.compare("github_token", 'const x = "gh' + 'p_' + 'Q2wE3rT4yU5iO6pA7sD8fG9hJ0kL1zX2cV3b' + '"')

    def test_slack(self):
        self.compare("slack_token", 'const x = "xo' + 'xb-' + '123456789012-987654321012-A7bC9dE2fG4hI6jK"')

    def test_google(self):
        self.compare("google_api_key", 'const x = "AI' + 'za' + 'Q2wE3rT4yU5iO6pA7sD8fG9hJ0kL1zX2cV3"')

    def test_stripe(self):
        self.compare("stripe_key", 'const x = "sk_' + 'live_' + 'Q2wE3rT4yU5iO6pA7sD8fG9h"')

    def test_gitlab(self):
        self.compare("gitlab_token", 'const x = "gl' + 'pat-' + 'Q2wE3rT4yU5iO6pA7sD8fG9h"')

    def test_azure(self):
        self.compare("azure_devops_pat", 'const x = "' + ('Q2wE3rT4yU5iO6pA7sD8fG9hJ0kL1zX2cV3bN4m' * 3)[:76] + 'AZDOq7W2"')

    def test_git_url(self):
        self.compare("git_url_credentials", 'const x = "https://user:Q9vLm2rX7pNs4kT8@github.com/org/repo.git"')

    def test_multiline_pem(self):
        self.compare("private_key_pem", '-----BEGIN PRIVATE KEY-----\n' + 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASC' * 3 + '\n-----END PRIVATE KEY-----')

    def test_placeholders_and_suppression(self):
        text = 'api_key = "example"; eval("code");\n// repowise:ignore\npassword = "${ENV}"'
        expected = [f for f in scanner.scan_source("tests/a.ts", text) if f["kind"] in SECRET_KINDS]
        with optimized():
            self.assertEqual(expected, scanner.scan_source("tests/a.ts", text))


class BlobProtocol(unittest.TestCase):
    def reader(self, response):
        process = Mock(stdin=io.BytesIO(), stdout=io.BytesIO(response))
        process.poll.return_value = 0
        with patch.object(history.subprocess, "Popen", return_value=process), patch.object(history.atexit, "register"):
            return history.BlobReader(Path("."))

    def test_sequential_blobs_no_cache(self):
        sha = "a" * 40
        reader = self.reader(f"{sha} blob 3\none\n{sha} blob 3\ntwo\n".encode())
        self.assertEqual("one", reader.get(sha))
        self.assertEqual("two", reader.get(sha))
        self.assertEqual((2, 6, 3), (reader.count, reader.bytes_read, reader.largest_blob))
        self.assertNotIn("contents", reader.__dict__)

    def test_missing_blob_fails(self):
        reader = self.reader(b"a missing\n")
        with self.assertRaises(RuntimeError):
            reader.get("a" * 40)

    def test_truncated_blob_fails(self):
        reader = self.reader(("a" * 40 + " blob 100\nshort").encode())
        with self.assertRaises(RuntimeError):
            reader.get("a" * 40)

    def test_protocol_injection_rejected(self):
        with self.assertRaises(ValueError):
            self.reader(b"").get("HEAD\nHEAD")

    def test_git_error_is_not_empty_history(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(subprocess.CalledProcessError):
                history.strict_git(Path(directory), ["rev-list", "--all"])


class HistoryIntegration(unittest.TestCase):
    def test_deleted_and_other_ref_secrets_preserve_upstream_provenance(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def git(*args):
                return subprocess.check_output(["git", "-C", directory, *args], stderr=subprocess.DEVNULL, text=True).strip()
            git("init", "-b", "main")
            git("config", "user.name", "Fixture")
            git("config", "user.email", "fixture@example.invalid")
            (root / "deleted.ts").write_text('password = "Q9vLm2rX7pNs4kT8"')
            git("add", ".")
            git("-c", "core.hooksPath=/dev/null", "commit", "-qm", "introduce")
            introduction = git("rev-parse", "HEAD")
            git("rm", "deleted.ts")
            git("-c", "core.hooksPath=/dev/null", "commit", "-qm", "remove")
            git("checkout", "-b", "other")
            (root / "other.ts").write_text('secret = "J4fT8nP2qW6rY9kZ"')
            git("add", ".")
            git("-c", "core.hooksPath=/dev/null", "commit", "-qm", "other branch")
            git("checkout", "main")

            class Sink:
                def __init__(self): self.saved = []
                async def scan_file(self, path, content, symbols): return scanner.scan_source(path, content, symbols)
                async def persist(self, path, findings, **provenance):
                    self.saved.append((path, findings, provenance))
                    return len(findings)

            async def scan(bounded):
                instance = history_scan.HistorySecurityScanner(None, "fixture")
                sink = Sink()
                instance._scanner = sink
                reader = history.BlobReader(root) if bounded else None
                if bounded:
                    instance._read_blobs_batch = lambda *_: reader
                try:
                    with patch.object(history_scan, "_run_git", history.strict_git):
                        summary = await instance.scan_history(root)
                    return summary, sink.saved
                finally:
                    if reader: reader.close()

            expected = asyncio.run(scan(False))
            with optimized(): actual = asyncio.run(scan(True))
            self.assertEqual(expected, actual)
            self.assertEqual(3, actual[0].commits_scanned)
            self.assertEqual(2, actual[0].findings_inserted)
            deleted = next(f for f in actual[1] if f[0] == "deleted.ts")
            self.assertEqual(introduction, deleted[2]["commit_sha"])


class ReportFailures(unittest.TestCase):
    def setUp(self):
        # Failure fixtures must not publish fake warnings or a synthetic partial
        # Job Summary when this suite runs inside the real manual workflow.
        output = patch("sys.stdout", new_callable=io.StringIO)
        output.start()
        self.addCleanup(output.stop)
        environment = patch.dict(reports.os.environ, {"GITHUB_STEP_SUMMARY": ""})
        environment.start()
        self.addCleanup(environment.stop)

    def test_swallowed_persistence_failure_becomes_fatal(self):
        from repowise.core.analysis.security.store import SecurityScanner, logger
        from unittest.mock import AsyncMock
        previous = logger.level
        handler = history.fail_on_persistence_error()
        session = Mock(); session.execute = AsyncMock(side_effect=RuntimeError("broken database"))
        try:
            instance = SecurityScanner(session, "fixture")
            with self.assertRaisesRegex(RuntimeError, "persistence failed"):
                asyncio.run(instance.persist("a.ts", [{"kind": "hardcoded_secret", "severity": "high"}]))
        finally:
            logger.removeHandler(handler)
            logger.setLevel(previous)

    def test_budgets_fit_job_with_publication_margin(self):
        self.assertLessEqual(sum(v[0] for v in reports.BUDGETS.values()), 38 * 60)
        self.assertEqual((1200, 2048), reports.BUDGETS["security"])
        self.assertEqual((60, 2048), reports.BUDGETS["dead-code"])

    def test_success_measures_rss_and_publishes_valid_json(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); p = root / "dead-code.json"
            def start(command, **kwargs):
                kwargs["stdout"].write("[]")
                kwargs["stdout"].flush()
                kwargs["stderr"].write("Read from the index")
                kwargs["stderr"].flush()
                (root / "dead-code.resources.txt").write_text("1.2 2048\n")
                process = Mock(); process.wait.return_value = 0
                return process
            with patch.object(reports.subprocess, "Popen", side_effect=start):
                result = reports.run_stage("dead-code", ["fixture"], p, root, lambda p: reports.validate_json(p, "dead-code"))
            self.assertEqual("complete", result["status"])
            self.assertEqual(2048, result["peak_rss_kib"])
            self.assertTrue(p.exists())

    def test_dead_code_live_fallback_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); p = root / "dead-code.json"
            p.write_text('[]'); (root / "dead-code.stderr.log").write_text("Computing live")
            with self.assertRaisesRegex(ValueError, "reuse the index"):
                reports.validate_json(p, "dead-code")

    def test_stale_health_revision_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory) / "health.json"
            p.write_text('{"targets":[],"refactoring_plans":[],"source":"index","analyzed_commit":"old"}')
            with patch.object(reports.subprocess, "check_output", return_value="current"):
                with self.assertRaisesRegex(ValueError, "revision"):
                    reports.validate_json(p, "health-json")

    def test_command_failure_is_incomplete(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); process = Mock(); process.wait.return_value = 1
            with patch.object(reports.subprocess, "Popen", return_value=process):
                result = reports.run_stage("security", ["fixture"], root / "security.json", root)
            self.assertEqual("incomplete", result["status"])
            self.assertIn("exited 1", result["error"])

    def test_security_coverage_mismatch_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); p = root / "security.json"
            p.write_text(json.dumps(dict(commits_scanned=3, files_scanned=2, blobs_scanned=3, by_kind={}, by_severity={})))
            (root / "history-resources.json").write_text('{"blobs_read":1}')
            with patch.object(reports.subprocess, "check_output", return_value="3"):
                with self.assertRaises(ValueError): reports.validate_json(p, "security")

    def test_live_health_report_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory) / "health.json"
            p.write_text('{"targets":[],"refactoring_plans":[],"source":"live"}')
            with self.assertRaises(ValueError): reports.validate_json(p, "health-json")

    def test_dead_code_report_schema_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory) / "dead-code.json"; p.write_text('{}')
            with self.assertRaises(ValueError): reports.validate_json(p, "dead-code")

    def test_index_requires_completed_dead_code(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory) / "index.log"
            p.write_text(json.dumps({"event": "summary", "status": "ready"}) + "\n")
            with self.assertRaises(ValueError): reports.validate_index(p)

    def test_index_rejects_degraded(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory) / "index.log"
            p.write_text('{"phase":"dead_code","state":"done"}\n{"event":"summary","status":"partial"}\n')
            with self.assertRaises(ValueError): reports.validate_index(p)

    def test_malformed_json_deleted_and_failure_reported(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); p = root / "security.json"
            process = Mock(pid=1234); process.wait.return_value = 0
            with patch.object(reports.subprocess, "Popen", return_value=process):
                result = reports.run_stage("security", ["fixture"], p, root, lambda p: reports.validate_json(p, "security"))
            self.assertEqual("incomplete", result["status"])
            self.assertFalse(p.exists())

    def test_timeout_kills_process_group(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); process = Mock(pid=1234)
            process.wait.side_effect = [subprocess.TimeoutExpired("fixture", 1), 0]
            with patch.object(reports.subprocess, "Popen", return_value=process), patch.object(reports.os, "killpg") as kill:
                result = reports.run_stage("dead-code", ["fixture"], root / "dead-code.json", root)
            kill.assert_called_once_with(1234, reports.signal.SIGKILL)
            self.assertEqual("incomplete", result["status"])

    def test_empty_security_coverage_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory) / "security.json"
            p.write_text(json.dumps(dict(commits_scanned=0, files_scanned=0, blobs_scanned=0, by_kind={}, by_severity={})))
            with self.assertRaises(ValueError): reports.validate_json(p, "security")

    def test_partial_summary_retains_complete_phases(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            incomplete = reports.write_summary(root, "a" * 40, {
                "health-md": {"status": "complete", "wall_seconds": 1, "peak_rss_kib": 1024},
                "security": {"status": "incomplete", "wall_seconds": 1200},
            })
            self.assertTrue(incomplete)
            text = (root / "summary.md").read_text()
            self.assertIn("Analysis incomplete", text)
            self.assertIn("| health-md | complete |", text)
            self.assertIn("full reachable history", text)


if __name__ == "__main__":
    unittest.main()
