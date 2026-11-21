# Corpus driver component coverage

The actual `corpus.cjs` source remains SHA-256
`71b24a615260277b6371354e488133e6fdcbf8caa4d251e79286fe8c4e1bc7e9`.
The existing C31 now has56 additional semantic component controls:28 collector
controls and28 worker controls. Its two existing controls remain intact, so the
selected C31 command passes58 assertions/groups without failure, skip or
cancellation. The35 logical qualification case IDs and thresholds are unchanged.

The controls cover independent attempt/scope/score rejection, malformed or
truncated ledgers, foreign identities, unsafe artifacts, owned private copies,
preflight with zero agent queries, exact model/provider/effort/sandbox flags,
failed runtime admission cleanup, selected-slot isolation, invalid responses,
bounded failure classification and cancellation with later slots unstarted.
The existing collector control still exercises a real EISDIR failure and waits
for both modeled sibling stops. Positive synthetic collections establish that
these checks can admit coherent fixtures; they are not measured model results.

Exact-source Istanbul AST coverage reaches98.96% statements,99.13% lines,
93.84% branches and97.36% functions. This satisfies this module's95/90 gate only.
The global changed-driver gate remains unmet. See `receipt.json`,
`coverage-final.json.log.gz`, `component-ast.log.txt.log.gz` and `source-and-controls.json`.

Reproduce from a clean source using a fresh private output directory:

```bash
EV974_COMPONENT_COVERAGE_OUTPUT=/private/tmp/fresh-owned-corpus-coverage node --test --test-name-pattern=ev974-C31 quality/bugbot/evidence/issue-974/controls/corpus-transport-coverage/coverage.cjs
```

The instrumenter accepts exact source bytes, validates their hash again at exit
and never changes production drivers. It is not imported by qualification or
native execution. CLI, agent, provenance and containment ports are modeled;
filesystem operations are actual. No provider, native CLI, Docker or campaign
runs here. Full committed-source tests/final native review remain separate.

The actual pinned readonly CLI still fails before workload at namespace creation;
no fallback, sandbox/runner grant or configuration change is adopted. Actual
model input/readscope and final native tuple controls remain unverified. Actual
174/42 are unstarted, no profile is qualified, pilot writes0 and production is
disabled.


The complete deterministic `pnpm run test:bugbot-shadow-verification` command
passes298 controls with zero failure, skip or cancellation (325.546seconds).
It includes the56 new C31 component controls and the prior242 controls, using
actual owned local Unix sockets where required. See the full retained log and
hash in `corpus-transport-coverage/source-and-controls.json`. Catalog generation,
specification validation and Graphify pass. Normal hooks and fresh final-head
native checks are still required. No actual native SDK or model campaign
acceptance is inferred from this deterministic command.


Local normal Git-hook validation selects the same installed Node24.20.0 with
process-only `--no-sparkplug`, the temporary mitigation already recorded for
repeated macOS V8-GC crashes during the sibling #998 validation. All configured
build/test/lint hooks remain active. This snapshot precedes that hook result;
repository/CI configuration and qualification runtime are unchanged. Fresh
default-profile final-head native checks remain required.
