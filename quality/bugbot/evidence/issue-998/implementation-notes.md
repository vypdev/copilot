# Publisher implementation evidence (#998)

This is an as-built source/evidence map, not a replacement for the selected SDD.
The Action-published contract remains byte-identical to its first publication:
[`specs/setup-bugbot-publisher-manifest-route.md`](../../../../specs/setup-bugbot-publisher-manifest-route.md)
at `d9f03bcf11c8680ee1a726abc758937b50d34ce8`, SHA-256
`6ae57e9efd70d8550efcc9da9d0a043be1765eabe94290a99190278c5bb0bf18`.
Its original review-status wording and planned filenames describe that immutable
publication. Current implementation and acceptance status are reported here,
in the evidence README and in the linked source PR.

The previous as-built rendering is preserved in Git at source `e2ff500a26b01f29bf64530af2de823f0db8770c`.
Restoring the selected document retains all eight goal rows, all64 acceptance
case rows, their exact assertions/requirement mappings and the test budgets.
No runtime behavior, coverage requirement or acceptance condition is narrowed.

The concrete shared delivery coordinator is constructed only in the named batch
and publisher composition roots. Apply use cases require its semantic port;
application code has no default concrete coordinator construction. The unchanged
global architecture guard and the mapped composition/integration controls verify
that refinement of the selected Clean Architecture contract.

The current file map and executable acceptance registration follow.

Round17 acceptance had114 logical IDs /110 mapped Jest cases plus the
same four extracted-package cases. Source executable entrypoints are bound to
the hashed bundle; unrelated YAML-named directories are ignored without accepting
fixed-target collisions or symlinks. C03/C102 tests now directly observe their
full retained claims, and C114 requires the existing base-drift evidence. Earlier
rounds and their inventory/results below are historical snapshots. Current
normal/native acceptance remains pending until executed on the final head.

Historical Round9 acceptance was95 logical IDs:91mapped Jest cases and the same four
package cases. C95 binds eight real batch-use-case/private-v1-journal/Git-adapter
scenarios to cancellation during successful adapter freshness or Git-proof reads.
Both interactive compositions carry current session activity to a synchronous
transport-write fence. The same causal tests change66PASS/8FAIL to74PASS; the
27-file cohort passes1,237assertions. All94previous complete ledger objects and
the immutable selected companion remain unchanged. Prior90/91/93/94 floors below
are historical snapshots. See [Round9](./review-round9/README.md) for full boundaries,
retained negatives and pending normal/native acceptance.

Document the supported route/defaults/preview, relevant credentials, drift, uncertain effects, purpose-bound resume, legacy compatibility, source/default/native distinctions and rollback. Update existing CLI help, how-to-use/configuration, provisioning/troubleshooting, Bugbot failure guidance and issue977 evidence. Register actual code/test/docs only as implemented; regenerate and validate the catalog. Keep existing routes and validate links/content/locale fixtures.

The original selected design and planned filenames remain in the official first-SDD commit cited above. The implementation refines that design into the actual paths below; catalog registration is source evidence, not final test, installation or native acceptance.

