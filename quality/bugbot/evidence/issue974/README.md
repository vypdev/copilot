# EV-07 v2 detector qualification — issue #974

Current preparation: implementation `e4bade2` is pushed and passes all 239 Node
controls without failures, skips or cancellations, plus its normal SDK hooks.
The corrected immutable SDK image and four new native-only plans are recorded
in [the current tuple](../issue-974/native-controls/e4bade2/README.md).
The first two native commands failed before namespace startup; the third starts
four namespaces but fails SDK fixture preparation. A local fixture basename and
private diagnostic correction is separately retained below; actual C32–C35
acceptance remains 0/4. Changed-module coverage and the complete
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
