# Native CLI argument correction — #1002 / PR1003

Actual self-hosted run45016512460/job137189879318 on exact2f057efb verified
Codex0.171.0's official x64 bytes and Node24.21.0 on ubuntu-runner-1. Both
bubblewrap commands passed; unshare failed to write uid_map. All four Codex
commands exited2 at argument parsing because the diagnostic prepended an
unsupported exec-only ignore flag. They also warned that CODEX_HOME did not
exist. No CLI sandbox command, owned read or write denial executed. Local
Engine observation was unavailable and cleanup completed. Green job status
means all observations were collected; its two positive rows do not certify
the CLI, SDK, model tools or qualification. Complete original receipt, job log
and provider artifact metadata are preserved. Original artifact ZIP remains
private with its recorded digest; its complete JSON bytes are in this packet.

Pinned official CLI main/lib/debug_sandbox source confirms root configuration
is forwarded to the host sandbox command. The new lib Git blob is independently
verified. The correction places root --config pairs before sandbox -- command,
omits exec-only ignore flags and creates the owned0700CODEX_HOME before any
CLI invocation. Fresh HOME/CODEX_HOME/XDG/cwd retain configuration isolation;
managed system requirements remain authoritative. Ordinary SDK exec policy,
seven fixed probes, process bounds and runner privileges are unchanged.

One new grammar case and a refined existing real-filesystem case reproduce
67PASS/2FAIL on the same69test bytes; corrected source passes69. The policy is
100%all coverage metrics; adapter95.4%statements,99.41%lines,86.32%branches,
93.18%functions exceed unchanged floors. Focused coverage retains exit1 for
unrelated global owners not executed by this suite; no threshold is suppressed.
Types, documentation, workflows, specifications/catalog, lint and Graphify pass.
Normal hooks and fresh corrected-head native CI/review remain pending here.

The previous2f057efb native CI passes946suites/18,812tests with35historical
skips; the complete positive job log and first C38 negative in the earlier
packet remain. All four initial review threads resolved automatically.
Two dispatch guards initially stopped locally (optional approval neutrality;
REST comments following the moved head). Neither sent a POST. A complete
resolved-thread check then admitted exactly one real native dispatch. Those
controller negatives remain separate from actual native outcomes.

All .log.gz files preserve original bytes and raw/compressed hashes. The earlier
evidence packets are unchanged. A changed native diagnostic requires a new
source commit and passing source gates; never repeat45016512460 unchanged.
Managed credential/oracle exclusion, common native C32–C35 and174/42scientific
campaigns remain separate. Qualification calls0; evaluated-pilot writes0;
profile NONE. No production setting, runner privilege or frozen974/998recovery
snapshot changed, and no merge moves their reviewed develop base.