| Actual path | Responsibility |
|---|---|
| `src/application/contracts/setup_installation_delivery.ts` | Actual source implementation or semantic contract |
| `src/application/policies/__tests__/fixtures/setup_publisher_fixture.ts` | Controlled fixture support |
| `src/application/policies/__tests__/repository_agent_guidance_policy.test.ts` | Executable boundary/regression evidence |
| `src/application/policies/__tests__/setup_publisher_installation.test.ts` | Executable boundary/regression evidence |
| `src/application/policies/__tests__/setup_publisher_message_catalog.test.ts` | Executable boundary/regression evidence |
| `src/application/policies/__tests__/setup_publisher_plan_policy.test.ts` | Executable boundary/regression evidence |
| `src/application/policies/repository_agent_guidance_policy.ts` | Actual source implementation or semantic contract |
| `src/application/policies/setup_installation_receipt_policy.ts` | Actual source implementation or semantic contract |
| `src/application/policies/setup_installation_tree_policy.ts` | Actual source implementation or semantic contract |
| `src/application/policies/setup_publisher_installation_policy.ts` | Actual source implementation or semantic contract |
| `src/application/policies/setup_publisher_message_catalog.ts` | Actual source implementation or semantic contract |
| `src/application/policies/setup_publisher_plan_policy.ts` | Actual source implementation or semantic contract |
| `src/application/policies/setup_token_value_policy.ts` | Actual source implementation or semantic contract |
| `src/application/ports/setup_batch_ports.ts` | Actual source implementation or semantic contract |
| `src/application/ports/setup_installation_delivery_ports.ts` | Actual source implementation or semantic contract |
| `src/application/ports/setup_publisher_apply_ports.ts` | Actual source implementation or semantic contract |
| `src/application/ports/setup_publisher_review_ports.ts` | Actual source implementation or semantic contract |
| `src/application/usecases/setup/__tests__/apply_setup_batch_use_case.test.ts` | Executable boundary/regression evidence |
| `src/application/usecases/setup/__tests__/apply_setup_publisher_use_case.test.ts` | Executable boundary/regression evidence |
| `src/application/usecases/setup/__tests__/install_setup_publisher_use_case.test.ts` | Executable boundary/regression evidence |
| `src/application/usecases/setup/__tests__/review_setup_publisher_use_case.test.ts` | Executable boundary/regression evidence |
| `src/application/usecases/setup/__tests__/setup_batch_flow.test.ts` | Executable boundary/regression evidence |
| `src/application/usecases/setup/__tests__/setup_publisher_installation.test.ts` | Executable boundary/regression evidence |
| `src/application/usecases/setup/apply_setup_batch_use_case.ts` | Actual source implementation or semantic contract |
| `src/application/usecases/setup/apply_setup_publisher_use_case.ts` | Actual source implementation or semantic contract |
| `src/application/usecases/setup/deliver_setup_installation_use_case.ts` | Actual source implementation or semantic contract |
| `src/application/usecases/setup/install_setup_publisher_use_case.ts` | Actual source implementation or semantic contract |
| `src/application/usecases/setup/review_setup_publisher_use_case.ts` | Actual source implementation or semantic contract |
| `src/architecture/__tests__/setup_doctor_boundaries.test.ts` | Executable boundary/regression evidence |
| `src/cli/__tests__/setup_batch_adapter.test.ts` | Executable boundary/regression evidence |
| `src/cli/__tests__/setup_publisher_command_routing.test.ts` | Executable boundary/regression evidence |
| `src/cli/__tests__/setup_publisher_installation_adapter.test.ts` | Executable boundary/regression evidence |
| `src/cli/__tests__/setup_publisher_installation_presenter.test.ts` | Executable boundary/regression evidence |
| `src/cli/__tests__/setup_publisher_proposal_file.test.ts` | Executable boundary/regression evidence |
| `src/cli/cli_program.ts` | Actual source implementation or semantic contract |
| `src/cli/commands/setup.ts` | Actual source implementation or semantic contract |
| `src/cli/commands/setup_execution.ts` | Actual source implementation or semantic contract |
| `src/cli/setup_batch_adapter.ts` | Actual source implementation or semantic contract |
| `src/cli/setup_publisher_installation_adapter.ts` | Actual source implementation or semantic contract |
| `src/cli/setup_publisher_installation_presenter.ts` | Actual source implementation or semantic contract |
| `src/cli/setup_publisher_proposal_file.ts` | Actual source implementation or semantic contract |
| `src/domain/setup_publisher_installation.ts` | Actual source implementation or semantic contract |
| `src/infrastructure/__tests__/fixtures/setup_installation_tree_fixture.ts` | Controlled fixture support |
| `src/infrastructure/__tests__/fixtures/setup_publisher_github_fixture.ts` | Controlled fixture support |
| `src/infrastructure/__tests__/fixtures/setup_publisher_github_source_fixture.ts` | Controlled fixture support |
| `src/infrastructure/__tests__/setup_batch_github_apply_adapter.test.ts` | Executable boundary/regression evidence |
| `src/infrastructure/__tests__/setup_batch_github_read_adapter.test.ts` | Executable boundary/regression evidence |
| `src/infrastructure/__tests__/setup_publisher_application.test.ts` | Executable boundary/regression evidence |
| `src/infrastructure/__tests__/setup_publisher_composition.test.ts` | Executable boundary/regression evidence |
| `src/infrastructure/__tests__/setup_publisher_credentials.test.ts` | Executable boundary/regression evidence |
| `src/infrastructure/__tests__/setup_publisher_git_reader.test.ts` | Executable boundary/regression evidence |
| `src/infrastructure/__tests__/setup_publisher_github_read_adapter.test.ts` | Executable boundary/regression evidence |
| `src/infrastructure/__tests__/setup_publisher_github_source_adapter.test.ts` | Executable boundary/regression evidence |
| `src/infrastructure/__tests__/setup_publisher_identity_transport.test.ts` | Executable boundary/regression evidence |
| `src/infrastructure/__tests__/setup_publisher_installation.test.ts` | Executable boundary/regression evidence |
| `src/infrastructure/__tests__/setup_publisher_workflow_inventory.test.ts` | Executable boundary/regression evidence |
| `src/infrastructure/composition/setup_batch_composition_root.ts` | Actual source implementation or semantic contract |
| `src/infrastructure/composition/setup_publisher_installation_composition_root.ts` | Actual source implementation or semantic contract |
| `src/infrastructure/github/ports/github_setup_batch_protocol.ts` | Actual source implementation or semantic contract |
| `src/infrastructure/setup_batch_github_apply_adapter.ts` | Actual source implementation or semantic contract |
| `src/infrastructure/setup_batch_github_read_adapter.ts` | Actual source implementation or semantic contract |
| `src/infrastructure/setup_batch_journal_adapter.ts` | Actual source implementation or semantic contract |
| `src/infrastructure/setup_installation_github_delivery_adapter.ts` | Actual source implementation or semantic contract |
| `src/infrastructure/setup_operation_journal_store.ts` | Actual source implementation or semantic contract |
| `src/infrastructure/setup_publisher_credentials.ts` | Actual source implementation or semantic contract |
| `src/infrastructure/setup_publisher_git_reader.ts` | Actual source implementation or semantic contract |
| `src/infrastructure/setup_publisher_github_read_adapter.ts` | Actual source implementation or semantic contract |
| `src/infrastructure/setup_publisher_github_source_adapter.ts` | Actual source implementation or semantic contract |
| `src/infrastructure/setup_publisher_journal_adapter.ts` | Actual source implementation or semantic contract |
| `src/infrastructure/setup_publisher_workflow_inventory.ts` | Actual source implementation or semantic contract |
| `src/utils/__tests__/setup_files.test.ts` | Executable boundary/regression evidence |
| `src/utils/repository_agent_guidance.ts` | Actual source implementation or semantic contract |
| `src/utils/setup_files.ts` | Actual source implementation or semantic contract |

