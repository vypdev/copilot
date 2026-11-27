# C03 process-fixture cleanup

The SDK test captures actual spawned children instead of deriving group authority
from a leader file. Each child receives one retained cleanup promise; absent ready
files, graceful-marker failure and other observation/signal errors cannot skip
force termination. Only missing files/processes are tolerated. The first failure
survives subsequent cleanup errors. Outer cleanup settles each captured child and
restores the observer before deleting private files. Production runtime is unchanged.

The same nine tests give1PASS/8FAIL on the extracted original helper and9PASS on
the candidate. The complete focused pair gives36PASS/0FAIL/skip, including the
existing actual POSIX process and descendant/runtime-cleanup control. The fault
ports are modeled; they grant no namespace or scientific acceptance. The earlier
36PASS candidate and subsequent no-unsafe-finally lint failure remain retained.
The corrected integration preserves the first failure and propagates it after
cleanup; final focused, types, lint, docs and specification checks pass.

[Source/results/limits](./source-and-controls.json) and
[lossless archive hashes](./archive-map.json) preserve every listed attempt.
Normal hooks and fresh actual native source/runtime acceptance remain required.
Node506 controls and35logical IDs remain unchanged.174/42unstarted,models0,
pilotwrites0,profileNONE,productiondisabled. This local contribution does not
replace either recovery snapshot awaiting authorization.
