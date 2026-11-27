# Review driver component coverage and coverage-exit controls

The27 semantic review-driver controls use actual private Git commits/diffs,
source-byte admission, the invocation parser, attempt recorder and private files.
SDK composition, input projection, planner/client, provenance/admission and verifier
ports are explicitly modeled. They cover v1/v2, original repository/PR identity,
zero-candidate dispatch, verifier callbacks, invalid inputs, cancellation forwarding,
read-only mutation planes and checkout-integrity reporting. They do not establish
actual SDK/model tool read scope, containment admission or a qualified profile.

Run the exact-source AST measurement with a new private output directory:

```sh
EV974_COMPONENT_COVERAGE_OUTPUT=/absolute/fresh/private/output \
node quality/bugbot/evidence/issue-974/controls/review-driver-coverage/coverage.cjs
```

The command runs the27 controls and17 existing runtime controls. It captures test
hashes before loading, checks unchanged production and test bytes on exit, records
its coverage receipt and fails if any measured module misses95%statements/lines or
90%branches/functions. An existing nonzero exit is preserved. The global changed-driver
gate remains separate and unmet; actual174/42 and fresh native C32–C35 remain unstarted.

Twelve additional actual-process controls exercise the exit contract of this and
five existing published AST drivers. Only their suite import is suppressed, leaving
real zero-hit instrumented maps. They require a nonzero exit and retain an existing23;
they never forge coverage or claim the suppressed suites ran. Existing five drivers
previously returned0 for false module gates. Their exit handling is corrected with
no runtime driver, source/corpus/plan, model, investigation or production change.

Executed evidence: the complete ordinary shadow command passes447/447 with no skips, failures or cancellations. The44-control exact-source AST execution passes; review reaches98.42%statements,100%lines,95.23%branches and95%functions. Twelve actual child-process exit controls pass after the five reproduced false-success cases. See [source and controls](source-and-controls.json) and [archive map](archive-map.json) for exact hashes, boundaries and retained negatives.
