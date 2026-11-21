# Approval receipt producer trust — #980

## Current-parent integration and exact-bundle replay

The Action merged exact parents6efac734+c7b7feb as d3062119 and resolved only the documentation/package conflicts. Its verification passes944 SDK suites/18,735 assertions (35 existing skips),385 extension files/5,291 tests and120 documentation pages/routes. The owning guarded-approval SDD and original driver remain byte-unchanged. Application source, scripts, workflows and four bundles match parentc7; the package command keeps every parent control in order and adds the one existing packaged group.

All14 packaged producer-trust scenarios pass again against the actual d306 Action bundleSHA5d98f78435883214fcdd2c8e35aef0a3fece3b8f35ef24a76de7c435819d697b; the complete raw ledger is [retained](current-parent-d306/packaged.jsonl) with [acceptance and exact hashes](current-parent-d306/acceptance.json). All four bundles reproduce byte for byte in a normal local build. Real GitHub writes, evaluated-pilot writes and qualification model calls remain0. Native final-SHA checks are pending. These controls do not establish independent producer attestation, install a default workflow or qualify/activate a model profile.

## Historical initial campaign

The existing packaged approval consumer passes **14 controlled cases** against
only a loopback fake GitHub service. This audit changes no production approval
code or policy. The application baseline is ccefb27627cd627ccdb7d5666fd174c2ac1da07b;
its exact Action bundle and this driver's SHA-256 are in attempt-4.jsonl and
summary.json. Node v24.20.0 / macOS arm64 is the executed environment; no other
OS, model profile or installed default workflow is claimed.

## Exact trust claim

Authenticated run/repository/SHA/App/artifact/check identities bind a receipt to
its declared native context. They do not independently attest the executable
producer, its actual checkout, or the truth of a fabricated clean result. The
fixture deliberately supplies a syntactically clean current receipt. The custom
Review check may be in a different suite, as the existing contract permits;
its exact ID is bound through the authoritative run artifact.

The guarded policy's fixed protected-path decision independently prevents
approval when build/**, the workflow or action.yml changes. All head readbacks
remain current, so the result does not depend on a later stale-head fence.
An operator-attested/configured producer is still a trust assumption. Before a
future enforced profile, maintainers must establish the exact reviewed workflow
and executable revision and an execution context whose producer trust is
acceptable independently of candidate-controlled artifact contents. This audit
supplies no new code attestation or externally enforced control. If that
prerequisite needs an architecture/policy change, review its SDD first.

The current qualification campaigns are still unsuccessful. These fabricated
receipts are not model measurements, independent model oracles or authority to
activate any profile. Actual production verification remains disabled.

## Executed matrix

| Cases | Observed result |
| --- | --- |
| Changed build bundle, source workflow, action.yml | recommend / protected-path; zero approval attempts in every case |
| Foreign receipt run, foreign SHA, foreign App | pending / bugbot-missing; zero approval attempts |
| Foreign artifact run | blocked / evidence-unavailable; zero approval attempts |
| Prior policy/generation, prior attempt | pending / bugbot-missing at the same head; zero approval attempts |
| Ordinary current authorized producer data | One fake approval, observed back at the exact head |
| Rollback with stale same-head receipt | pending / bugbot-missing; zero approval attempts |
| Rollback with fresh current disabled-mode receipt | One fake approval with current policy identity |
| Existing human approval / changes requested | recommend / human-approved, or blocked / changes-requested; no competing approval |

Every observed head remains fixed and every case publishes its assessment to
the fake service. Local fake assessment/approval POSTs are intentionally counted
in the ledger; they are not writes to a real evaluated PR. There are **zero real
GitHub write attempts, zero qualification model calls and no production-mode
change**. The authority stays disabled; a stale enforced receipt is only a
negative data fixture. No human decision or verified real review is modified.

The first attempt could not bind localhost inside the sandbox and executed no
case. Its start ledger and error are retained. After permitting only this local
test execution, all 14 cases passed. The reusable Node test wrapper also passed.
Three existing consumer/domain/use-case Jest suites pass **236 tests**, retaining
the same-SHA policy, latest-attempt and rollback controls. Those existing counts
are not added again to the 14 packaged scenarios.

Run:

```bash
node quality/bugbot/evidence/issue-980/packaged-trust.cjs build/github_action/index.js /absolute/new-attempt.jsonl
node --test quality/bugbot/evidence/issue-980/packaged-trust.test.cjs
```

Each attempt requires a new ledger path and records the package/driver/runtime
identity before cases. The existing shadow-verification script includes the
wrapper for CI. The old #950 rollback script and its historical artifacts remain
unchanged. This result preserves the refuted broad approval-exploit claim as
refuted; it documents the narrower producer-trust limitation.

The source diff check identified an extra blank line at the driver EOF. Its removal changes no case or decision. The exact final driver was rerun: all 14 cases pass in `attempt-3.jsonl`; the previous ledgers/logs and original driver remain in history. The initial mandatory hook passed all 943 suites / 18,695 tests, build and lint before this formatting correction.


## Assessment publication counter-control

Native review of 79396c2 correctly found that blocked evidence and failed
assessment publication both exit 1. The audit now independently asserts
`publication: published` for every case and exactly one received fake assessment
POST carrying the canonical marker. All fourteen cases pass again in attempt 4
with the final driver hash. The source approval implementation is unchanged.

The causal control makes only the local foreign-artifact-run assessment POST
return 403. An isolated audit copy with only the new publication assertions
removed falsely reports 14 passed while its recorded assessment is failed. The
corrected driver rejects those same inputs at that case and records no passing
finish. Both exact ledgers and raw compressed outputs are retained, together
with source hashes and a deterministic derivation recipe. That expected rejection
is not a new positive scenario or a model qualification measurement. Fake write
attempts remain counted; real GitHub/evaluated-PR writes and model calls stay zero.

All 141 shadow controls pass with the publication assertions. The earlier sandbox run passed 140 and could not bind loopback for the packaged wrapper (EPERM); its exact raw output is retained, followed by the permitted localhost-only full pass.
