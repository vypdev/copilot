# Closed Engine connection cause

The previous actual runner receipt reported the local Engine query unavailable
without retaining its connection cause. That result cannot distinguish a missing
socket, denied access or refused connection. No cause is inferred retroactively.

The observer now retains only known closed tags: ENOENT → `missing-socket`,
EACCES/EPERM → `access-denied`, ECONNREFUSED → `connection-refused`. Unknown,
absent or prototype-key values leave the optional field absent. Raw error codes,
messages, stacks and paths are excluded. The Job Summary displays only fixed
status text; unknown/forged values stay cause-unknown. Observed version metadata
does not verify a workload. The fixed Unix socket, GET/version request, timeout,
permissions and no-workload policy are unchanged.

Eight new controlled cases produce **133 PASS / 5 FAIL → 138 PASS / 0 FAIL**
with identical test-file bytes. Four cover known codes, three unknown/absent/
prototype-key/privacy behavior, and one closed summary projection. These use
controlled HTTP events; they do not observe an actual runner's new Engine cause.
The exact old/new runtime bytes and test identities are recorded separately.

Policy coverage is 100% for all metrics. Adapter coverage is 99.55% lines,
96.77% statements, 91.47% branches and 94.64% functions, passing its unchanged floors.
The two-module coverage command retains exit 1 for absent unrelated web and
specification-publication coverage owners. No threshold is suppressed and
global/native acceptance remains separate.

[`source-and-controls.json`](source-and-controls.json) retains eight lossless
raw-log archives, including all five completed native source-gate jobs for
parent `63d6ac0e`: SDK 946 suites / 18,874 tests + 35 historical skips, extension
385 suites / 5,291 tests, Commit 42 requirements / 2 batches / 13 of 120 calls,
and Review with eight resolved threads. The
[previous canonical comment](goal-950-canonical-through-continuation132.md) is
preserved verbatim with its earlier history links.

After the changed committed source passes its exact-head gates and review, one
new model-free observation may collect the previously discarded connection
cause on an existing self-hosted runner. It has not run yet. Native4 remains
the single original source 94 observation, with 8 PASS / 2 FAIL and Engine unavailable.
Neither a socket error nor version metadata establishes a conforming contained
SDK/model-tool runtime, credential/oracle exclusion, C32–C35 or qualification.
Actual 174/42 are unstarted, qualified profiles NONE, qualification calls 0,
evaluated-pilot writes 0; production settings remain unchanged and verification
disabled. No privilege, backend or configuration-selector change is introduced.
