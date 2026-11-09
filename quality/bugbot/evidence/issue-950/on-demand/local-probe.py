"""Evaluator-only ASGI probe. No Docker, real upstream, network or provider."""
import asyncio
from pathlib import Path
import runpy
import subprocess
import sys


async def probe(module, route, upstream):
    calls, messages = [], []
    bridge = object.__new__(module["ImageBridge"])
    bridge.metadata = {"fixture": "controlled"}
    def exchange(method, path, headers, body):
        calls.append((method, path))
        if upstream is None:
            raise subprocess.CalledProcessError(1, ["controlled transport"])
        return {"status": upstream, "headers": [], "body": ""}
    bridge.exchange = exchange
    async def receive():
        return {"type": "http.request", "body": b""}
    async def send(message):
        messages.append(message)
    await bridge({"type": "http", "method": "GET", "path": route, "raw_path": route.encode(),
                  "headers": [], "query_string": b""}, receive, send)
    return messages[0]["status"], calls


async def main(root):
    route = "/__fixture__/ready"
    for case in ("R1", "R2"):
        module = runpy.run_path(str(root / case / "tests/browser/image_bridge.py"))
        results = [await probe(module, route, code) for code in (None, 503, 200)]
        if case == "R1":
            assert results == [(code, [("GET", route)]) for code in (502, 503, 200)]
        else:
            assert results == [(200, [])] * 3
        print(case, results)


if __name__ == "__main__":
    asyncio.run(main(Path(sys.argv[1])))