The read/review/apply entry is split across `review_setup_publisher_use_case.ts`, `apply_setup_publisher_use_case.ts` and `install_setup_publisher_use_case.ts`; there is no second installer. Existing Commander option provenance is sufficient, so `setup_command_options.ts` needs no new representation. Tests are separated by actual boundary rather than one aggregate CLI file.

Also update the seven coordinated owning SDDs, `scripts/coverage-budgets.json`, `specs/catalog.json`, generated `specs/CATALOG.md`, `src/architecture/__tests__/setup_doctor_boundaries.test.ts` and actual packed-entrypoint controls. User documentation is `docs/how-to-use.mdx`, `docs/configuration.mdx`, `docs/single-actions/workflow-and-cli.mdx`, `docs/security-operations/operations/provisioning.mdx`, `docs/security-operations/operations/troubleshooting.mdx`, `docs/bugbot/failure-scenarios.mdx` and `docs/development/architecture.mdx`.

The executable map is `specs/setup-publisher-installation-acceptance.json`. `pnpm run validate:setup-publisher-acceptance` checks registration; `node scripts/validate-setup-publisher-acceptance.cjs coverage/setup-acceptance-jest.json` requires the named assertions from an actual run. C55–C58 additionally run the extracted npm tarball through `pnpm run smoke:npm-package`; C59 is architecture/composition and C60 is actual shared-store cross-route integration. The standard coverage and package gates execute these checks.

