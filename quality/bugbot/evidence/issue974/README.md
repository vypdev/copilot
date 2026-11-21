## Corpus component coverage correction

The unchanged corpus driver now has56 additional model-free C31 component
controls (28 collector and28 worker). Together with the two retained controls,
58 pass with exact-source AST coverage98.96% statements/99.13% lines/93.84%
branches/97.36% functions. This closes the corpus module gate only; the global
changed-driver gate remains unmet. The35 logical case IDs, scorer thresholds,
corpora, measurement plan, SDK runtime and four bundles are unchanged.
See [source and evidence](../issue-974/controls/corpus-transport-coverage/README.md).
Full shadow controls, normal hooks and current-head native findings remain
separate required checks. These fixtures do not establish actual model quality,
CLI confinement, native containment or qualification. Actual174/42 are still
unstarted; production remains disabled and pilot writes0.

# EV-07 v2 detector qualification — issue #974

## Corpus collector correction — component evidence

The corpus host now handles collector failures with the same abort-and-await
obligation as the paired-review collector. A real ledger-read EISDIR with modeled
containment originally returned without aborting its two siblings. The same test
now observes both aborts, waits for confirmed modeled stops and retains a failed
174-slot synthetic inventory; no later synthetic slot starts. Both C31 route
controls pass2/2. This is an additional arm of the existing C31 requirement, not
another native acceptance case or an actual corpus run.

[The retained counterfactual, harness error and corrected controls](../issue-974/controls/corpus-collector-correction/README.md)
include exact raw/source/test hashes. The selected owning SDD and all35 case IDs
are unchanged. Full changed-driver coverage, committed-source/native final-head
checks, actual CLI/read-scope/scientific gates and fresh source/runtime native4
remain required. Actual174/42 are unstarted, qualification calls0, no profile
qualified and production disabled.

## Historical compressed evidence remains losslessly archived

The [archive index](../issue-974/controls/historical-gzip-archive.json) pins every formerly added gzip text log to its exact reachable Git revision/blob, compressed-byte SHA256 and decoded UTF-8 SHA256. The original complete bytes remain in immutable Git history and in the owned local rollback; no commit/history is rewritten. Current delivery uses this reviewable index rather than newly changed binary archives, which the progress reviewer correctly refuses. Historical receipts keep their original observed paths and hashes; resolve those paths through this index.

Retrieve an entry with `git show <archiveRevision>:<path>` and verify its gzipSha256 before decoding. A summary does not replace the raw archive. No inherited/modified binary, product source, check, ignore rule, PR base or scientific criterion is changed by this archival step.

## Latest evidence: native attempt5 and transport components

All four actual SDK controls C32–C35 pass on source82f0c14, committed plans13e31eb and immutable image d2feb89ac2b0e9f383a26df0ce7c44e7c39f8aad11f4f8d3ed967ab262d1aa35. No partial results are pooled. The six owned scopes are all confirmed removed after their namespace-stop proofs. See [acceptance](../issue-974/controls/native5/acceptance.json) and retained raw text, ledgers and owner-loss/unrelated-scope proofs. All prior native negatives remain retained.

The session transport now has an additional repository provider-fault group; all63 semantic/component groups pass and exact-source AST coverage is100%for134statements/109branches/22functions/103lines. See [coverage evidence](../issue-974/controls/session-transport-coverage/README.md). This closes this measured component gate only. The full Node command registers240 controls: all240 pass without failure/skip/cancellation at both5e7faa0 and the exact-parent reconciliation b8782af. The new engine HTTP fault component is part of existing C27, preserving those240 logical groups; it uses an owned local Unix server with modeled bootstrap proof, not Docker/model execution. Its independent ported C27 run passes: statements98.82%, lines100%, branches93.08%, functions93.61%; see the [exact-source component evidence](../issue-974/controls/engine-transport-coverage/README.md).

