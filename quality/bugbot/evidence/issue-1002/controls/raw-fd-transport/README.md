# Raw descriptor measurement correction — #1002 / PR1003

Actual self-hosted [45028875562](https://github.com/vypdev/copilot/actions/runs/45028875562)
on ubuntu-runner-2 verified the complete Codex0.171.0 package and Node24.21.0.
Its original schema2 ten-row receipt retains5PASS/3FAIL/2not-run. Direct Node
and system bwrap deliver both exact markers and37; namespace bwrap witnesses
also pass. Codex PATH returns37 but both streams are empty, so owned read/write
correctly stay not-run. Unshare fails uid_map; bundled bwrap now reaches loopback
setup and fails RTM_NEWADDR/EPERM. Engine remains unavailable; cleanup completes.
The failed job is preserved, not retried. Full original receipt/log/provider
metadata remain here; the original ZIP remains private with its bound digest.

Pinned0.171seccomp denies socket-introspection syscalls in restricted networking.
Pinned24.21libuv returns unknown for the corresponding failed socket descriptor
classification; Node then installs dummy Writable streams. Upstream issue18473
reports the matching symptom. A separate actual local Linux component contrast
uses existing Node24.20ARM as UID1001 without capabilities, network or host mounts.
With only three additional introspection denials, socket-backed streams become
dummy Writable and discard output, while raw fs.writeSync output survives.
The two unfiltered baselines also succeed: four expected controls pass. The first
Python launcher exited127 before any case; the corrected launcher uses already
installed Perl, with no dependency install or privilege grant. This is component
mechanism evidence, not Codex/SDK execution or the exact self-hosted24.21x64tuple.
An independent syscall trace of that exact tuple remains unobserved.

All owned diagnostic Node payloads now emit through raw descriptors. Fixed
markers,0/37exit requirements, signals, output completeness, cancellation and
read/write admission do not change. Schema3 declares node-fd-write-sync and
Node stream compatibility not-measured. No seccomp/network relaxation or
runtime/backend selector is added; this does not claim arbitrary Node streams
or SDK/model tools work. The same116test-file bytes retain111PASS/5FAIL before
and116PASS after changing only payload writes. Six new cases cover namespace,
two-channel transport, actual read/missing fixture, modeled EROFS and actual
unexpected canary writes. Tests use real Node/process/output/file mechanics
with explicitly modeled dummy streams; actual sandbox denial is not inferred.
Later schema/summary assertions refine existing cases without doublecounting.

Pure policy coverage remains100%all metrics. Adapter99.52%lines,96.25%statements,
89.69%branches,94.33%functions exceed unchanged floors. Focused coverage retains
exit1 for unrelated global owners not executed by that suite, with no suppression.
All eight final validators pass. Normal hooks and new native source/runtime gates
remain pending at packet creation. Prior complete native CI retains946SDKsuites,
18,854PASS+35historical skips and extension385suites/5,291PASS. Commit verifies
41requirements in2/2batches with12/120calls under its unchanged budget.

The prior completed8/8review raised one artifact-rerun claim. The integrity-
verified exact @actions/artifact2.3.2client contract contradicts that claim;
primary metadata/declarations and the public reply/resolution receipts remain.
No source or diagnostic rerun dismissed it; all five threads resolved. The
neutral Findings check is retained and never treated as automatic approval.

All .log.gz files preserve complete original bytes with raw/compressed hashes
in archive-map.json. Primary source Git blobs are independently verified.
OpenAI Codex sources use Apache-2.0; Node/libuv and actions/toolkit use their
included licenses/notices. Upstream issue18473 is linked and paraphrased, not
redistributed. The readable canonical128archive preserves all earlier live text
and links the immutable full history through126. Earlier packets are unchanged.

Native4 requires a new source commit and all source gates; never repeat Native3.
SDK/model tools, managed credential/oracle exclusion, common C32–C35 and174/42
campaigns remain separate. Qualification calls0; evaluated-pilot writes0;
profileNONE. No production setting, privilege, frozen recovery or develop base changed.
