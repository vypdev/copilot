# Model-free test workers on a shared host

The maintainer confirmed that the four Ubuntu runner registrations share one
server. On [7d6 native CI](https://github.com/vypdev/copilot/actions/runs/46065083098),
Static's model-free shadow suite overlapped SDK coverage and build/package.
Its original command had fourteen test files and no file-worker limit; all
653 cases passed in 333700.881124ms. Coverage separately failed on a real
`git init` exceeding its existing 4000ms bound and a grouped malformed-file
test exceeding Jest's existing 5000ms deadline. Complete originals are retained.
The logs do not establish the server's CPU, memory or disk pressure, or which
operation delayed the grouped test.

Unlike Jest's fixed two-worker setting, Node's default file concurrency scales
with the host's available processors. The shared server's resources are not
reserved for this one job. The package command now uses
`node --test --test-concurrency=2` with the identical fourteen-file inventory.
This bounds concurrent test files, not every descendant process on the host.
It does not change workflow job independence, placement, privileges, deadlines,
coverage floors, test bodies, filters, the 35 qualification IDs or any measured
implementation/runtime identity. Native timeout resolution remains unproven
until the changed source completes CI; no unchanged CI retry is evidence here.

## Controlled before/after observation

Run `node quality/bugbot/evidence/issue-974/controls/shared-host-worker-fanout/worker-control.cjs <repository-root> <new-output-directory>`.
The control maps each package test-file slot to an inert fixture held by
explicit release markers. Its assertions use started/finished identities,
not elapsed-time thresholds or benchmark latency. It executes no application,
Git operation, Docker scope, network request or model. The twenty-second fault
guard only terminates a broken fixture process; it is not a qualification limit.

On local Node 24.20.0 with twelve available processors, the original default
observed eleven simultaneous files and fails the proposed two-worker bound.
The fixed command observed two. Each completes all fourteen fixtures with
fourteen passes and zero failures, omissions or cancellations. Removing the
flag restores the rejected default. [Exact observations](./source-and-controls.json)
retain Node identity and the complete fourteen-file mapping. This is a local
runner-control experiment, not Linux host telemetry or SDK/qualification proof.

The initial control used filesystem event watchers and failed with EMFILE in
the local environment. That attempt remains retained and is not scored as a
fanout result. State polling replaces the unavailable watcher; all fourteen
release markers were written and no matching owned Node process survived.

## Acceptance

The unchanged full shadow suite must still pass all 653 cases with zero failures,
omissions and cancellations under the capped command. Both original failing
SDK suites and ordinary repository/delivery gates remain required. Only a fresh
exact-head native CI can establish the protected merge gate. The 174 scientific
result remains negative, 42 reviews unstarted, profiles none and pilot writes 0.
No new scientific or technical SDK query, installation or activation occurs.

On committed local source 223e2eb, the complete capped suite passes 653/653 with
zero failures, omissions and cancellations. Normal hooks pass 970 suites and
20010 tests plus 35 historical omissions; the four SDK bundles remain byte-identical.
Final delivery checks pass after regenerating the stale generated extension
output, preserving that initial artifact failure. These are source 223 local
results. Later documentation-only reports do not turn them into a native Linux
or new-source runtime admission; published-head CI remains a separate gate.

[Node 24.20.0 documents the file-worker option and its processor-derived default](https://nodejs.org/download/release/v24.20.0/docs/api/cli.html#--test-concurrency).