Qualification remains incomplete: other changed-module/global coverage, final native PR checks/findings, actual CLI sandbox/input-scope checks and full42 scientific/causal-explanation/profile-comparison admission remain unmet. All174/42 model campaigns are unstarted; no profile is qualified, pilot write attempts0 and production disabled. The earlier progress check rejected newly changed gzip evidence as unsupported binary. The lossless historical archive index now retains all95 original gzip objects in reachable Git history. One sentinel bootstrap log also has a [lossless JSON representation](../issue-974/controls/text-evidence-representations.json), preserving its original content and blank line without weakening the Git whitespace check. Final native verification of this evidence delivery remains pending.

Historical preparation at `64da6ec` (superseded by the native attempt5 result above): implementation `64da6ec` is pushed and passes all 239 Node
controls without failures, skips or cancellations, plus its normal SDK hooks.
The corrected immutable SDK image and four new native-only plans are recorded
in [the current tuple](../issue-974/native-controls/64da6ec/README.md).
The first two native commands failed before namespace startup; the third starts
four namespaces but fails SDK fixture preparation. A local fixture basename and
private diagnostic correction is separately retained below; actual C32–C35
acceptance was 0/4 at that historical revision. Changed-module coverage and the complete
scientific/comparison gates remain unmet. All174/42 model measurements are
unstarted and production remains disabled.

**Implementation in progress; the corpus and paired full reviews are unstarted.**
No detector measurement or qualified profile is recorded here. Production
verification stays disabled and evaluated PR write attempts remain zero.

