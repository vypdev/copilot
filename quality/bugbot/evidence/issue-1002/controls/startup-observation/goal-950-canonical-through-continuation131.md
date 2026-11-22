<!-- bugbot-950-backlog-index:v1 -->
## Current execution — continuation 131

**Actual Codex PATH transport, owned read and write denial now pass on an existing self-hosted runner. The goal remains incomplete: no profile is qualified; 174/42 campaigns are unstarted; qualification calls 0 and evaluated-pilot write attempts 0. Production verification is disabled (direct read 2026-11-22T16:00:31.007599+00:00).**

### Actual Linux observation

[Native4/run 45038779876/job 137258341354](https://github.com/vypdev/copilot/actions/runs/45038779876/job/137258341354) executed immutable `94d760065b208488432f6644b69a1991ad8b5597` once on **ubuntu-runner-4**, Linux x64 kernel 7.0.0-43, UID 1001. It verified the full Codex 0.171.0 distribution, all five required executable identities and Node 24.21.0.

| Actual result | Observation |
|---|---|
| Three execution controls | Direct Node, system bwrap and Codex PATH each return both exact output markers and 37: PASS |
| Owned read | Exact trusted fixture digest: PASS |
| Owned write denial | DENIED plus trusted canary absence: PASS |
| Namespace/startup negatives | Unshare uid_map EPERM and empty-PATH bundled bwrap loopback RTM_NEWADDR EPERM: FAIL |
| Optional Engine / cleanup | Engine unavailable; collection and cleanup complete |

All ten rows are retained: **8 PASS / 2 FAIL / 0 not-run**. The completed job does not convert negative prerequisites into passes or establish SDK/model-tool acceptance. Schema 4 retains exact observed/prefix raw byte identities separately from projected text; no output was truncated. Arbitrary Node stream compatibility remains not measured. Earlier Native1–3 negatives remain unchanged; Native3 used ubuntu-runner-2, so these are not represented as a matched same-host experiment.

Source 94 passed all four native CI jobs: SDK 946 suites  / 18,869 tests with 35 historical skips, extension 385 suites  / 5,291 tests and unchanged coverage gates. Commit verified 44 requirements in 2/2 batches with 13/120 calls. Verification and Branch Sync pass; review validated 10/10 partitions and all six threads resolved, five fixed/one dismissed. A first preflight stopped before POST on an incorrectly assumed job association for the optional neutral Approval check. The exact current-head out-of-scope assessment was verified and that association corrected; every critical gate, resolved thread and fresh ref check remained required before the single POST. No approval or merge authority was inferred from that neutral check.

[PR #1003](https://github.com/vypdev/copilot/pull/1003) now publishes evidence-only `b26c892c89e5fb3ee0e45629881b01a32e85ef5b`. Its [durable packet](https://github.com/vypdev/copilot/tree/b26c892c89e5fb3ee0e45629881b01a32e85ef5b/quality/bugbot/evidence/issue-1002/controls/native-raw-fd-observation) retains the readable original receipt, complete native/CI/Commit/Review logs, identity pins, guard history and verified lossless archives. The original receipt SHA256 is `62bd68bdb80550318ded7424e2e7a73410bef9a7995dad96b28317bb886b6ac6`. Driver/policy/workflow/tests/lockfile remain identical to executed 94; four generated bundles are unchanged. Publication validators and normal hooks pass 946 suites  / 18,869 tests + 35 historical skips. The outgoing audit is clean. Fresh evidence-head checks are pending; **do not repeat Native4 on this documentation-only head or relabel its SHA as executed**.

### Four fronts

| Front | Current result | Remaining work |
|---|---|---|
| #974 / #997 | Remote `397de9a6`; call-budget fix merged at develop `5ebb9685`; frozen recovery `a74613e9` and local `607358ed` preserved | Previously requested exact recovery decision; prerequisite integration; actual SDK/model tools, credential/oracle exclusion and same-tuple C32–C35; committed preregistration; then 174 cases under unchanged scientific gates |
| #975 | New 42 reviews unstarted | Real 174 PASS on identical source/drivers/runtime, then 14 subjects × 3 with every causal, quality, integrity and post-run latency gate |
| #977 / #998 / #999 | Remote `68657a12`; frozen recovery `16ab6d9a`; trusted master `ace49e4a` still 20 UNKNOWN / 20 | Recovery decision and normal source completion; trusted workflow/dependency behavior inventory. No eligible two-file preview, installation approval request or installation |
| #982 / #996 | Remote `bbf3bf16`; actual 0/6; user reports no environments available | Linux desktop I039/I040, Windows desktop I041/I042, Windows service X023/X026. Headless runner evidence does not substitute for these; #981 stays excluded |

The optional Engine query did not establish a usable tuple at `/var/run/docker.sock`; it does not prove Docker is absent from every runner. The existing-runner Engine configuration question and the exact #997/#999 recovery decision remain pending. No extra Linux machine, new privilege or backend/network relaxation was introduced. Frozen recoveries and develop `5ebb` remain unchanged while that exceptional recovery decision is pending. SDK/model/credential and contained-image controls remain separate from the successful owned read/write witnesses.

### Preserved history

The complete previous index through 130 is [readable at immutable commit b26c892c](https://github.com/vypdev/copilot/blob/b26c892c89e5fb3ee0e45629881b01a32e85ef5b/quality/bugbot/evidence/issue-1002/controls/native-raw-fd-observation/goal-950-canonical-through-continuation130.md), SHA256 `7687cee5a06a9b44d1eb7e49fc8cbf592d05d2ae0f2d2a4650e2b6130f64fed9` (5,858 UTF8 bytes). It preserves the previous live text verbatim and links all prior archives through 129/128/126. The [original 27-issue traceability](https://github.com/vypdev/copilot/blob/ccefb27627cd627ccdb7d5666fd174c2ac1da07b/quality/bugbot/evidence/issue-950/traceability.md) and all earlier negatives remain retained. This is the same canonical comment; no duplicate progress comment was created.

<!-- codex:goal-950-execution:v1 -->
<!-- codex:goal-950-continuation:131 -->
<!-- codex:goal-950-execution:end -->