The fixed 64-case IDs and distribution in section14 remain the acceptance contract. Component counts supplement the named map. Incomplete-catalog fallback, source/default drift, unknown POST outcomes, full PR pagination, real shared-journal cross-purpose recovery and ordinary Commander defaults have explicit regression controls. Retain counterfactual failures and distinguish focused passes from the final full SDK/module/changed-path and native source checks. None establishes default installation or canary acceptance.

The operational #977 evidence packet is maintained on its own retained branch after actual source integration; it is not an existing file at this immutable source-feature base. Its prepared source is [the historical review packet](https://github.com/vypdev/copilot/blob/c7d6d6a2eb0db6d02376df8348707e5795a36999/quality/bugbot/evidence/issue-977/README.md). This link is history, not installation authority.

## Local batch recovery review corrections

Two review findings were reproduced against the published runtime using the real
closed-v1 disk journal, the common delivery coordinator and the GitHub adapters.
Seven of nine new controls failed before correction; the two unknown-object POST
controls already passed. After correction all nine pass. The final expanded
cohort passes 177 assertions in four suites; its isolated coverage command still
exits 1 because unrelated global owners are not run. All three changed runtime
modules are 100% in statements, lines, branches and functions in that report.

Batch preparation now forwards the semantic object observer. Confirmed no-POST
failures retain the existing `preflight` reason, while unknown tree/commit
creation without an ID remains uncertain, including after cancellation. A known
commit is retained before subsequent proof reads. A fresh reviewed batch Apply
explicitly permits inspect-first creation of a confirmed absent ref/PR; common
delivery otherwise defaults to inspect-only recovery. The publisher's completed
operation remains read-only. The v1 parser/fields and publisher v2 shape are
unchanged. The selected companion SDD is byte-identical to its official seed.

These measurements were captured before publication. They are not final native
acceptance, resolution of the review threads, installation, or qualification.
The later corrections below and final new-head checks still apply.

## Cancellation, C02 mapping and transport review

The cancellation cohort reproduces13 failures with131 passes before correction,
then144 passes afterward. Hidden token/approval cancellation and cancelled Apply
errors now return130; explicit decline remains successful. Cancellation during
post-approval or initial Apply freshness reads is reported as cancellation,
including a rejected read after interruption. Active-session credential/fact
mismatches still report stale and the approval callback remains revocable.

C02 now maps to four dedicated URL/contradictory ID/name/default assertions,
rather than reusing the C21 inspected-coordinate drift assertion. Its complete
planning suite passes95 tests. The C01–C64 IDs, scenario text, requirements and
distribution are unchanged; a fresh complete execution map is still required.

Four real child-process transport controls do not reproduce the claimed Undici
bypass. Captured native fetch deliberately bypasses the global-fetch replacement;
the actual Octokit dependency's Undici fetch is tested separately. Each unguarded
positive control makes one connection/request to an ephemeral loopback server.
With the unchanged guard loaded, each request reaches the observational Undici
diagnostic and is rejected at `Socket.prototype.connect`: zero server connections
and zero HTTP requests. Diagnostics remain observational and never throw. This
tests the existing pre-dispatch socket fence; it does not claim a diagnostics
counter alone prevents dispatch or establish an actual installation.

## Final local inventory and proof-retention corrections

