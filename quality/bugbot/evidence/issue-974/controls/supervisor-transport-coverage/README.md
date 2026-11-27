# Supervisor IPC component coverage

The existing C28 owner/correlation group now includes 49 exact-source protocol observations. Process and fork facts are modeled; streams and event delivery use Node primitives. These controls do not prove Linux PID1 ownership, namespace termination, Docker admission or actual SDK execution.

The first command has 48 passing observations and one failure: a valid JSON array containing a 64-character hexadecimal string is coerced by `RegExp.test`, so the supervisor acknowledges a malformed readiness correlation. The later terminal correlation check may still refuse it. No false completed native result or actual exploitation is demonstrated. The correction requires a string before the existing hexadecimal check. All fixed valid-message behavior and existing namespace-owner guards remain.

The corrected standalone command passes 49/49. The public C28 driver passes one selected group and measures 100% of statements, lines, branches and functions for source `c886a99a75e12068d1eb34dc01e2df4c420b43d2f2819c65a31bcaaddbe2d26a`. The original 240 logical group inventory is unchanged. This is a separate component measurement; the global changed-module coverage gate remains unmet. Exact raw command bytes, including the negative, are retained in lossless UTF8 JSON records and indexed in `correction.json`.

Run with a fresh private output directory:

```sh
EV974_COMPONENT_COVERAGE_OUTPUT=/private/tmp/fresh-supervisor-component-coverage node --test --test-name-pattern=ev974-C28 quality/bugbot/evidence/issue-974/controls/supervisor-transport-coverage/coverage.cjs
```

The observer verifies unchanged source bytes on every instrumented VM load and never runs during native qualification. Historical native4 evidence remains pinned to source82f0c14/plans13e31eb/imageD2. The changed supervisor requires fresh final committed source, plan, image and actual native4 acceptance. No historical result is reused for the new bytes. All174 cases and42 reviews remain unstarted; model calls and evaluated-pilot writes remain zero, and production stays disabled.
