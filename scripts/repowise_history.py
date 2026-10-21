"""Bounded full-history adapter for the explicitly pinned RepoWise version.

Keep RepoWise's traversal, provenance, allowlists, deduplication and detectors.
Replace only its eager blob dictionary and work discarded by secrets-only mode.
Private interfaces are deliberate: upgrades require the compatibility fixtures.
"""

from __future__ import annotations

import atexit
from collections import deque
from concurrent.futures import ProcessPoolExecutor
from importlib.metadata import version
import multiprocessing
from pathlib import Path
import subprocess

REPOWISE_VERSION = "0.58.0"
HISTORY_WORKERS = 2


class BlobReader:
    """One request/response at a time; never retain previous blob contents."""

    def __init__(self, repo: Path):
        self.process = subprocess.Popen(
            ["git", "-C", str(repo), "cat-file", "--batch"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        )
        self.count = 0
        self.bytes_read = 0
        self.largest_blob = 0
        atexit.register(self.close)

    def get(self, sha: str, default: str = "") -> str:
        # Object names come from Git, never accept a batch protocol injection.
        if len(sha) not in (40, 64) or any(c not in "0123456789abcdef" for c in sha):
            raise ValueError("Invalid blob object name")
        self.process.stdin.write((sha + "\n").encode("ascii"))
        self.process.stdin.flush()
        header = self.process.stdout.readline(256).split()
        if len(header) != 3 or header[0].decode("ascii") != sha or header[1] != b"blob":
            raise RuntimeError("Missing or malformed Git blob response")
        size = int(header[2])
        if size < 0:
            raise RuntimeError("Negative Git blob size")
        content = self.process.stdout.read(size)
        if len(content) != size or self.process.stdout.read(1) != b"\n":
            raise RuntimeError("Truncated Git blob response")
        self.count += 1
        self.bytes_read += size
        self.largest_blob = max(self.largest_blob, size)
        if self.count % 1000 == 0:
            import sys
            print(f"History: {self.count} source blobs, {self.bytes_read} bytes read", file=sys.stderr, flush=True)
        return content.decode("utf-8", errors="replace")

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
        for stream in (self.process.stdin, self.process.stdout):
            if stream:
                stream.close()


class SecretPrefilter:
    # Necessary literals in every line-oriented SECRET_KINDS regex in 0.58.0.
    # False positives are allowed; authoritative matching stays in RepoWise.
    # PEM is a separate spanning pass and deliberately never gated here.
    literals = (
        "password", "apikey", "api_key", "secret", "token", "accesskey", "access_key",
        "akia", "asia", "gho_", "ghp_", "ghr_", "ghs_", "ghu_", "github_pat_",
        "xox", "aiza", "sk_", "rk_", "glpat-", "gldt-", "glrt-", "glptt-",
        "gloas-", "glimt-", "glcbt-", "gr1348941", "azdo", "://",
    )

    def search(self, text):
        # Python IGNORECASE also accepts dotless i, long s and dotted I.
        lowered = text.lower().replace("ı", "i").replace("ſ", "s").replace("\u0307", "")
        return any(literal in lowered for literal in self.literals)


def configure_secret_scan():
    from repowise.core.analysis.security import scanner
    from repowise.core.analysis.security.patterns import SECRET_KINDS

    scanner._PATTERNS = [p for p in scanner._PATTERNS if p[1] in SECRET_KINDS]
    scanner._SPANNING_PATTERNS = [p for p in scanner._SPANNING_PATTERNS if p[1] in SECRET_KINDS]
    scanner._ANY_PATTERN = SecretPrefilter()
    # History's secrets_only=True discards all call findings; don't compute them.
    scanner._call_findings = lambda *args: []


def initialize_worker(repo):
    import resource
    import sys
    from multiprocessing.util import Finalize

    # Two workers have a deliberately smaller cap than the coordinating CLI.
    if sys.platform == "linux":
        resource.setrlimit(resource.RLIMIT_AS, (1024 * 1024**2,) * 2)
    configure_secret_scan()
    global worker_reader
    worker_reader = BlobReader(Path(repo))
    Finalize(None, worker_reader.close, exitpriority=10)


def scan_blob(sha, path):
    from repowise.core.analysis.security.scanner import scan_source

    before = worker_reader.bytes_read
    content = worker_reader.get(sha)
    findings = scan_source(path, content)
    # Upstream only needs source again for findings' fingerprints/material.
    # Negative results carry no large source string across the process pipe.
    return findings, content if findings else "", worker_reader.bytes_read - before


class PrefetchedBlobs:
    """At most two tasks/results resident; consume in upstream history order."""

    def __init__(self, repo, shas, paths):
        self.pool = ProcessPoolExecutor(
            max_workers=HISTORY_WORKERS, mp_context=multiprocessing.get_context("spawn"),
            initializer=initialize_worker, initargs=(str(repo),),
        )
        self.remaining = iter(shas)
        self.paths = paths
        self.pending = deque()
        self.findings = []
        self.count = self.bytes_read = self.largest_blob = 0
        for _ in range(HISTORY_WORKERS):
            self.enqueue()

    def enqueue(self):
        sha = next(self.remaining, None)
        if sha:
            self.pending.append((sha, self.pool.submit(scan_blob, sha, self.paths[sha])))

    def get(self, sha, default=""):
        expected, future = self.pending.popleft()
        if expected != sha:
            raise RuntimeError("History traversal order changed; adapter compatibility failure")
        self.findings, content, size = future.result()
        self.count += 1
        self.bytes_read += size
        self.largest_blob = max(self.largest_blob, size)
        self.enqueue()
        if self.count % 1000 == 0:
            import sys
            print(f"History: {self.count} source blobs, {self.bytes_read} bytes scanned", file=sys.stderr, flush=True)
        return content

    def close(self):
        self.pool.shutdown(wait=True, cancel_futures=True)


class PrefetchedScanner:
    def __init__(self, reader, delegate):
        self.reader = reader
        self.delegate = delegate

    async def scan_file(self, path, content, symbols):
        return self.reader.findings

    async def persist(self, *args, **kwargs):
        return await self.delegate.persist(*args, **kwargs)


def bounded_scanner_class(original, readers):
    class BoundedHistoryScanner(original):
        def _unique_blobs(self, *args):
            self.blob_paths = super()._unique_blobs(*args)
            return self.blob_paths

        def _read_blobs_batch(self, repo_path, blob_shas):
            reader = PrefetchedBlobs(repo_path, blob_shas, self.blob_paths)
            readers.append(reader)
            self._scanner = PrefetchedScanner(reader, self._scanner)
            return reader

    return BoundedHistoryScanner


def strict_git(repo_path, args, *, timeout=30.0):
    # Upstream's best-effort helper returns an empty string on Git failures,
    # which could otherwise turn a failed history enumeration into a clean scan.
    return subprocess.run(
        ["git", "-C", str(repo_path), *args], check=True, timeout=timeout,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    ).stdout


def fail_on_persistence_error():
    import logging

    class PersistenceFailure(logging.Handler):
        def emit(self, record):
            if record.getMessage().startswith("security_finding_persist_failed"):
                raise RuntimeError("History finding persistence failed")

    logger = logging.getLogger("repowise.core.analysis.security_scan")
    # Override the CLI's ancestor ERROR level: upstream logs swallowed writes
    # at WARNING. This handler raises before a diagnostic can pollute JSON.
    logger.setLevel(logging.WARNING)
    handler = PersistenceFailure()
    logger.addHandler(handler)
    return handler


def main():
    import json
    import os

    if version("repowise") != REPOWISE_VERSION:
        raise RuntimeError("Unsupported RepoWise version; rerun compatibility fixtures before upgrading")
    from repowise.core.analysis import history_scan
    from repowise.cli.main import cli

    readers = []
    fail_on_persistence_error()
    history_scan._run_git = strict_git
    history_scan.HistorySecurityScanner = bounded_scanner_class(history_scan.HistorySecurityScanner, readers)
    try:
        cli(["security", "scan", "--history", "--path", ".", "--format", "json"])
    finally:
        for reader in readers:
            reader.close()
        metrics = os.environ.get("REPOWISE_HISTORY_METRICS")
        if metrics:
            Path(metrics).write_text(json.dumps({
                "blobs_read": sum(r.count for r in readers),
                "bytes_read": sum(r.bytes_read for r in readers),
                "largest_blob_bytes": max((r.largest_blob for r in readers), default=0),
                "reader_cache_blobs": 0,
                "max_blob_requests_in_flight": HISTORY_WORKERS,
                "workers": HISTORY_WORKERS,
                "worker_virtual_memory_mib": 1024,
            }) + "\n")


if __name__ == "__main__":
    main()