The unresolved-local-reference finding is confirmed: the same classifier cohort
moves from42PASS/3FAIL to45PASS; combined reader/application controls pass111.
The reader now treats literal local Action/reusable references as unknown. An
actual pinned20-workflow default-tree counterfactual changes `absent` to `unknown`
at12 paths. This intentionally supersedes the historical49GET preview: the
current #977 destination is unsupported until its local execution inventory is
reconciled. No default/template write or installation exception was introduced.

The first complete local coverage attempt passes965 suites/19,653 assertions,
with35 historical skips, but loses one existing SDK-contract suite to worker
SIGSEGV before its assertions run. A privately retained macOS report places the
fault in V8 GC. A [matching Node issue](https://github.com/nodejs/node/issues/62393)
is a diagnostic lead; causality here remains unproven. The two missing assertions
pass in isolation. Exactly one technical full retry, with identical source,
Node/Jest configuration and flags, then passes966 suites/19,655 assertions,
all repository budgets,60/60 mapped publisher Jest cases and385 extension
files/5,291 assertions. The original failure is retained. This is not a
qualification campaign or a runtime/configuration change.

Subsequent manual review reproduces two ways an early read/cancellation discarded
an already confirmed no-POST proof. The small follow-up preserves that fact until
the coordinator journals a new preparation intent. Both private-baseline controls
fail before this refinement; the expanded four-suite cohort then passes179
assertions and the changed Apply module remains100% allmetrics. Its isolated
whole-coverage command exits1 for unrun global owners. The full retry above is
explicitly the preceding source snapshot; normal hooks and fresh final-head
native coverage/review remain required for the refinement. No full result is
silently carried across the changed runtime bytes.

The first normal Git-commit hook then loses a different existing two-case suite
to SIGSEGV before creating a commit:965 suites/19,655 passes,35 historical skips,
no assertion failure. Its second private macOS report has the same first six V8
GC frames. The negative is retained. A separate local validation control selects
the same installed Node24.20.0 with the reported `--no-sparkplug` mitigation via
a temporary process-only executable wrapper. Build, test and lint hooks remain
configured unchanged; generated bundle bytes must match. This snapshot precedes
that control's outcome. Repository/CI configuration, production and qualification
runtime are unchanged; default final-head native gates remain mandatory.


### Second review: publisher partial recovery and reusable workflow inventory

The parent6b5092e native runner passes all four CI jobs under its default profile:
966 SDK suites/19,657 assertions plus35 historical skips, all budgets/60 mapped
publisher cases and385 extension files/5,291 assertions. Its native build passes
104 packaged files,11 actual C55–C58 CLI invocations with zero effects and the
typed API/local web smoke. Exact-head Codecov covers modified lines while
warning that its comparison base is352 commits stale. Eight prior threads have
public evidence/replies and are resolved. These facts are retained parent history.

Fresh review then finds two further defects. Four named assertions reproduce
them:60 pass/4 fail before correction, then118 pass across three suites. Partial
publisher recovery now enables the common reviewed create-if-absent policy,
after the explicit Install/review/approval flow. The real adapter inspects exact
identities, reuses matching effects, creates only after proven absence and
revalidation, and blocks conflicts. Completed receipts remain inspection-only;
unknown tree/commit POSTs are never replayed. Uninspected remote job-level
reusable workflows now classify UNKNOWN, like unresolved local execution. A
remote pin cannot prove what the called workflow does. No resolver or trust
exception is introduced.

The ten additional regressions comprise eight composed Install/review/private
disk journal/actual delivery controls (absent, matching lost-response, conflicting
and completed-missing effects for ref/PR) and two remote workflow controls. All
64 acceptance IDs and requirements stay unchanged. The expanded three-suite
cohort passes124 assertions; both changed runtime modules reach100% statement,
line, branch and function coverage. The isolated whole-coverage command still
exits1 for unrun global owners. This is not full-repository coverage acceptance.

The first expanded fixture incorrectly expected a lost POST response to remain
partial even though the adapter immediately re-inspects and adopts its own
matching effect. That120-pass/4-fail result is retained. Denying the immediate
followup reads produces the intended uncertain receipt; later reviewed recovery
then exercises the real condition. No runtime change was made for that fixture
error. The pre-staging build-validator failure is also retained: it compares
against the Git index and detects the newly emitted unstaged CLI bundle.

See review-round2/receipt.json and its23 lossless archives. Types, build,
specification validation, Graphify and the extracted-package smoke pass locally.
The selected SDD remains byte-identical. Normal hooks, publication and fresh
final-head native review/gates are still required for these new source bytes.
No installation, native canary, actual174/42 campaign or qualified profile is
claimed. Production remains disabled; qualification and pilot writes remain0.


### Lossless second-review evidence transport correction

The b82ec8c native Commit/Verification route stops before model assessment with
`validation.evidence-unavailable`, Retryable:No. The new generated coverage and
report archives used `.json.gz`, outside the existing generated-artifact path
contract. Their exact compressed and decompressed bytes now use `.json.log.gz`,
matching the unchanged prior archive format. The prior Git objects remain
reachable and every raw/compressed hash is verified; the policy is unchanged.
The original native failure and verification output are also retained, bringing
the current archive count to92. See `review-round2/evidence-transport-correction.json`.

No runtime source, SDK test, selected SDD, metadata/I/O limit, workflow or bundle
changes for this correction. The preceding normal hooks passed966 SDK
suites/19,667 assertions,35 historical skips/build/lint; those results are
retained. Fresh final-head native checks/review remain mandatory. The failed
run is not retried. Production remains disabled and pilot writes0.


### Acceptance evidence names and exact PR identity proof

Native4e coverage passes all966 SDK suites/19,667 assertions plus35 historical
skips and every coverage budget, then correctly rejects five stale expanded
assertion names in the publisher acceptance ledger. It stops before extension
tests/upload. The failure is retained; the obsolete run is not retried.

The corrected map binds C33 to the actual reviewed/private-journal PR response
recovery and six explicit actual-provider forgeries: marker, head ref, head SHA,
head repository, base ref and base repository. All reject with zero POSTs. C41
now uses the four executed denial names, and C20 includes both executed remote
workflow uncertainty controls. Extra recovery titles use descriptive prefixes,
removing unrelated C45/C47/C08 scenario labels. No64-case ID, requirement or
assertion text changes. This improves the evidence map, not a product threshold.

All19 mapped Jest files run901 assertions with zero failure/skip; the validator
then confirms60/60 mapped Jest cases against that actual report. C55–C58 remain
the separate extracted-package gate. The runtime source and four bundles remain
byte-identical to4e; only test/acceptance evidence changes. Types, specifications
and Graphify pass. See `acceptance-mapping-correction/receipt.json`; all99 raw
and compressed archives are verified. Normal hooks and fresh final-head native
checks/review/uploaded coverage remain required. The selected Action SDD stays
byte-identical. Production remains disabled, qualification calls/pilot writes0;
no installation, native canary or actual174/42 qualification is claimed.

The current classifier was also re-executed on all20 immutable masterace workflow
blobs. It returns UNKNOWN at14 execution paths:12 known local references and
two additional remote reusable wrappers in the issue/PR comment workflows.
`acceptance-mapping-correction/actual-default-inventory.json` retains every
workflow blob/hash and the classifier hash. This is not a full CLI preview or
installation; the historical49GET preview remains superseded.


### PR-complete terminal reconciliation and review counterevidence

A stop after retaining the completed PR but before saving waiting-for-merge
leaves an accepted applying journal. Two actual application regressions fail
before correction. Recovery now verifies the exact retained branch and PR in
inspection-only mode, then durably reconciles the terminal status through the
existing validated journal helper. A save failure preserves the actual last
durable applying state. It creates no replacement objects, ref or PR.

The missing-observer finding is refuted by the existing unchanged test, which
already passes on the parent source: the publisher retain callback rejects the
coordinator SHA unless ordered observer completion has durably stored it. No
shared-coordinator policy change is needed. The controlled delivery fixture now
checks the exact requested manifest path instead of accepting any contents path.

All129 focal assertions and all903 assertions in the19-file mapped cohort pass;
the actual mapped validator confirms60/60 cases. Isolated changed Apply coverage
is96.87% statements,97.14% lines,96.15% branches,100% functions; that targeted
command exits1 for unrun global owners and is not full coverage acceptance.
Types/lint/specifications/Graphify/build and104-file package/11 actual CLI
controls with zero effects pass. Only the canonical CLI bundle changes; the
other three bundles stay identical. Selected SDD and all64 case IDs, requirements
and assertion texts are unchanged. See review-round3/receipt.json.

Parent470 native CI passed all four jobs:966 SDK suites/19,673 passes,35 historical
skips, all coverage budgets,60 mapped cases,385 extension files/5,291 passes,
plus packaged CLI/API/web controls. The first local gh run-view coverage downloads
were cached partial logs; those are retained locally and complete job API logs
are archived here. Parent results do not substitute for fresh final-head gates.
Normal hooks/publication/final native checks are pending at this snapshot.
No installation,174/42 campaign, model qualification or production activation
is claimed; evaluated-pilot writes remain0 and production remains disabled.


### Extensible acceptance floor and two additional recovery cases

The selected immutable SDD calls64 a minimum, but the old validator fixed the
ledger to64, required every case to appear in the selected64-row table, and
fixed Jest acceptance to60. The corrected validator retains every original
case object and every selected SDD case, requires ordered contiguous extra IDs,
known SDD areas/requirements and meaningful assertions, unique safe actual test
evidence, and passed named execution. Only C55–C58 retain the package boundary.
C65 and C66 now register the two actual PR-complete terminal reconciliation
and failed-durability regressions, each under existing PU977-G04. There are66
cases and62 mapped Jest cases; the original64 case objects are unchanged and the selected Action SDD stays byte-identical.

The initial new parser fixture used macOS /var paths while Node resolved its
script under /private/var. Its19-pass/1-fail tooling result and subsequent
922-pass/1-fail cohort are retained, with the diagnostic. Resolving the owned
fixture root fixes the test setup; no production path policy changes. A separate
actual old-versus-corrected validator subprocess uses identical canonical
private source/ledger/report bytes and isolates the old budget rejection without
missing assertions. Those synthetic statuses prove parser behavior only.
The actual final20-file cohort passes923 assertions, including20 parser tests,
and the actual feature report validates62/62 mapped cases. Types/lint/specs
and Graphify pass. All runtime source and four bundle hashes stay identical
to2d; normal hooks and fresh final-head native gates remain required.

Parent2d native static/build pass, including104 packaged files and11 real CLI
controls with zero effects/API/web smoke. Coverage fails four journal tests and
a cleanup hook at their unchanged5-second limits:965 suites/19,671 assertions
pass,35 historical skips. Journal/store/policy/lockfile/Jest config and the
complete first test describe are identical to passing470. Complete local
instrumented isolation passes73 assertions; its command exits1 for partial
global branch coverage and unrun owners, so it is not full coverage acceptance.
The native cause remains unproven; local OS differs. The negative, source
comparison and isolation are retained; no deadline changes or obsolete retry.
See review-round4/receipt.json. The duplicate terminal-recovery finding was
posted on original470 and is already fixed by2d. No installation,174/42
qualification or qualified profile is claimed; pilot writes0/productiondisabled.

The historical Round5 snapshot has a cumulative90-case budget. C65–C90 assertions, traceability and its extended Definition of Done live in the owning organization/batch SDD appendix. The selected companion remains immutable as the original64-case baseline. The validator reads both contracts, rejects duplicate published IDs, and requires every mapped actual assertion. Source invocation validation is stateless YAML parsing in pure policy; the GitHub adapter ignores disjoint installation PRs while fencing every own-marker claim. See review-round5/receipt.json for real test boundaries, fixture negatives and pending final-head acceptance.

The historical Round6 snapshot has a cumulative acceptance floor91 (87namedJest +four extracted-package cases). C91 binds complete legacy tree-path validation before blob download; C08 retains its original normative assertion and expands only its evidence to authorized-Boolean no-Apply and actual prior partial receipt/fresh-decline controls. All other prior evidence and all prior IDs/areas/requirements/assertions/gates remain unchanged. The owning SDD publishes the additional table row, traceability and current Definition of Done; the selected companion remains byte-exact.


Round7 raises the historical floor to93 (89 mapped Jest cases plus four extracted-
package cases), adding C92 lock initialization and C93 completed-recovery guidance.
Round8 has the historical floor94 (90 mapped Jest cases plus the same four package
cases): C94 covers cancellation during revalidation and intent persistence at each
file phase and through ordinary batch Apply. All prior93 ledger objects and the
selected companion remain unchanged. Baseline publication rows are mandatory; only
at that snapshot contiguous additions above C94 may use the generic future-case checks. Its execution
results and the separate final-head native acceptance belong in review-round8.


Round18 acceptance required118 logical IDs /114 mapped Jest cases plus
the same four extracted-package cases. All first114 ledger objects and the
selected64-case companion remain exact. C115 prevents incomplete manifest/doctor
health; C116 covers actual local DNS dispatch across callback/promise Resolver
surfaces; C117 preserves planning with unrelated gitlinks and rejects fixed-path
collisions; C118 observes required guidance access failure. C23 is strengthened
in place. The114-stage and64-case baseline do not cap current completion.
Full source/coverage, package, normal hooks and fresh final-head native gates
still apply; no source or package result demonstrates installation.


Current Round19 requires119 IDs /115 mapped Jest plus four package cases. All
first118 objects and the selected64-case companion remain exact. C119 binds
operation-scoped owner/head PR inspection with the same100/page and10-page
bound, all-state/identity/conflict checks and0blind POST. C44's mandatory
unterminated and foreign/duplicate controls remain and observe the scoped query.
Source/normal/package/final-head native gates remain independent of installation.


Round20 is a later source change: all119 IDs and all prior evidence entries are
retained; C114 appends required provider-ref composition. C120/C121 raise the
cumulative floor to121IDs/117mapped+fourpackaged controls. Earlier statements
about byte-identical case objects describe their pinned historical deliveries.
No earlier result or report is rewritten as a later execution.


Round21 local preparation requires ordered routing-prefix coherence and preserves
generated duplicates/custom priorities. C122 adds four policy controls without
changing prior121 objects. Existing journal diagnostics now cover the batch
recovery suite that timed out oncf533; this is observation, not a proven fix or a
larger deadline. Await the completed cf533 review before source publication.


Completed cf533 review also identifies unsupported hotfix/release facts when
managed branches are disabled. C123 covers four form-on/off negatives plus two
valid manual-only positives; prior pre-branch-SDD fixture remains independently
causal with feature-only selection. Round21 is now123IDs/119mapped+4package and
ten new policy cases, with all earlier objects retained. No branch lifecycle
permission, production setting or journal timeout changes.


## Round22 source and acceptance changes

The b24d review has three valid observations. The final resource-save failure
now retains proven pre-delivery state using the existing v1 preflight reason;
unknown legacy preparation stays blocked. The existing forged/future receipt
fixture now reaches the real receipt matcher, with a failing matcher-removal
counterfactual. Valid publisher resume explicitly proves fresh confirmation and
reinspection; decline/cancel stop before Apply. Five physical controls are added.
C40 appends two evidence refs, C52 appends three, and C124 adds three required
checkpoint/legacy controls. All other first123 objects and the selected64-case
companion remain exact. Current floor124 IDs/120mapped+four package cases; no
bounds, schemas, privileges, installation or model calls change.

The64-case completion-cap claim is refuted by the normative cumulative contract
and both executable64-only counterfactuals. GitHub renders the exact documented
heading permalink. Both review threads were replied to and resolved; neither
requires changing the selected companion. Final source-bound cohort, normal
hooks and native review/CI remain separate gates. See [Round22](review-round22/README.md).
