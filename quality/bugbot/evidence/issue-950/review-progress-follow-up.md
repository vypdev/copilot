# #950 review progress follow-up

The [completed review of `53b21735`](https://github.com/vypdev/copilot/actions/runs/43467621545/job/132063831481)
validated all 106 partitions in two frames. It reported 37 findings, with 20
inline findings and 17 in overflow. The [next review of
`7ead27b81`](https://github.com/vypdev/copilot/actions/runs/43515411649/job/132196027792)
last observed 37 of 109 validated partitions. GitHub marked the job failed
because its self-hosted runner lost communication. The [presentation
check](https://github.com/vypdev/copilot/runs/132197143730) stayed in progress.
The previous verified card on the PR survived. The [Commit
run](https://github.com/vypdev/copilot/actions/runs/43515390976) completed on
that head and [updated the issue
card](https://github.com/vypdev/copilot/issues/950#issuecomment-6732557685)
with 113 requirements, a 58% estimate and a complete assessment link.

The new read path authenticates that issue card through GitHub's closing
references, trusted ownership, the scope marker and the PR destination.
It links the assessed SHA from the canonical PR card after reconciliation.
The approval observer uses a completed native event to recover an interrupted
attempt's exact check while keeping its last observation. It neither
submits a review through this recovery path nor adds an approval receipt.
The aggregate PR comment's live block still depends on a shared writer
across analysis and manual reconciliation routes. The check carries the live
view until that writer is available.

## Disposition of the 20 inline findings

The descriptions below scope the follow-up to the affected source. They are
not qualification results for the historical experiments.

| Review finding | Disposition |
|---|---|
| [Coverage fixture validates freeze after invoking a control](https://github.com/vypdev/copilot/pull/951#discussion_r4569014158) | Archived #895 runner. Verify the preregistered checksums and use a clean pinned checkout before any historical replay. Its runner is frozen. |
| [Isolation in the historical pagination control](https://github.com/vypdev/copilot/pull/951#discussion_r4569014164) | Archived fixture. Run only the trusted pinned fixture in an isolated environment. This fixture did not become an installed verification adapter. |
| [Same-line Python assignment](https://github.com/vypdev/copilot/pull/951#discussion_r4569014168) | Limitation of the experimental causal analyzer. It is outside the installed verifier. Preserve the original replay and require a successor regression before reusing the analysis. |
| [Cumulative token telemetry in an early shadow runner](https://github.com/vypdev/copilot/pull/951#discussion_r4569014174) | Historical. The installed runner records telemetry without using it as a cutoff, including for resumed cumulative values. |
| [Missing session IDs in the two-case runner](https://github.com/vypdev/copilot/pull/951#discussion_r4569014253) | Historical. A successful process exit is insufficient evidence of two independent sessions. Require actual, distinct session IDs in a future replay. |
| [Conditional Python field initialization](https://github.com/vypdev/copilot/pull/951#discussion_r4569014270) | Experimental analyzer limitation. Future reuse needs an execution-path regression. |
| [Rebound Python decorator](https://github.com/vypdev/copilot/pull/951#discussion_r4569014277) | Experimental analyzer limitation. Future reuse needs binding evidence at the decorator. |
| [OpenCode record boundary](https://github.com/vypdev/copilot/pull/951#discussion_r4569014289) | The installed catalog's indentation passed the old parser. The successor parser reads through to the next model header and covers a nested unindented record. |
| [Inherited abstract Python method](https://github.com/vypdev/copilot/pull/951#discussion_r4569014296) | Experimental analyzer limitation. Future reuse needs an inherited-method regression. |
| [Legacy verifier concurrency](https://github.com/vypdev/copilot/pull/951#discussion_r4569014309) | Historical runner limitation. Its frozen ledger cannot establish the preregistered global concurrency cap. |
| [Two-case runner accepts unpinned input bytes](https://github.com/vypdev/copilot/pull/951#discussion_r4569014317) | Historical runner limitation. Verify the canonical frozen input digest before dispatching any repeat. |
| [v3 SDK revision not authenticated by the runner](https://github.com/vypdev/copilot/pull/951#discussion_r4569014329) | Historical runner limitation. Any repeat must authenticate its exact SDK source before imports. |
| [Publication after becoming a draft](https://github.com/vypdev/copilot/pull/951#discussion_r4569014337) | Fixed before this follow-up in `7ead27b81`. The enforced workflow control asserts no finding or receipt after the draft transition. |
| [Codex has no turn deadline](https://github.com/vypdev/copilot/pull/951#discussion_r4569014349) | Intentional verifier contract. Explicit cancellation remains available. |
| [Root syntax in the first #895 runner](https://github.com/vypdev/copilot/pull/951#discussion_r4569014358) | Historical. The later Git replay added root normalization and exact-name instructions. |
| [Legacy SDK root accepted without revision check](https://github.com/vypdev/copilot/pull/951#discussion_r4569014371) | Historical runner limitation. A future repeat requires an authenticated selected SDK checkout. |
| [Brokered verifier bypasses a turn deadline](https://github.com/vypdev/copilot/pull/951#discussion_r4569014379) | Intentional verifier contract. Explicit cancellation remains available. |
| [Late Python import accepted earlier in the module](https://github.com/vypdev/copilot/pull/951#discussion_r4569014390) | Experimental analyzer limitation. Future reuse needs an import-order regression. |
| [Mixed workspace and causal search targets](https://github.com/vypdev/copilot/pull/951#discussion_r4569014403) | Historical chain prototype limitation. Future reuse needs mixed-target coverage. |
| [Missing EV-07 score permits dispatch](https://github.com/vypdev/copilot/pull/951#discussion_r4569014413) | Both current entry points require a passing 174-case score before dispatch. The archive preserves the original runner and its checksum. |

The previous review also recorded 17 overflow findings. Its count does not
establish an individually published finding or a resolution for any of
those 17 items.

## Native review of `9e9f1536f`

GitHub completed the [native review](https://github.com/vypdev/copilot/actions/runs/44267786812)
with verification configured as `disabled`. Bugbot validated **113/113**
partitions across two frames. Its review check concluded with findings. The
same [canonical PR comment](https://github.com/vypdev/copilot/pull/951#issuecomment-6865721341)
published the full reviewed SHA and linked the
[Commit assessment](https://github.com/vypdev/copilot/issues/950#issuecomment-6732557685)
with that same SHA. The fresh read of the linked issue and trusted comment
gave the production selector the same link. CI and the SDD verification
check completed successfully.
[CI](https://github.com/vypdev/copilot/actions/runs/44267786699) ·
[Verification check](https://github.com/vypdev/copilot/runs/134694599502)

The [review snapshot](https://github.com/vypdev/copilot/pull/951#pullrequestreview-5957278907)
retains 16 individually published findings and reports 29 additional
findings beyond the comment limit. Earlier experimental runners and ledgers
remain available in the [pilot archive](README.md#historical-evidence). A
title in the overflow summary supplies no independently verified disposition.

| Current path | Follow-up control |
|---|---|
| [Ambiguous comparison side](https://github.com/vypdev/copilot/pull/951#discussion_r4614467031) | A replacement at the same numeric line on both sides stays inconclusive. The enforcement simulation starts no session or publication for that finding. |
| [Legacy status card](https://github.com/vypdev/copilot/pull/951#discussion_r4614467095) | A same-PR trusted legacy card retains its bytes during progress and upgrades under the same comment ID after validated completion. |
| Evidence provenance | The CI reader requires the head repository. A Git read rejects malformed path encoding and confirms that a zero-byte blob has no citable lines. |
| EV-07 admission and scoring | The direct runner and launcher share the corpus gate. Integrity scoring requires an actual audit of the cited Git ranges. |
| Investigation time | A simulated verified verdict still survives the former time ceilings. Explicit cancellation terminates the simulated session. |

## Deterministic controls

```sh
pnpm exec jest --runInBand bugbot_commit_progress_link_policy github_bugbot_interrupted_check \
  load_bugbot_reconciliation_snapshot_use_case synchronize_bugbot_review_presentation_use_case \
  pull_request_approval_action
node --test quality/bugbot/evidence/issue-950/ev07-shadow/launch-full-review.test.cjs
```

The controls include both exact and previous assessment SHAs, missing and
foreign linkage, duplicate issue cards, failed native recovery, wrong
attempts, a newer same-head retry, and dry-run. The EV-07 test uses a
recording launcher and makes zero model calls.

## Review follow-up and native receipt provenance

The historical pilots remain byte-preserved at `bugbot-950-pilot-evidence`; the current controls remain in the branch. Production verification stays disabled and the PR stays ready for review.

| Native observation at `ca75978d6` | Disposition and evidence |
| --- | --- |
| [Untrusted SQLite interpreter](https://github.com/vypdev/copilot/pull/951#discussion_r4619720934) | Fixed. The installed source/CI profile supplies no executable SQLite probe. An unavailable runtime is explicit. Trusted diagnostic brokers remain separate; no local version is promoted to historical CI evidence. |
| [Receipt producer](https://github.com/vypdev/copilot/pull/951#discussion_r4619720956) | Fixed with a native run artifact binding the custom Review check ID and exact receipt to run/attempt/repository/head. The real custom check belongs to a different suite from its native workflow; suite equality or using the native job check ID would reject a genuine receipt. Missing, expired, duplicate, altered or mismatched artifacts fail closed. |
| [Platform smoke trigger](https://github.com/vypdev/copilot/pull/951#discussion_r4619720965) | The current routing SDD now matches the maintainer-approved self-hosted policy and manual protected-base platform validation. Installation templates are unchanged. This does not claim that manual platform acceptance ran. |
| [Temporal premises](https://github.com/vypdev/copilot/pull/951#discussion_r4619720973) | Fixed in installed typed premises and same-session closure. Sequence-dependent claims require both operations and the mechanism fixing order; “then” and “follows” have deterministic regressions. Historical pilot contracts remain frozen. |
| [Documentation anchors](https://github.com/vypdev/copilot/pull/951#discussion_r4619720979) | Fixed by linking the verified immutable revision containing each heading. |
| [GraphQL audit](https://github.com/vypdev/copilot/pull/951#discussion_r4619720992) | Fixed. The loopback canary records a GraphQL mutation as a write attempt before rejecting it. Its explicit negative audit control is separate from the zero-write evaluated PR runs. |
| [Interrupted check pagination](https://github.com/vypdev/copilot/pull/951#discussion_r4619720999) | Fixed with shared complete-page reconciliation and a genuine second-page match. Duplicate, truncated or inconsistent native metadata is rejected. |
| Seven timeout/turn-limit observations | Not adopted: they conflict with the explicit product contract. Investigation time and token usage remain telemetry, with explicit cancellation propagated. No session, turn or token deadline was reintroduced. |
| [Fork CI exclusion](https://github.com/vypdev/copilot/pull/951#discussion_r4618353882) | Preserved as explicitly requested by the maintainer. The observed repository metadata alone does not prove the external organization restriction. No runner or installation-template change is included. |
| [Contradictory historical scorer](https://github.com/vypdev/copilot/pull/951#discussion_r4614466847) | The diagnostic scorer and its results remain archived with their original limits. They are not qualification evidence. Current qualification retains the frozen independent corpus and exact full-review gates. |

The artifact SDK is pinned to `@actions/artifact` 5.0.3 for the existing CommonJS Action, with its GitHub client at the repository's 8.0.1 and storage client at 12.33.0. The latter is the last release before the optional Arrow listing codec introduced an auxiliary bundle; the single-file distributable must not lose a required chunk. The public SDK API is used. Production dependency audit has no high or critical report and retains two moderate reports.

Reproduction from the reviewed checkout:

```sh
pnpm run test:bugbot-shadow-verification
pnpm exec jest --runInBand --runTestsByPath src/infrastructure/github/__tests__/github_bugbot_verification_artifact.test.ts src/data/repository/pull_request/__tests__/pull_request_approval_repository.test.ts src/infrastructure/bugbot/__tests__/shadow_verification_adapter.test.ts src/infrastructure/github/__tests__/github_bugbot_interrupted_check.test.ts
pnpm run build
out="$(mktemp -d)"
node quality/bugbot/evidence/issue-950/status-card-publication/packaged-canary.cjs build/github_action/index.js "$out"
node quality/bugbot/evidence/issue-950/cursor-rollback-shadow/packaged-rollback.cjs build/github_action/index.js
pnpm run validate:specifications
pnpm run validate:docs-page
pnpm run validate:workflows
pnpm run validate:build
graphify update .
```

Deterministic validation: **86** shadow controls, **279** focused Jest cases, **13** packaged status scenarios plus the explicit rejected-mutation audit, and **six** packaged approval/rollback scenarios. These tests use synthetic local providers and make zero calls to evaluated PRs. The owning SDD retains the exact Action-published bytes; the current amendments live in the catalogued reconciliation, approval and routing specifications. The archive-link control checks 38 paths and every row of the 27-issue matrix.

The new qualification runner uses the shipping compiler options. Its deterministic clock-initialization control reproduces the old ES2022 loader failure and proves the current ES2020 initialization without model calls. The first full hook caught a stale mock type; that test was corrected rather than weakening its compiler check.

The remote CI and native review of `ca75978d6` passed before this change. The full build/test/lint hook passed at `d26d0d6cd633c3aa313ddd21235fe985860b4104`. Final-head CI, native review and the [new preregistered EV-07 result](ev07-shadow/campaign-provenance.md) must be reported independently. The older measured precision remains **87.95%**, below **90%**; it is not replaced by deterministic controls.

## Canonical bundle bytes after the first CI of `86e2430ec`

The [Build and package job](https://github.com/vypdev/copilot/actions/runs/44403063788/job/135150944006) failed its generated-bundle check; static checks passed. The native review remains on that SHA while this correction is prepared locally.

The measured working Action contained 451 CRLF line endings. Its SHA-256 was `414dccba8ef5cbb987e72f21f4d92336cfa15dd7a3be2b5d3fe9e037cb552c07`. Git's contributor setting `core.autocrlf=input` normalized those bytes when staging, leaving the published blob at `c7a3e0fa07633447f388964e8e9e0b0a54cb0343e48d3e2f2237c4718c217f6e`. Replacing only CRLF with LF makes the entire working file byte-identical to that published blob. The original postprocessor removed trailing spaces but retained vendor CRLF. Its passing local Git check therefore did not establish physical-byte equality across checkout settings.

One Git integration regression copies the actual postprocessor and validator into an owned fixture with `core.autocrlf=false`. It seeds the canonical index, reproduces a failing generated-bundle check with mixed vendor line endings, and verifies the postprocessed physical bytes, preservation of a multibyte character and escaped `\r\n`, a clean Git comparison and idempotence. The original script fails that control; the corrected script passes. All four bundled entry points are normalized, and their checkout attributes explicitly retain LF.

The frozen campaign and its hashes are unchanged. Its packaged controls used the observed raw working build; its manifest did not capture the filtered Git blob as a separate artifact. The raw build is retained for rollback. This correction makes the reproducible working artifact match the already-published canonical blob. Replays against the canonical artifact are separate deterministic evidence. No model call is repeated after the independent gates failed. The production TypeScript and lockfile remain unchanged; the new TypeScript file is a regression test only.

Reproduce the regression and canonical build:

```sh
pnpm exec jest --runInBand --runTestsByPath src/tooling/__tests__/generated_bundle_line_endings.test.ts
pnpm run build
pnpm run validate:build
```

The result and all 174 attempts remain bound to their original implementation and preregistration commits. Final-head CI must still demonstrate the correction on the self-hosted runner. No installation template, runner placement or production activation is changed.

The same CI attempt passed all 938 Jest suites but the separate coverage-budget step rejected `CopilotEvidenceRepository` at 98.25% statements and 97.30% branches, below its unchanged 100% requirement. A new controlled-provider case exercises receipt publication when the artifact capability is absent: the nonauthorizing Check remains visible, publication reports the closed `provider.contract-invalid` failure, and no artifact is manufactured. The focused suite now measures 57/57 statements, 37/37 branches, 6/6 functions and 48/48 lines. The full coverage and setup/extension chain is validated separately before the correction is pushed.

The recovery run passed all 939 Jest suites and 18,611 tests, all 66 coverage budgets, and the setup ledger (336/350 passed; 14 explicitly open). Global Jest coverage measured 97.33% statements, 95.10% branches, 98.02% functions and 98.11% lines. The extension coverage chain also passed at 100% across all four metrics. The canonical packaged Action passed the same 13 status and six approval/rollback scenarios at SHA-256 `c7a3e0fa07633447f388964e8e9e0b0a54cb0343e48d3e2f2237c4718c217f6e`. These are model-free recovery controls, not a new EV-07 qualification.


## Parallel bound progress receipts after the Commit deadline

The [native Commit attempt on `86e2430ec`](https://github.com/vypdev/copilot/actions/runs/44403043305/job/135150870855) passed source capture, classified six acceptance assignments and collected all 13 comparison parts. Only three of four final assessment batches finished before the unchanged shared 30-minute progress allowance. The last batch started with 45 seconds remaining. The run retained the previous assessment; its failure is separate from the generated-bundle and coverage failures above.

The host now schedules up to four independently bound scope receipts and final assessment receipts. Every receipt retains its assigned source IDs, snapshot or manifest, batch and head. Complete classification and complete comparison remain barriers. Source-part scheduling remains unchanged. A terminal error stops queued tasks, drains admitted work and reports the validated receipt count after drain; no partial percentage, label or semantic status can be published. The pure policy and existing application coordinator own the change, without new ports, settings, permissions or stored partial state.

Five additional deterministic integration cases cover legacy scope overlap, out-of-order assessment reduction, provider failure, foreign-head failure, and a virtual-clock workload that takes 32 minutes serially but 16 minutes under the pool. The original scheduler fails that clock case with `time-budget`; the revised one passes. Two preexisting correction fixtures now identify their intended receipt by its assigned requirement instead of a global completion count, so concurrent completion cannot change which defect they inject. All 186 focused progress, repair and concurrency tests pass. These controls make zero model calls.

The fixed progress ledger remains 120 calls and 30 minutes. This is the SDD progress assessment, not a Bugbot finding investigation: research time and tokens remain telemetry. The prior 939-suite recovery run and canonical bundle hash describe the line-ending and publisher-coverage correction before this scheduler amendment. The amended runtime requires a new build, full coverage/budget validation, normal commit hook and native final-head Commit result; none is inferred from that earlier run. The selected owning Bugbot SDD stays byte-identical to its Action publication. The current contract amendment is section 23 of the catalogued progress-capacity SDD.


## Terminal native attempt and minimal recovery at `86e2430ec`

The [native run](https://github.com/vypdev/copilot/actions/runs/44403063764) completed all 26 analysis partitions in 81.49 minutes, produced 13 candidates and failed its ten-finding batch publication with HTTP 422 (`publish-comments`, provider reference `B660:385259:FB841:1C1B94:6AFE2E14`). It created no child review and published zero new findings. Its canonical card reports the partial attempt and ten unknown states; this is not a successful review or a new verified Commit assessment. The safe log retained no exact provider validation field. The older Commit assessment still links `ca75978d`.

A strict local provider reproduced a definite request-shape defect without model calls: the application and adapter sent `subject_type: file` through the batch-review endpoint, whose published contract supports line/range comments. The correction keeps a complete unanchored finding and its authenticated marker in the same review body, while exact LEFT/RIGHT comments retain their locations. Missing, nonpositive and fractional comment lines fail locally. This reproduction does not assert that the unrecorded native 422 had no other cause. A mixed application/adapter test reproduces the old 422 and passes with the corrected body fallback. User documentation and the current reconciliation SDD describe this path.

| New native candidate or diagnostic | Evidence-based disposition |
| --- | --- |
| Merge queue required check | Maintainer explicitly disabled merge queue for this repository. No runner, event or installation-template change. |
| Merge execution versus review-head receipt | Fixed. Native artifact metadata retains the verified synthetic-merge execution SHA, while the custom check and receipt bind the reviewed PR head. The real approval consumer both accepts that pairing and rejects a check placed on the merge revision. The actual 86e run and job check both used the PR head. |
| Unenforced CLI version | Fixed for future qualification: exact declared CLI version is checked before model dispatch. Historical runtime measurements and ledgers are unchanged. |
| Missing compiler pin | Fixed: shipping `tsconfig.json` participates in tracked, staged and untracked implementation admission, with a separate mutation regression. |
| Unbound passing corpus summary | Fixed: admission requires the matching complete ledger, plan, implementation, CLI, profile, runner and predictions, and rederives the score. Synthetic success and identity/data/score failures use a recording launcher with zero model calls. |
| Missing base in diagnostic adapter | Fixed: a regression candidate without its authorized fixed base returns a technical failure before any session; head is not substituted as base. |
| Closure with no artificial turn/deadline cut | Retained the explicit maintainer contract. Time and tokens remain telemetry and explicit cancellation remains available. No invented ceiling was added. |
| Reused shadow C22 and inventory minimum | Disambiguated the immutable owner's two titled cases in the current companion; the 36-case baseline and subsequent 13-case inventory are additive, minimum 49 before later amendments. Historical source and results stay byte-preserved. |
| Interrupted recovery does not rewrite the conversation | Intentional: that recovery owns only the exact orphaned Check Run and explicitly leaves the prior conversation and receipt authority unchanged. |

Before the additional publication recovery, the normal hook for `b87c79312` passed 939 suites and 18,616 tests, build and lint. A duplicate local full-coverage run was interrupted after two 5-second fixture timeouts while it competed with that hook; its log remains retained. An isolated run then passed all 98 relevant suites and 2,123 tests, including those fixture cases. It measured 100% statements/functions/lines across the three changed modules, 100% branches for the progress workflow and receipt publisher, and the existing 99.4% branches for the batch policy. The publication/approval changes require their own normal hook and final-head CI. No failed model qualification is repeated.


The first full native-recovery hook passed 938 suites and found one failing identity replay: an unrelated report outside the diff no longer creates an unsupported file comment. That replay also exposed exact body-review duplication after the host refreshed the snapshot status. The adapter now observes complete reviews at the same native head and compares their report content through the shared application-owned historical-content projection, ignoring only the managed header/status. Five adapter controls cover exact reuse, status refresh, foreign heads, unsubmitted reviews and preservation of a new body finding when all inline comments already exist. The identity replay retains two independent IDs and zero unknown states, with one existing child comment and one complete body finding; its second semantic attempt emits no duplicate native review. Broader semantic rewording is not established by this exact replay. The failed hook log is retained; the complete hook must run again after this correction.
## Native review of `46d1d7f69`

The native review completed all **27/27** partitions, published its complete
result and linked the canonical status comment to Commit's exact-head
[implementation progress](https://github.com/vypdev/copilot/issues/950#issuecomment-6732557685).
CI (static, coverage, build and aggregate), Commit, Verification and Branch Sync
passed. Review and Approval remained neutral; no approval was submitted.

| New report | Repository adjudication |
|---|---|
| [Missing canary base reference](https://github.com/vypdev/copilot/pull/951#discussion_r4623130578) | Refuted by the exact source: `check` uses `source.baseRef`, which is initialized independently of mutable state. The packaged control remains required; no source workaround is added. |
| [Driver provenance](https://github.com/vypdev/copilot/pull/951#discussion_r4623130599) | Confirmed. A matching corpus summary/ledger could admit altered full-review drivers. Three model-free regressions admitted before the correction and now reject a changed review driver, missing loader and changed launcher. All eight closed inventory hashes are required at dispatch. |
| [Actual full-review runtime](https://github.com/vypdev/copilot/pull/951#discussion_r4623130603) | Confirmed missing guard. The actual prepared runtime is now checked before dispatch, logged on admission and removed on rejection. Three simulated prepared executions distinguish pinned, foreign and absent versions. |
| [Merge-group trigger](https://github.com/vypdev/copilot/pull/951#discussion_r4623130608) | Intentional maintainer scope: forks are excluded and this repository does not use merge queue. Keep the reviewed self-hosted placement and installation templates unchanged. |
| [Relative diagnostic lab](https://github.com/vypdev/copilot/pull/951#discussion_r4623130613) | Confirmed with a real local Git fixture: the original CLI fails to clone `lab/project.git` after changing working directory. Resolve the lab first. The corrected entrypoint finishes a zero-change review with blocked model execution, no verifier sessions and no writes. |
| [Zero-count acceptance wording](https://github.com/vypdev/copilot/pull/951#discussion_r4623130622) | Clarified C060: conflicting nonzero counts block; an absent patch plus provider `0/0` uses counts from verified immutable sides and complete reconstructing hunks. The existing exact Git recovery case covers that exception. |

Reproduce the seven new controls plus existing shadow regressions with
`pnpm run test:bugbot-shadow-verification`. The frozen plans, preregistrations,
attempt ledgers and negative EV-07 decision remain unchanged. These controls
make no model calls and do not qualify the profile. The source and packaged
canaries, full normal hook and final-head remote checks are reported separately.

Before the next normal commit, the complete shadow command passed **105/105**
controls and the packaged Action passed all **13** status scenarios plus its
rejected-mutation audit at unchanged SHA-256
`210b0d5b214e1a1e5747c5dceab54e7945708358bd9b274df9a4a21f959cabd4`.
The first packaged attempt was denied by the local sandbox's loopback restriction;
the authorized loopback-only rerun passed. It contacted no GitHub endpoint.
Specification, documentation, archive links (38), traceability rows (27) and
Graphify validation passed. The Action-owned SDD retains its exact publication
hash `e3bfaa9eaeca51b13d0c3c425c61317014c50bbb2023a8b081462bafbb9217fa`.

## Native review of `6a7121e26`

The native review completed **28/28** partitions and published its coordinated
result. CI static/coverage/build/aggregate, Commit, Verification and Branch Sync
passed. Review and Approval were neutral, with no approval submitted. The
[terminal card](https://github.com/vypdev/copilot/pull/951#issuecomment-6865721341)
links the [Commit assessment](https://github.com/vypdev/copilot/issues/950#issuecomment-6732557685)
for this exact head. Commit completed 115 requirements in 4/4 batches using
49/120 progress-port calls. Its 61% estimate is an automated source judgment,
separate from executed acceptance and the negative qualification.

| Report | Evidence and disposition |
|---|---|
| [Manual source CI](https://github.com/vypdev/copilot/pull/951#discussion_r4623916234) | Keep the existing trusted internal-branch boundary. The same repository's writers can already submit branch-controlled source CI through a PR; forks and merge queue remain excluded. [GitHub documents write authority for manual dispatch](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow). Restricting only the dispatcher to `master` would remove authorized branch diagnostics without removing that existing execution authority. No workflow, runner or installation template changes. |
| [Scoring plan](https://github.com/vypdev/copilot/pull/951#discussion_r4623916244) | Confirmed. Before correction, the real scorer accepted missing/duplicate scheduler provenance, changed thresholds and a foreign slot plan. Record the selected plan digest at scheduler and slot start; reject a foreign plan, implementation, subject or repetition before scoring or public-ledger output. Correctly bound interrupted slots remain visible and fail qualification. |
| [Live base freshness](https://github.com/vypdev/copilot/pull/951#discussion_r4623916253) | Confirmed before and after publication: a live-ref advance with unchanged cached PR base/head returned fresh. Receipt-bearing ordinary reviews now acquire the live ref before analysis, reuse framed acquisition when available, and compare both bases at the fences. Missing live proof fails closed. A controlled real workflow checks that an advance after verification causes zero publication calls. |
| [Cancellation](https://github.com/vypdev/copilot/pull/951#discussion_r4623916259) | Confirmed. Move process observation from the whole Action to an infrastructure adapter scoped by the application review invocation. Non-review routes install no handlers. Detector, partition retries, framed queries and literal follow-ups receive the linked signal. Controlled Action/application/transport tests cover cancellation, caller signals, handler cleanup and no subsequent dispatch/publication. No research time/token ceiling is added. |
| [Dependency range](https://github.com/vypdev/copilot/pull/951#discussion_r4623916261) | Confirmed with pinned Git fixtures. Matching manifest and importer strings previously accredited an incompatible resolved release. Validate the resolved version using [npm SemVer range semantics](https://github.com/npm/node-semver#ranges). Unsupported catalogs/workspace selectors or unproved overrides remain unaccredited, rather than supplying the wrong official release. Existing supported exact/caret fixtures retain their source and integrity checks. |
| [Initial preparation](https://github.com/vypdev/copilot/pull/951#discussion_r4623916265) | Confirmed. Only an initial unpinned preparation observation can acquire its live-ref field from the trusted identity reader. Explicit pins and later stages still reject changed/missing refs. The same normalized observation is delivered to the Check and status writer. |
| [Prototype terminal retention](https://github.com/vypdev/copilot/pull/951#discussion_r4623916270) | Reproduced in the obsolete duplicate control implementation; the installed production policy already retained the terminal attempt. Remove the duplicate policy and delegate the active control to production. A delayed same-attempt observation stays terminal while a new attempt can resume. |
| [Prototype equal-sequence conflict](https://github.com/vypdev/copilot/pull/951#discussion_r4623916275) | Reproduced in that duplicate. The active control now exercises the installed digest-conflict check and records no replacement write for a changed observation with the same sequence. |
| [Binary display metadata](https://github.com/vypdev/copilot/pull/951#discussion_r4623916281) | Not adopted as a content-integrity defect. The adapter proves regular, NUL-free UTF-8 blobs and complete reconstruction; it does not use diff presentation attributes as a file-eligibility authority. A real Git fixture marks ordinary source `-diff`, observes binary display statistics and still verifies the exact text hunk. NUL and invalid UTF-8 remain rejected. [Git distinguishes binary display overrides, including ASCII content](https://git-scm.com/docs/gitattributes#_marking_files_as_binary). The companion SDD now makes that boundary explicit. |

Reproduce the active controls with `pnpm run test:bugbot-shadow-verification`
and the focused Jest paths listed in the companion SDD. Full-review scoring
controls invoke the real Python entrypoint with synthetic, model-free ledgers;
the synthetic valid provenance case remains **unqualified**, with missing
trials retained. The range and text controls use actual immutable Git trees.
The new semantic cancellation port has no process/provider dependency; native
signal ownership stays in infrastructure. No new repository setting is added.

The measured EV-07 plans, raw ledgers and results remain unchanged. This
follow-up adds deterministic evidence, not a repeated qualification campaign.
The proposed profile remains unqualified, production verification stays disabled
and evaluated cohort PRs receive zero writes. The normal hook, packaged tests
and checks of the next exact head must be reported separately.

The final focused run before the normal commit passed **333/333 Jest cases in
nine suites** and **115/115 model-free shadow controls**. Type checking, lint,
specification generation/validation, documentation and archive-link checks also
passed. The production dependency audit reports no high/critical advisories
and two moderate advisories; this is not a claim of an advisory-free tree.
These controls made no model calls and no requests to evaluated PRs. The
unmodified owning SDD and seven frozen qualification files were compared with
their published commits before staging.

The rebuilt Action at SHA-256
`92b547d7512a111c079964124b6726ca3fea9358efa80a273259da965db5e6b8`
passed **13 packaged status scenarios**, their rejected-mutation audit and
**six packaged rollback/approval scenarios**. The status harness writes only
to its loopback fixture; the approval cases attempt zero mutations. Neither
contacts GitHub. The first status invocation lacked the harness's required
output directory and was stopped; the corrected invocation passed without a
source change. Generated-bundle synchronization and npm package validation
passed. These local results precede the normal commit hook and remote checks.

The first full hook retained its failed result: **939 suites passed and one
failed**, with three strict composition expectations still describing the old
binding. Update those exact expectations to require the native cancellation
adapter on workflow routes and retain its absence locally. The adapter also
resolves the process event source only inside the active invocation, rather
than retaining the entire process in an inert composition object. Repeat the
focused controls, build, packaged canaries and full hook before publication;
the preceding package hash identifies the earlier control run only.

After that correction, **66/66** composition, Action and cancellation cases
passed. The final rebuilt Action at SHA-256
`6cacf2964d7a9100a42593e0bf90a181d29646d9e31c74ff758b1295d72867a4`
again passed all 13 status scenarios, the rejected-mutation audit and six
rollback/approval scenarios. Bundle synchronization passed for these staged
bytes. The final normal hook and remote checks are linked in the PR report.


## Native review of `ea55a971d`

All exact-head CI areas and their aggregate, Commit, Verification, Branch Sync
and the native PR workflow passed. Review and Approval were neutral, with no
approval submitted. Native analysis validated **29/29** partitions and the
[terminal card](https://github.com/vypdev/copilot/pull/951#issuecomment-6865721341)
links the [Commit assessment](https://github.com/vypdev/copilot/issues/950#issuecomment-6732557685)
for this same SHA. Commit completed 112 requirements in 4/4 batches with 50/120
SDD-progress calls; its 57% estimate is a source judgment, not executed acceptance.

| Report | Evidence and disposition |
|---|---|
| [Shadow receipt](https://github.com/vypdev/copilot/pull/951#discussion_r4625106021) | Refuted. A receipt's mode binds the effective policy. In shadow, its counts come from observed ordinary publication, while the verifier simulation is separate. The real workflow already rejects minting a clean receipt from an unobserved ordinary finding after a shadow refutation. Consumer controls retain ordinary open findings over an older clean marker, reject simulated publication, and require fresh ordinary evidence for a same-head rollback into shadow. Unconditionally rejecting shadow-mode ordinary receipts would break that rollback contract. |
| [Runtime fixture argument](https://github.com/vypdev/copilot/pull/951#discussion_r4625106037) | Refuted. The imported local `shadow-verification/broker.cjs` wrapper accepts the lab path and calls the installed broker with `fixtureSource`. The three runtime cases are part of the 115 passing controls on this head. The proposed replacement would pass the wrong type to the local wrapper. No implementation change. |
| [Private PR credential](https://github.com/vypdev/copilot/pull/951#discussion_r4625106048) | Confirmed for private repositories. The native evidence token has no PR-read grant. A controlled permission-bound read rejects it before dispatch. Use the existing ordinary publication credential for PR identity, retaining the narrower native token for Actions/check/content evidence. [GitHub documents PR read permissions and the public-resource exception](https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request). This was not an observed failure on the public #951: the new workflow is not installed on the default branch yet. No permission expansion or runner change. |
| [Cursor credential](https://github.com/vypdev/copilot/pull/951#discussion_r4625106057) | Confirmed. Evaluating the actual generated expression with synthetic credentials returns an empty key for enforced/Cursor. Support both shadow and enforced selection, preserve disabled exclusion and ordinary-role inheritance, and synchronize generator and workflows. Installation-template runner defaults remain unchanged; only the necessary verifier credential condition changes. Production remains disabled. |
| [Uncommitted plan](https://github.com/vypdev/copilot/pull/951#discussion_r4625106062) | Confirmed missing enforcement. Before correction the selected-plan API accepted untracked, outside-Git, modified and staged-only inputs, plus committed weaker criteria and omitted positives. Bind the selected bytes to a regular Git blob and its preregistration commit, retain all fourteen subjects/three repeats and the 174-case corpus, and prohibit weaker published criteria. Corpus, scheduler and slot records carry that provenance and both admission and scoring compare it. Profiles may vary in a newly committed plan. |
| [Campaign hash](https://github.com/vypdev/copilot/pull/951#discussion_r4625106067) | Same provenance capability as the preceding report. Do not pin all future campaigns to the historical controls JSON. Each new committed plan has its own recorded commit/blob/hash, while the independent published minimum policy stays fixed. The executed campaigns and their selected hashes are preserved. |
| [Citation control ID](https://github.com/vypdev/copilot/pull/951#discussion_r4625106074) | Confirmed documentation inconsistency. Use `ev950-shadow-C22/citation-range` consistently and retain `ev950-shadow-C22/source-admission` for the other immutable-owner case. No historical records or owning SDD bytes change. |
| [Heading link](https://github.com/vypdev/copilot/pull/951#discussion_r4625106081) | Refuted by the actual GitHub blob page at this head: the heading's `anchor`, `id` and permalink all contain `eligibility--916`. The proposed single hyphen comes from the repository's MDX documentation validator, a different rendering surface. Keep the [working GitHub link](https://github.com/vypdev/copilot/blob/ea55a971d102b12469ff01cead5bc4d449a14b24/specs/progress-capacity-diagnostics.md#21-acceptance-batch-profile-and-publication-eligibility--916). |
| [Git path Markdown](https://github.com/vypdev/copilot/pull/951#discussion_r4625106086) | Confirmed Markdown interpretation. The actual publication projection turns a valid filename into a link. Parse the final finding body with CommonMark and render both evidence and location with a delimiter longer than embedded backticks. The path/range text stays literal. The control demonstrates link injection; it does not separately claim a successful external phishing navigation for the reported URL spelling. |

There are **six adopted reports covering five corrections**, and **three
refutations**. Model-free reproductions initially failed five focused cases
and admitted nine invalid plan controls. Preserve those observations separately
from corrected results. Run the active shadow suite and the focused dispatcher,
workflow, publication-path, marker and approval-consumer tests. The stricter
plan checks also execute the real launcher/scorer using synthetic Git-backed
plans and ledgers; their negative results are not model measurements.

This follow-up makes no qualification calls, changes no runner placement,
merges nothing and activates no production mode. All seven frozen campaign
files and the Action-owned SDD remain unchanged. A future campaign requires a
new committed implementation/driver plan; the recorded negative EV-07 decision
is retained. The next normal hook, packaged checks and exact-head native review
must be reported separately.

The corrected follow-up passed **344/344 focused Jest cases in seven suites**
and **132/132 model-free shadow controls**. The latter includes twelve real
Git plan-admission fixtures, the actual full-review launcher and Python scorer.
Type checking, lint, workflow, specification and documentation validation all
passed. The archive check resolved **38 exact historical paths** and retained
all **27 issue rows**. The owning SDD and seven frozen campaign files still
match their publication commits byte for byte. These deterministic checks
make zero model calls and contact no evaluated PR.

The rebuilt Action at SHA-256
`6bb119a9fb03b7a096fe94d1518fb00f6f0a3ffd145da2747d0bc1b3383d4e38`
passed all **13 packaged status scenarios**, the rejected-mutation audit and
**six packaged rollback/approval scenarios**. The status provider is loopback
only; rollback cases record zero mutation attempts. Generated-bundle and npm
package validation passed. This identifies the executable tested locally;
the subsequent normal hook and exact-head CI are reported in the PR.
