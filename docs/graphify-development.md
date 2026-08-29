# Graphify development workflow

## Purpose

Graphify is a local topology and navigation aid. It does not participate in the
Copilot runtime and does not replace tests, TypeScript, RepoWise, security
gates, or caller inspection.

Use it to investigate:

- production callers and affected paths;
- capability and composition hubs;
- cross-layer edges and cycles;
- whether current ports and adapters are connected as intended;
- impact before retiring a facade or changing a composition root.

## Installation

Install `graphifyy` in an isolated Python environment. Do not add it to
`package.json`, the pnpm lockfile, or production dependencies. The executable
may live anywhere on the developer machine; set `GRAPHIFY_BIN` when it is not
on `PATH`.

```bash
python3 -m venv /tmp/copilot-graphify-venv
/tmp/copilot-graphify-venv/bin/python -m pip install 'graphifyy==0.9.46'
/tmp/copilot-graphify-venv/bin/graphify hermes install
```

The executable is not required to be on `PATH`. Commands in this repository use:

```bash
GRAPHIFY_BIN=/tmp/copilot-graphify-venv/bin/graphify
```

## Current workflow

The authoritative reproducible refresh is the versioned collector:

```bash
METRICS_OUTPUT_DIR="$(mktemp -d "/tmp/copilot-architecture-metrics-$(git rev-parse HEAD)-XXXXXX")" \
  pnpm run metrics:architecture
```

It fixes RepoWise to single-repository scope, derives coverage inventory from
LCOV, records reports outside the repository, runs Graphify, and snapshots then
restores every mutable workspace path (`build/`, `coverage/`, `graphify-out/`,
local RepoWise/editor/agent configuration) byte-for-byte. A run publishes
`complete.json` only after report validation and post-restoration Git checks. For
an explicitly destructive, isolated Graphify investigation, use:

```bash
rm -rf graphify-out
$GRAPHIFY_BIN update .
```

This builds the local AST graph in `graphify-out/`. The directory is generated
and ignored by Git.

Query before reading generated JSON manually:

```bash
$GRAPHIFY_BIN query "application boundaries and composition roots" --budget 5000
$GRAPHIFY_BIN query "release tag adapters callers and provider clients" --budget 5000
$GRAPHIFY_BIN query "GitHub Action local action CLI runtime composition" --budget 5000
```

Narrow broad results by naming the concrete symbol or path. Graphify semantic
queries may include documentation and test nodes; a returned node is evidence
to inspect, not proof of a production dependency.

## Use with RepoWise

```text
Graphify -> topology, callers, paths, hubs, impact
RepoWise  -> complexity, duplication, churn, health, risk
Tests     -> behavior and contracts
Source    -> authoritative current implementation
Git       -> publication and historical evidence
```

A RepoWise hotspot is not a refactoring instruction. Use Graphify and source
search to identify the real callers and ownership first, define a semantic
boundary only when one exists, and add contract tests for intentional changes.

## Last recorded checkpoint

At the last published Phase D checkpoint
`af32863317977e42ec59b712fc1f371b5f231cad`, refreshed with the command above:

```text
3271 nodes
8424 edges
217 communities
```

These numbers are historical navigation evidence, not a live quality score.
Regenerate the reports locally and use `git rev-parse HEAD` for the current
revision before making architecture decisions.

The generated graph is currently marked `directed: false`. It cannot prove the
absence of directed dependency cycles. Use source imports and executable
architecture tests for dependency direction; use Graphify for connectivity,
paths, hubs, and impact.

Current high-degree nodes are headed by logging functions, `Execution`,
`Result`, `ParamUseCase`, `GithubClientPort`, and semantic ports. Logging is a
legitimate cross-cutting concern; models and base contracts are monitored for
responsibility concentration; provider client contracts remain technical and
outside application behavior. Retired universal facades are no longer current
god nodes.

Persistent tool warning:

```text
docs.json produces zero nodes
```

The warning is Graphify input behavior, not a production architecture defect.
The graph shows current composition roots and application architecture tests as
first-class nodes. Broad queries also surface historical documents, so current
source paths must always be verified before acting.

## Historical baseline

The original reconstruction spike contained 2327 nodes and 6764 edges and
highlighted `Execution`, `GithubClientPort`, `IssueRepository`,
`RepositoryFactory`, and the former AI facade. Those metrics remain useful only
as a historical comparison; several named facades no
longer exist in production and must not be treated as current hotspots.

## Privacy and generated artifacts

- Never index credentials, `.env` files, auth state, databases, logs, or user
  data.
- Review `.gitignore` and `.graphifyignore` before indexing a new source.
- Keep `graphify-out/` local unless an explicit reviewed CI policy says
  otherwise.
- Never commit generated graph files as architectural source of truth.
