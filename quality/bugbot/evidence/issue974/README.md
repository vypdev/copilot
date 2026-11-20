# EV-07 v2 detector qualification — issue #974

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

The new budget is 25 distinct controls: eight Jest lifecycle/authority controls
(`ev974-C01`–`C08`) and seventeen Node qualification controls (`C09`–`C25`). They are
additional to the 216 retained Node controls; the complete Node command therefore
has 233 controls, while the eight lifecycle cases remain separately counted.
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
