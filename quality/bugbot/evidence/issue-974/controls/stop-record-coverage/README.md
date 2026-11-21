# Stop despite a failed stop-journal record

A real private recorder EISDIR fault reproduced the reviewed defect: after inspecting
its owned scope, stop attempted to write its intent and rejected before ending the
lifetime channel. A running modeled scope therefore remained running. Ten of twelve
semantic controls fail before the correction; all twelve pass afterward.

Stop now retains the first journal error while still ending the lifetime channel,
settling startup/wait and any issued escalation, and inspecting the exact owned
stopped state. It then rejects the journal error. A later close/confirmation error
cannot hide the first failure; no completed operation, new durable proof or unproved
cleanup is fabricated. Ownership/grant/mount fences and the existing post-stop
escalation interval remain unchanged. No research limit or retry policy is added.

The controls cover cancelled/failed stops, persistent/recovered recording, ordinary
EOF/forced termination, pre-start state and later confirmation-record failure.
They use actual private files and Unix HTTP with explicitly modeled Engine,
provenance/admission and timer ports. They are not native Docker/namespace/SDK/model
or credential/read-scope evidence.

The full ordinary deterministic shadow command passes459/459 with no failures,
skips or cancellations. Thirteen selected exact-source AST controls pass at
98.85%statements,100%lines,93.25%branches and93.61%functions; the engine module gate
passes, while the global changed-driver gate remains unmet. The wrapper captures
thirteen test hashes before loading and checks unchanged bytes on exit. The earlier
241-control AST measurement without those pre-load hashes remains separate evidence;
the corrected focused execution supplies the current identity proof.

The source receipt and archive map preserve both original red reproductions,
private candidate, green controls, metadata preflight mistake, AST executions and
complete command. Normal hooks, fresh final-head native/review checks and fresh
same-tuple nativeC32–C35 remain mandatory. Other attach/owner-loss/credential/read-scope/
durability findings remain unresolved. Actual174/42 are unstarted, model calls and
pilot write attempts are zero, no profile is qualified, production remains disabled.
