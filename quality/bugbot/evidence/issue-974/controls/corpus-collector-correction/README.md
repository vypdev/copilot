# Corpus collector failure (#974, C31)

The selected public corpus runner was loaded unchanged into the existing modeled
component boundary. A real EISDIR occurs when it reads the first stopped worker's
ledger. Two sibling operations remain pending. Before the correction, zero of
them receives abort and the collector returns the error immediately. The exact
same test then passes after the host uses allSettled, latches cancellation and
retains the collector failure before awaiting every sibling.

The corrected ledger retains all174 synthetic slots: one missing terminal, two
interrupted and171 not started, followed by a failed/incomplete finish. No later
slot is dispatched. The existing full-review C31 arm and this corpus arm both
pass (2/2), with no skipped or cancelled controls. An earlier VM JSON-realm
preflight harness failure is retained separately and is not causal evidence.

These are modeled containment component observations with an actual filesystem
error, not Docker/native SDK controls, actual174 measurements or qualification.
The same C31 acceptance requirement covers both collectors; the35-case floor,
actual174 IDs/labels/order and42 cohort remain unchanged. Global changed-driver
coverage, committed-source controls, actual CLI confinement/read scope, fresh
exact-source/runtime native controls and scientific admission remain required.
No research deadline, token/turn/read cap, retry or weakened gate was introduced.

The UTF-8 JSON containers preserve every raw log byte; decode rawUtf8 to recover
the originals. receipt.json identifies source/test/raw hashes and remaining gates.
