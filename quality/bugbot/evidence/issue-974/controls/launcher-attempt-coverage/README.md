# Launcher and attempt-ledger components

This adds32 launcher and13 attempt-ledger semantic component controls, required
from qualification.test.cjs and listed in the existing catalog. The35 logical
qualification IDs, selected SDD, runtime drivers, corpora, measurement plan,
thresholds and four generated bundles remain unchanged. New helper names do not
claim C26 native admission.

The55 selected controls pass with zero failures/skips/cancellation. Exact-source
Istanbul coverage measures the unchanged launcher at99.15% statements,98.94%
lines,95.91% branches,100% functions, and attempt-ledger at100% all metrics.
Both meet95/90; this does not satisfy the global changed-driver gate. See
receipt.json, component-ast.log.gz and coverage-final.json.log.gz.

The launcher controls cover exact tuple/slot/dispatch/provenance/runtime/score
rejection with zero child launches, upstream admission rejection, signal
propagation, terminal status and listener cleanup. They load actual source with
modeled scorer, provenance, attempt, containment and process ports; private
fixture files are real. Historical and optional metadata variants exercise
compatibility below injected admission. They do not show current qualification
can admit a historical or uncontained runtime.

The attempt controls use the real durable recorder, delivered artifacts and
chain validation, with modeled detector/verifier transports. They cover missing
schemas/accounting/artifacts, observation-write failure, runtime-proof identity,
bounded process/termination facts and interrupted verifier success/failure.
An initial private VM fixture failed21pass/11fail because cross-realm prototypes
differed in strict comparisons; its negative log remains lossless here. Loading
with vm.compileFunction retains the production realm while replacing explicit
ports. No runtime fix or weaker comparison was introduced for that fixture.

Reproduce using a new private output directory:

```bash
EV974_COMPONENT_COVERAGE_OUTPUT=/private/tmp/fresh-owned-launch-attempt-coverage node --test --test-name-pattern='launcher component:|attempt ledger component|ev974-C(15|16|17|18|19|20|21|22|23|30)' quality/bugbot/evidence/issue-974/controls/launcher-attempt-coverage/coverage.cjs
```

The instrumenter retains exact source hashes and validates them at exit; it is
not imported by qualification/native execution. Archive-map records exact raw
and gzip bytes/hashes. The full deterministic command passes343 controls with zero failures, skips
or cancellation (297.074seconds) on these exact runtime/helper bytes; see
source-and-controls.json and complete-shadow.log.gz. Catalog generation,
specification validation and Graphify pass. Normal hooks/publication and fresh
final-head native checks remain required at this snapshot.

No provider, actual pinned CLI, Docker admission or model campaign occurs here.
The actual readonly CLI remains unavailable before workload; oracle-free input
and readscope and remaining global AST/final native tuple evidence remain open.
Actual174/42 are unstarted, no profile is qualified, qualification calls and pilot
write attempts are0, production remains disabled. No runner/privilege/sandbox
change, installation, default/template or release is included.