The Action published the qualification SDD at
[`f67b0d9`](https://github.com/vypdev/copilot/commit/f67b0d930578f961bb85bd23fc656468470239f6),
after the five prerequisite deliveries merged into `develop` at
`0ddac1011204db6dda45dff0f99e3ef91309c701`. Their native merge/lifecycle evidence
is linked in the existing [canonical index](https://github.com/vypdev/copilot/issues/950#issuecomment-7015916845).
That evidence is deterministic integration proof, not a new corpus result.

## Execution and phase boundaries

```text
Reviewed implementation + controls -> exact committed preregistration
  -> external immutable bootstrap -> 174 detector cases and all actual calls
  -> independent gates -> fail/incomplete: preserve evidence, leave 42 unstarted
                       -> pass: admit only the same frozen 14 × 3 protocol
```

The 174-case benchmark retains its existing remote-free synthetic Git workspace:
its prompt contains only the supplied synthetic diff/context, without evaluator
labels or oracles. Full review retains each real pinned subject checkout and the
ordinary detector's source access. Neither phase substitutes an empty brokered
verification workspace for the full-review detector.

Only an authenticated qualification composition invokes the internal ordinary
planner's cancellation-only findings lifecycle. The ordinary provider, capability,
canonical workspace, read-only sandbox, credentials and native/local schema
acceptance remain in use. Explicit abort terminates the complete process tree;
there is no research deadline, turn/read cap or token budget. Normal consumer,
immutable SDD source, version/ACL and output-integrity limits keep their scope.
The in-process admission is not a security boundary against trusted code already
executing in that process; public settings and serialized receipts cannot grant it.

[`plan.json`](./plan.json) is currently an explicitly invalid placeholder, not a
preregistration. Replace it only after the exact implementation and entire driver
closure are committed and reviewed. Freeze actual Node/Git/compiler/dependency,
CLI/interpreter/launcher identities and bytes; prompt/schema generators; v2 path
and hash; all 174 IDs/order/labels; concurrency and the no-outer-retry policy.
Use the detector `codex/openai/gpt-6-luna/xhigh` and paired verifier
`codex/openai/gpt-6.1-sol/xhigh`, without substitution.

Launch only through the external reviewed bootstrap using the procedure in
[`issue-970/README.md`](../issue-970/README.md), supplying the independently
reviewed plan commit/path/SHA-256 and bootstrap SHA-256. The admitted corpus
destination is the new campaign's `corpus-v3` directory; the full-review launcher
accepts that campaign root. Do not reuse an existing output directory. Actual
commands/pins will be recorded with the final preregistration, before model calls.
No invocation in this preparation packet authorizes bypassing admission.

## Attempts, privacy and failures

The v2 collector synchronously persists each application-call start and private
delivered prompt/schema before `AgentCliClient.execute`. It preserves the ordinary
observer facts and admitted runtime/argv/schema proof, the actual response or
bounded failure, and explicit interruption. Actual generated-literal follow-ups
receive separate attempt IDs; they are not additional outer cases. All 174
unstarted slots are recorded before dispatch. A durable start without a terminal
record remains incomplete after a crash. No automatic campaign retry is added.

Private attempt artifacts use owner-only files in an owner-only directory. They
contain synthetic prompts/model responses for the corpus and source-bound prompts
for full reviews; inspect them locally. Public summaries show hashes, counts,
outcomes and bounded failure categories, excluding credentials, raw stderr and
unrestricted output. Existing observer events are not expanded with private data.

Configured and resolved identities are separate from provider-reported identity.
The ordinary CLI observer exposes no provider-reported model/usage channel here;
those fields stay `null` (unknown), without inferring them from argv or headers.
Unknown, large or cumulative usage never changes admission or scoring. Preparation
and an `admitted` observer event alone do not prove that a child spawned.

Complete admission checks one unique start/preparation/observer/terminal chain for
every listed call, matching prompt/schema/response artifacts, exact profile/runtime
and all outer cases. It independently recomputes the corpus score from retained
predictions. These records rely on the reviewed bootstrap/runner as producer;
artifact identity is not independent attestation against a malicious producer.
Missing, duplicate, orphan, interrupted or failed call records block phase 42.
Preserve first failures and negative outcomes; a repeat requires a causal correction
and a new committed preregistration, not a search for a passing result.

## Validation and current evidence

The retained initial budget is 25 distinct controls: eight Jest lifecycle/authority controls
(`ev974-C01`–`C08`) and seventeen Node qualification controls (`C09`–`C25`). They are
additional to the 216 retained Node controls; the complete Node command therefore
had 233 controls, while the eight lifecycle cases remain separately counted.
The containment appendix adds six Node and four actual native controls. The
current complete deterministic Node floor is 239 and the issue-specific floor
is 35. The native command remains separate from that deterministic count.
No deterministic fake result constitutes a measured corpus/profile result.

The [precommit validation receipt](./controls/precommit-validation.json) retains
14 executed Node controls, eight new lifecycle controls, the broader 119-assertion
runtime checks and scoped coverage. Its logs preserve the reproduced surviving
POSIX descendant, the corrected cancellation, an initially invalid mock response
and an incomplete global-coverage command. These failures are not relabeled as
passes. The [ordinary source commit](./controls/source-commit.json) passed build,944 Jest
suites/18,703 assertions (35 existing skips) and lint. The [two committed-source
admission controls](./controls/committed-admission-focused.json) also pass using
explicitly synthetic evidence. The generated bundle/evidence follow-up and clean committed-source correction
passed [233/233 Node controls](./controls/233-committed-controls.json), without
failures, skips or cancellations. Final native checks remain separate.

Run `pnpm exec jest` for the runtime tests and
`pnpm run test:bugbot-shadow-verification` for the complete committed-source Node
controls. The latter intentionally requires a clean committed implementation.
Run the repository's build/type, lint, specification/catalog and documentation
gates, then check the final SHA's native checks and valid review findings. Register
catalog changes with `pnpm run generate:specifications` and check them with
`pnpm run validate:specifications`; declarations are not execution evidence.

[`results.json`](./results.json) explicitly records the unstarted measurement.
Retained test receipts will distinguish failed checks, corrected fixture errors,
scoped coverage evidence, full native validation and later actual measurements.
The fixed thresholds remain precision 90%, recall 85%, F1 87%, exact location,
severity and category 80% each, and Brier at most 0.16. A detector pass alone does
not qualify a verifier profile or activate anything.

## Loader integration correction after initial publication

The initial `5241685` delivery passed 232 local Node controls and both 944-suite
commit hooks. Native Static rejected trailing spaces in two preserved coverage
logs; their exact original bytes are now retained in deterministic gzip with raw
digests, preserving the strict whitespace check. The [native failure receipt](./controls/5241685-native-static-failure.json) retains that negative result.

A new model-free public-bootstrap control C25 then reproduced rejection of the
v2 helpers by the historical module fence. The corrected fence admits only the
two helper files whose hashes match the authenticated committed v2 plan and
rejects unregistered neighbors and dependency shadows. The original 24 controls
remain unchanged in identity; C25 is an additional necessary integration case.
The complete corrected Node command has 233 controls. The clean committed-source replay passed 233/233 at `38f4c04`. Native Static
passed; native progress then rejected compressed logs outside its recognized
`issue-<number>` generated-evidence namespace. Their exact bytes now live under
[`issue-974/controls`](../issue-974/controls/), with updated relative receipt links
and [lossless move proof](./controls/evidence-transport-correction.json). The
canonical plan and source-driver paths remain here. No policy is weakened.
Final native checks for this evidence transport correction remain pending. No model
measurement, profile qualification or production activation is inferred.

## Reproduced cancellation limitation — not admitted for measurement

The [current review finding](https://github.com/vypdev/copilot/pull/997#discussion_r4646554738)
is reproduced on the committed `38f4c04` source using two native macOS fixtures.
A child that creates a new session survives the owned-group cancellation. With
ignored stdio the lifecycle settles while that child survives; with inherited
pipes the lifecycle remains pending after its leader exits. The fixture-owned
processes were explicitly killed and verified absent.

[Reproduction facts and exact fixture source](./controls/escaped-session-reproduction.json)
retain both negative arms and the earlier fixture-only exit-observation error.
This is an unresolved lifecycle limitation, not a passing control or evidence
for another operating system. The prior 233 passing controls do not cover this
case. Keep the 174-case campaign and all 42 reviews unstarted until this
cancellation requirement has an adequate implemented and verified boundary.

## Whole-operation containment implementation

The Action published the containment appendix as
[`8d443500`](https://github.com/vypdev/copilot/commit/8d44350032e416f35f37abc9417587fa9469a5f2).
Its selected receipt and exact retained-owner proof are linked from the existing
[published SDD card](https://github.com/vypdev/copilot/issues/974#issuecomment-7052572620).
The old owning document remains an exact prefix; the appendix adds six Node
cases (`C26`–`C31`) and four actual native SDK cases (`C32`–`C35`). The six new
Node cases pass on committed implementation `1f20e9`; the four native cases remain unexecuted.
The combined Node floor is
239, and the complete campaign-specific floor is 35 including the retained 25.

The implementation adds semantic operation ownership/stop ports,
a pure identity/complete-ledger policy and a process-local plan/signal binding.
Their component controls cover copied/foreign authority, missing or orphaned
terminals, stopped-namespace correlation, interrupted quiet work, unknown stop
state and completion/cancellation races. Synthetic port confirmations prove
these decisions; they do not prove a real namespace stopped.

The engine adapter, PID1 supervisor and runtime-image recipe are connected in
source to the authenticated public bootstrap and ordinary executor. This source
is committed and pushed, with native acceptance still pending. They are not supported standalone
entrypoints. The recipe requires a sanitized,
credential-free implementation checkout and explicit immutable base-image and
CLI version selection. The immutable SDK image and actual byte/version observations
are retained in [native preparation](../issue-974/native-controls/1f20e9/README.md);
the four actual native SDK controls have not yet run.
The existing unrelated-image mechanism prototypes remain separate evidence.

The selected runtime uses one dedicated Linux PID namespace per complete outer
case or paired review. Only the immutable outer bootstrap owns the fixed
non-TTY stdin lifetime; EOF or owner death ends PID1. The worker has a separate
unprivileged identity and private fork IPC. Model stdout, environment values and
serialized receipts cannot grant that capability. Configuration fixes the two
owned input/output mounts, denies engine/socket mounts and host PID/privileged
mode, and preserves the ordinary model's sandbox and credential policy.

Normal completion also needs stopped-scope confirmation before outer cleanup or
accepted results. A finished provider response alone cannot settle an operation
while its scope is pending. Engine requests, active execution and waits have no
research deadline or heartbeat. A technical KILL escalation is scheduled only
after an actual stop request. Unknown create/start/stop effects stay incomplete;
there is no automatic adoption, replay or cleanup of an unrelated scope.

The immutable image/configuration, host and worker runtime, source/driver/CLI
bytes and full 42-review closure must still be authenticated and frozen before
measurement. Component checks do not resolve the cancellation finding, satisfy
native SDK acceptance, preregister a campaign or qualify any model profile.

### Native preparation and actual-call evidence

Commit implementation X before building a sanitized, credential-free SDK
checkout with its own Git objects. Supply the immutable Node base digest and
exact Codex version. Record the actual image/configuration, host/worker
Node/Git/compiler/dependencies and CLI/interpreter/native executable bytes. An
image tag or successful build is not admission. Independently materialize and
review the external bootstrap and native harness before executing them.

The image recipe also requires `QUALIFICATION_WORKER_UID` and
`QUALIFICATION_WORKER_GID`, the same positive IDs in the closed containment
profile. SDK/Git ownership is assigned to that worker during the build and
checked before its clone. [Git refuses local clones across repository owners](https://git-scm.com/docs/git-clone#Documentation/git-clone.txt---local);
this avoids changing global Git trust or giving the model additional privileges.
Early private worker errors are retained as `worker-failure.json` before owned
container cleanup. That diagnostic is never admission or stop proof.

Commit four otherwise identical `purpose=native-control` plans selecting C32,
C33, C34 and C35. Their closed `nativeControl` object contains `schemaVersion=1`,
the exact four-case inventory, one `selectedCase`, `fixtureCliSha256` and
`harnessSha256`. A private JSON array lists the four records in that order. Each
record contains exactly `caseId`, `repository`, `revision`, `planPath`,
`planSha256`, `bootstrapPath` and `bootstrapSha256`. The public bootstrap checks
these committed references; they are not scope grants. Native purpose cannot
authorize corpus/review calls and receives no model or GitHub credential. The
actual installed CLI byte/version probe remains separate from the frozen
model-free subprocess exercised through the ordinary SDK planner/executor.

```sh
COPILOT_NATIVE_CONTROL_PLANS=/absolute/private/native-controls.json \
  pnpm run test:bugbot-native-containment
```

Absent plans/Engine capability fail this explicit command without skipping. Its
readiness/test bounds apply only to fixed, credential-free subprocess fixtures;
corpus/review calls never enter that path. C34 kills the actual outer bootstrap
and retains the missing terminal. C35 observes another independently owned
sentinel still running before explicitly stopping that sentinel. Cleanup after
a test failure is labeled `acceptanceEvidence=false`. Preserve raw logs,
known/unknown IDs, stop observations and incomplete prefixes.

Every real verifier call is recorded before transport, including context
restarts and follow-ups, with delivered/returned artifacts, physical runtime
proof, actual flags and provider-reported facts. The Python scorer checks these
records, the host scheduler and stopped-scope sidecars. It does not manufacture
SDK observer events for the separate verifier transport. Collection failure
aborts siblings and settles all dispatched operations before returning failure.

Current local checks: C26–C31 (6/6), retained scorer controls (11/11), SDK/verifier
controls (32 tests), and live scope/pure policy coverage (127 statements,
107 branches, 29 functions, 100 lines; 100% each). The complete committed-source
Node command at `1f20e9` passes all 239 controls, with zero failures, skips or
cancellations. The SDK image is built and its source/runtime/CLI bytes and
versions observed. Changed-module coverage, four actual native controls and final
native PR checks remain pending. No actual model call, measurement preregistration
or qualified profile is claimed by this preparation.

Implementation preparation [`63628bb2`](https://github.com/vypdev/copilot/commit/63628bb2ea01b2d9aafb589e3b1245dae54d4778)
passed its normal build, 944 SDK suites/18,716 tests (35 existing skips) and lint
locally; it was subsequently pushed as an ancestor of `1f20e9`. Its first complete committed-source Node run retained
236/239 passing, three compatibility failures and zero skips/cancellations.
The failed controls assumed the former verifier source layout or earlier denial
wording. The corrected three controls pass while preserving byte/import and
arbitrary-IPC-parent rejection. A new C30 negative also reproduced acceptance of
empty copied runtime projections; the scorer now requires the complete observed
runtime fields, source identity and bootstrap correlation. Six deterministic
controls pass after that correction. The later committed-source 239 run at
`1f20e9` passes in full; actual native SDK acceptance remains unexecuted.

The later-plan transport also has an actual local Git regression: a bundle
created with a raw commit alone exits 128 (`Refusing to create empty bundle`).
The corrected helper validates that HEAD is exactly reviewed Y, confirms X is
its ancestor, then advertises HEAD and excludes implementation X's objects.
C27 fetches that delta by exact Y SHA into a separate repository containing only
X, verifies its plan bytes, and rejects a moved HEAD or occupied output. This
is model-free Git protocol evidence, not an SDK image or kernel observation.

The first explicit four-test native command at plan revision `3d53cdb` failed
all four controls at host dependency byte admission, before probes or SDK scope
creation. The intervening normal hook changed the development dependency tree.
The [retained negative and frozen-host correction](../issue-974/native-controls/1f20e9-frozen-host/README.md)
separate that refusal from actual SDK cancellation acceptance. The corrected
plans use a complete physical dependency copy in a separate owned qualification
checkout; development hooks do not run there. They retain the same image,
worker tuple, drivers and strict byte checks. No model call has occurred.

The current owning SDD is restored to the exact Action-published `8d443500`
bytes. Implementation status and additional path evidence live in these
receipts; changing those notes inside the selected publication caused the real
Commit validation failure. No approved requirement or numerical gate changed.

The second explicit native command at `25c41a9` passes host byte admission but
fails all four tests before scope startup: Docker omits `ReadOnly: false` from
the configured writable output mount. An exact, unstarted Engine probe retained
that difference and the effective `RW` values of both mounts. The adapter now
normalizes only that omitted false boolean, rejects other changed configured
fields and checks effective source/destination/access/propagation with no extra
or duplicate mounts. C27 accepts the actual observation and rejects changed
permissions, missing input read-only, invalid booleans and foreign mounts.
[Evidence and cleanup](../issue-974/controls/native-engine-mount-admission-correction.json)
retain four created, never-started scopes confirmed removed by exact ID. These
are failed admission attempts, not successful SDK cancellation controls. The
correction needs a new committed implementation/image and new native-only plans
before another actual command. Qualification model calls remain zero.

The third command at `b79c13f` starts all four namespaces and reaches the native
worker, but each exits1 before any fixture leader/descendant readiness. All four
namespaces are confirmed stopped and removed. The fixture used `fixture-codex`,
which the actual unchanged SDK executable-selection policy necessarily rejects;
an independent policy control reproduces that rejection and accepts the corrected
`codex` basename. The exact original worker exception was not retained, so that
control does not invent an exclusive stack trace. The fixture now preserves a
private SDK error before teardown. Four semantic diagnostic variants preserve
the original error and deny unsafe diagnostic targets/write replacement.
[Retained third result and correction](../issue-974/controls/native3-sdk-preflight-correction.json)
remain separate from actual cancellation acceptance, still0/4. A separate owned
metadata process also confirms the effective mount check while running; this
does not substitute for the actual SDK controls. Another source/image/plan tuple
is required before the next native command. All174/42 model calls remain unstarted.

The fourth actual command at `df77928` passes C32 and C33 through the real SDK:
quiet ignored-stdio work and inherited-pipe double-fork work both cancel with
confirmed namespace stop before cleanup. C34 fails fixture readiness because its
CLI leader stays alive while it waits for the directly parented descendant's
parent to become1. The saved SDK diagnostic and process states show that relation.
C35 cannot prepare its C34 sentinel; an explicitly recorded SIGTERM stops only
that positively identified owned bootstrap after the same defect is reproduced.
All four known namespaces are confirmed stopped and removed. The result remains
2PASS/2FAIL, not full native acceptance. The corrected C34 now uses a short-lived
intermediary so reparenting can occur while the CLI leader stays alive, retaining
every readiness and ownership assertion. [Raw partial result and topology correction](../issue-974/controls/native4-partial-sdk-topology-correction.json)
require another committed source/image/plan tuple and fresh actual command.


The complete deterministic `pnpm run test:bugbot-shadow-verification` command
passes298 controls with zero failure, skip or cancellation (325.546seconds).
It includes the56 new C31 component controls and the prior242 controls, using
actual owned local Unix sockets where required. See the full retained log and
hash in `corpus-transport-coverage/source-and-controls.json`. Catalog generation,
specification validation and Graphify pass. Normal hooks and fresh final-head
native checks are still required. No actual native SDK or model campaign
acceptance is inferred from this deterministic command.


Generated bulk coverage and hook reports are retained losslessly using the existing .log.gz contract after native progress hit call-budget before its seven assessment batches. Original paths/hashes/Git blobs are mapped in `../issue-974/controls/generated-report-archive.json`. No runtime, selected SDD, limit or test changes. Parent fb1 native CI4/4 passes; fresh final progress remains required. Actual174/42 unstarted, profileNONE, pilotwrites0, productiondisabled.


Launcher and attempt-ledger components add32+13 semantic controls without changing runtime/SDK/corpora/plan,35 logical IDs or the selected SDD. The55 selected controls pass; unchanged launcher measures99.15stmt/98.94line/95.91branch/100func and attempt-ledger100%all metrics. Full deterministic command343PASS,0failure/skip/cancellation. See `../issue-974/controls/launcher-attempt-coverage/README.md` and its exact-source/actual-run receipts. Historical and optional metadata exercise modeled admission seams, not current native admission. Global driver coverage, actual readonly CLI/readscope/final native tuple and174/42 remain pending; no profile qualified, pilotwrites0, productiondisabled.

Implementation/full-review follow-up adds65 semantic controls (41+24), with408/408 complete deterministicPASS and69 selected/ASTPASS. Two real journal-error cleanup defects are fixed: cancellation listeners and opened slot logs are released even when writes fail. Exact-source module gates pass100/100/92.92/100 and100/100/93.61/100; global changed-driver/native/scientific gates remain unmet. See [`implementation/full-review evidence`](../issue-974/controls/implementation-full-review-coverage/README.md), including all negatives, explicit socket-permission correction and host-path redaction/original-hash receipts. The core SDK/bundles, corpora, measurement plan,35logicalIDs and selected SDD are unchanged; full-review driver bytes intentionally changed and need fresh actual-tuple admission/preregistration.

Review-driver follow-up adds27 semantic controls and12 actual-process coverage-exit controls. The full deterministic shadow command passes447/447, without native SDK/model admission. Review component AST reaches98.42%statements/100%lines/95.23%branches/95%functions; its95/90 module gate passes. Five older AST drivers now exit nonzero for false module gates, preserving previous nonzero exits. The global driver gate and actual174/42 remain unmet/unstarted; see [evidence](../issue-974/controls/review-driver-coverage/source-and-controls.json).

Stop-record follow-up fixes a reproduced termination failure: a failed journal intent can no longer prevent ending the owned lifetime and confirming its stopped state. The first journal error still rejects, without completed/durable-proof fabrication. Actual2PASS10FAIL becomes12PASS; the complete459-command and selected13 AST controls pass, with engine module98.85%statements/100%lines/93.25%branches/93.61%functions. These are Unix HTTP/private-file component proofs with modeled Engine/admission/timers, not native or model admission. See [source and controls](../issue-974/controls/stop-record-coverage/source-and-controls.json). Global drivers, other valid findings and actual174/42 remain unmet/unstarted.
