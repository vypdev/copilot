# Approval receipt producer trust — #980

The existing packaged approval consumer passes **14 controlled cases** against
only a loopback fake GitHub service. This audit changes no production approval
code or policy. The application baseline is ccefb27627cd627ccdb7d5666fd174c2ac1da07b;
its exact Action bundle and this driver's SHA-256 are in attempt-2.jsonl and
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
