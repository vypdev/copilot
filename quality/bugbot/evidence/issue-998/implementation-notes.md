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
