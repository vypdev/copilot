<!-- bugbot-950-backlog-index:v1 -->
## Current execution — continuation 130

**The goal remains incomplete. No profile is qualified. New 174/42 campaigns are unstarted; qualification calls 0 and evaluated-pilot write attempts 0. Production verification is disabled (direct read 2026-11-22T15:05:58.726981+00:00).**

### Bugbot runtime prerequisite

[PR #1003](https://github.com/vypdev/copilot/pull/1003) now publishes `94d760065b208488432f6644b69a1991ad8b5597`. Normal hooks pass946 SDK suites /18,869 tests with35 historical skips. Final focused suites pass168/168 without skips (125 diagnostic+43 journal). Generation and all seven remaining source validators pass. Pure policy coverage remains100%; the adapter exceeds every unchanged floor. Audit verifies68 outgoing versions/55 lossless archives, zero secret/account-path findings and four unchanged generated SDK bundles. Fresh native gates/review are pending; **Native4 remains unexecuted**.

The parent cf5b4306 is not accepted: its [native coverage job](https://github.com/vypdev/copilot/actions/runs/45032430479/job/137238727590), on ubuntu-runner-1, retains945 passing suites,18,859 passing tests, one journal fixture timeout at5,005 ms against5,000 ms and35 historical skips. All116 diagnostic controls passed. The precise pending I/O stage is unobserved. That real-journal lost-response fixture now uses the same 20 s allowance already assigned to successful Variable fixtures. A separate controlled 6 s delay after real fsync retains old-budgetFAIL→corrected-budgetPASS; it is not a trace of the native delay. HTTP/runtime/research/model/qualification limits are unchanged.

The completed parent review validated9/9 partitions and raised a valid capture-integrity defect: separately decoded UTF8 chunks could corrupt characters, and dropped large chunks followed by later small chunks could create output gaps. The corrected adapter retains contiguous first 65,536 raw bytes per channel, decodes once, and separately records original observed/prefix byte counts and digests through child close. Schema 4 declares UTF8-with-replacement text; existing decoded-text hashes and privacy projection keep their meanings. Truncation still fails. The same corrected125 test-file bytes retain116 PASS / 9 FAIL → 125 PASS. One initial wrong projection-token assertion is preserved separately. The current finding awaits fresh corrected-source review; five earlier threads remain resolved/dismissed.

The [complete current evidence packet](https://github.com/vypdev/copilot/tree/94d760065b208488432f6644b69a1991ad8b5597/quality/bugbot/evidence/issue-1002/controls/output-capture-integrity) preserves full original CI/review logs, input snapshots, all source controls and the prior index. The last actual sandbox [Native3 result](https://github.com/vypdev/copilot/actions/runs/45028875562/job/137227815416) remains5 PASS / 3 FAIL / 2 not run on ubuntu-runner-2, with complete Codex 0.171.0 and Node 24.21.0. Direct Node/system bwrap return both markers + 37; Codex PATH returns37 with empty streams, so read/write remain not-run. Unshare and bundled loopback remain negative, Engine unavailable, cleanup complete. Earlier raw-FD component evidence is retained; exact new self-hosted composition and arbitrary Node stream compatibility remain unverified.

### Four fronts

| Front | Current result | Remaining work |
|---|---|---|
| #974 / #997 | Remote `397de9a6`; call-budget fix merged at develop `5ebb9685`; frozen recovery `a74613e9` / local `607358ed` hardening preserved | Previously requested exact recovery approval; prerequisite integration; actual same-tuple C32–C35 and credential/oracle denial; committed preregistration; then 174 cases with unchanged thresholds |
| #975 | New 42 reviews unstarted | Real 174 PASS on identical source/drivers/runtime; then 14 subjects × 3 and every causal, quality, integrity and post-run latency gate |
| #977 / #998 / #999 | Remote `68657a12`; frozen recovery `16ab6d9a`; trusted master `ace49e4a` still 20 UNKNOWN / 20 | Recovery decision and normal source completion; trusted dependency-behavior inventory. No eligible two-file preview, installation approval request or installation |
| #982 / #996 | Remote `bbf3bf16`; actual 0/6; user reports no environments available | Linux desktop I039/I040, Windows desktop I041/I042, Windows service X023/X026. Independent of Linux Bugbot; #981 excluded |

Existing self-hosted runners are being used. No extra Linux environment or new privileges are requested by these output/test corrections. The contained-driver Engine tuple is still unobserved; its fixed `/var/run/docker.sock` query was unavailable. The previously asked existing-runner Engine configuration question and exact #997/#999 recovery decision remain pending. Both frozen commits and develop `5ebb` remain unchanged; merge does not move their reviewed base while that exceptional recovery decision is pending.

### Preserved history

The complete previous index through 129 is [readable at immutable commit94d76006](https://github.com/vypdev/copilot/blob/94d760065b208488432f6644b69a1991ad8b5597/quality/bugbot/evidence/issue-1002/controls/output-capture-integrity/goal-950-canonical-through-continuation129.md), SHA256 `ee7c564ad07d97031dca58b61baa0b335e0d1368ad8aaf99dd6f5c4f40cfcb4a` (5,847 UTF8 bytes). It preserves the previous live text verbatim and links the complete prior archives through 128/126. The [original 27-issue traceability](https://github.com/vypdev/copilot/blob/ccefb27627cd627ccdb7d5666fd174c2ac1da07b/quality/bugbot/evidence/issue-950/traceability.md), earlier negative results and prerequisite merges remain retained. This is the same canonical comment; no duplicate progress comment was created.

<!-- codex:goal-950-execution:v1 -->
<!-- codex:goal-950-continuation:130 -->
<!-- codex:goal-950-execution:end -->
