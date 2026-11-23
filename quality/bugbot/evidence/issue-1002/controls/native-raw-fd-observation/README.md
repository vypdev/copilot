# Actual raw descriptor observation — #1002 / PR 1003

**Owned read and write denial pass. Collection and cleanup completed. Two
prerequisites still fail; Engine is unavailable. No profile is qualified.**

[Run 45038779876/job 137258341354](https://github.com/vypdev/copilot/actions/runs/45038779876/job/137258341354)
executed immutable source `94d760065b208488432f6644b69a1991ad8b5597` once on
**ubuntu-runner-4**, Linux x64 kernel 7.0.0-43, UID 1001. It verified the complete
official Codex 0.171.0 package and Node 24.21.0. The source's CI, Commit,
Verification, Branch Sync and 10/10-partition review passed before dispatch;
all six review threads were resolved (five fixed, one dismissed).

| Actual observation | Result | Retained evidence |
|---|---|---|
| Unshare user/network namespace | FAIL, exit 1 | uid_map write EPERM |
| System bwrap user/network namespace | PASS, exit 0 | Exact Node payload witness |
| System bwrap root/user/network namespace | PASS, exit 0 | Exact Node payload witness |
| Codex empty-PATH startup | FAIL, exit 1 | Bundled bwrap loopback RTM_NEWADDR EPERM |
| Codex PATH startup | PASS, exit 0 | Startup only |
| Direct Node transport | PASS, exit 37 | Both exact output markers |
| System bwrap transport | PASS, exit 37 | Both exact output markers |
| Codex PATH transport | PASS, exit 37 | Both exact output markers |
| Codex owned fixture read | PASS, exit 0 | Exact trusted fixture SHA256 |
| Codex owned write denial | PASS, exit 0 | DENIED and trusted post-command absence |
| Optional Engine observation | Unavailable | Fixed local Unix-socket query did not establish an Engine tuple |

The original schema 4 receipt is readable as `native-observation.json`, byte for
byte identical to the downloaded artifact member. The original ZIP stays
private with its verified digest; its complete JSON content and provider
artifact metadata are retained here. No output was truncated. Per-channel
observed/retained raw byte counts and digests satisfy the fixed prefix contract;
the three execution controls verify exact stdout, stderr and 37 before read/write
are admitted. System-bwrap metadata alone remains non-certifying; its separate
actual execution rows provide their own evidence.

The preflight's first guard stopped before any POST: the exact optional neutral
Approval assessment was attached to the Commit run, while the guard expected
Branch Sync. Its source and actual job membership are preserved. The corrected
guard admits only the exact current-head check 137256089980 after verifying its
neutral out-of-scope recommendation, 4/4 source checks, revision and base. Every
critical run/job, Review, Verification and all six resolved threads still had to
pass; refs were rechecked immediately before the single POST. The neutral
recommendation grants no merge, qualification or production authority.

The complete preceding native CI preserves 946 SDK suites  / 18,869 passing tests
with 35 historical skips, and extension 385 suites  / 5,291 passing tests. All global
and module coverage gates pass. Native Commit verifies 44 requirements in 2/2
batches with 13/120 calls under its unchanged budget, after collecting 603 paths
and 8 source parts. Its 73% engineering estimate is not completion of this goal.
The full review log validates10/10 partitions and fixes the capture finding.
These engineering model calls are separate from qualification calls, which are 0.

The manifest’s `sourceSha256` map covers the documentation and catalog published
at `b26c892c89e5fb3ee0e45629881b01a32e85ef5b`, identified by
`sourceSha256Revision`. It does not describe those files at executed source 94.
The separate `immutableExecutableSourceSha256` map is bound to
`immutableExecutedSource` 94; every listed runtime file matches that revision.
The original ambiguous manifest is retained in the fixture-readiness follow-up
packet. No original runtime receipt or output was changed.

This publication changes evidence, observed documentation and catalog links.
The diagnostic driver, policy, workflow, tests and dependency lockfile remain
byte-identical to the executed source `94d76006`. Its new evidence commit was not
executed, and does not justify another unchanged diagnostic. Prior native
negatives, source controls and their immutable identities remain unchanged.
Native3 ran on ubuntu-runner-2, while this run used ubuntu-runner-4; these are
not presented as a matched same-host causal experiment. The earlier controlled
Linux syscall contrast and matched source tests remain separate evidence.

The full previous canonical index through 130 is preserved verbatim here and
links the immutable history through 129/128/126. Each .log.gz preserves complete
original bytes; archive-map.json records raw and compressed SHA256s. Original
runtime attempts and the original ZIP remain retained privately as well.

SDK/model-tool acceptance, managed credential/oracle exclusion and common native
C32–C35 on the contained image remain unobserved. No existing Engine tuple is
inferred from this unavailable socket query. No alternate backend, network
relaxation or runner privilege was introduced. The frozen #997/#999 recoveries
still await their separately requested decision, #977 has no eligible default
installation preview and #982 remains 0/6 with unavailable environments.
The 174/42 campaigns are unstarted; evaluated-pilot writes 0; profile NONE;
production verification remains disabled. See [#950](https://github.com/vypdev/copilot/issues/950#issuecomment-7015916845).
