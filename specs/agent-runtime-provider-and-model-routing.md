# Agent Runtime, Provider, Model, and Role Routing

- Status: Implemented
- Date: 2026-09-11
- Last updated: 2026-09-24
- Catalog capability ID: `agent-runtime`
- Last verified: 2026-09-24
- Owners: Copilot maintainers
- Scope: resolve, validate, provision, authenticate, authorize, and execute provider-neutral agent roles
- Related issues/PRs: comment automation, Bugbot, setup, PR lifecycle, and
  architecture quality and scalability hardening SDDs
- Required review gates: product UX, architecture, testing, documentation, security/operations
- Open decisions blocking readiness: none for the baseline

## 1. Executive summary

Copilot resolves one complete runtime/model tuple for each reachable agent role:
provider runtime, model provider, model, optional effort, and optional validated
executable selection.
Common values may be overridden per planner, findings, reviewer, fixer, or tester.
The recommended common default is Codex with `openai/gpt-6-luna`; explicit
repository Variables and role inputs retain precedence over that fallback.
Only roles reachable from the current event are provisioned and authenticated.
Invalid configuration or runtime failure is terminal for that capability; no
silent provider/model/executable fallback is attempted.

```text
event/command -> active roles -> common + role override -> validate allowlists
              -> provision/auth preflight -> provider adapter -> local schema
              -> semantic result
```

## 2. Problem, current behavior, and evidence

### 2.1 Problem

Runtime CLI, model vendor, model name, reasoning effort, credentials, execution
mode, and task responsibility are distinct concerns. Conflating them causes
unreviewed fallback, excess provisioning, credential exposure, or write-capable
agents running for read-only tasks.

### 2.2 Current behavior

1. `agent-*` supplies the common tuple; role-specific fields inherit only when blank.
2. The manifest records a reviewed runtime identity for Codex, OpenCode, and
   Cursor, plus reproducible package installation only where supported.
3. Provider/model formats, executable selection, non-empty runtime identity,
   fixed provider command shape, and configured allowlists are validated.
4. Event/command policy calculates active roles before runtime preparation.
5. `ai-members-only` may prevent all requested agent runtime preparation for an unauthorized actor.
6. Provisioning mode (`auto`, `always`, `disabled`) reuses any available
   operator-owned runtime. Missing default Codex/OpenCode runtimes use only the
   pinned manifest installation; explicit executables are never replaced and
   Cursor has no automatic installer.
7. An exhaustive dispatcher selects one independent provider policy, and a
   preflight planner produces the complete admitted execution plan.
8. A generic process adapter consumes only admitted plans; OpenCode JSON events
   are decoded before provider-neutral local schema validation.

### 2.3 Evidence and contract classification

- Observed behavior: agent domain, configuration/activation policies, execution
  planner, reviewed-runtime and pinned-install manifest, CLI provisioner/process adapter, setup workflows,
  architecture/security tests, and agent docs.
- Intentional contract: complete tuple, no implicit fallback, active-role-only
  preparation, semantic ports, local schema validation, and credential isolation.
- Known debt and limitations: an operator-owned provider CLI may change its
  command surface externally; incompatible flags fail terminally at execution.
  Installation-manifest upgrades require reviewed fixtures and controlled live
  smoke evidence; credential checks remain environment-specific; cost estimates
  are not product guarantees. On Windows, npm-generated `.cmd` shims cannot be
  passed directly to Node's no-shell process APIs; PR #403 observed
  `configuration.unsupported` during Codex provisioning after Git Bash passed.
  The underlying exception was not exposed, so the shim explanation remains a
  hypothesis until isolated Windows tests and runner evidence confirm it.
- Unknown rationale: the prior `gpt-5.6-luna` default was operational
  configuration, not a permanent architecture decision.
- Implemented hardening: provider-specific execution policies and an exhaustive
  compile-time dispatcher are specified in
  [`agent-execution-policy-hardening.md`](./agent-execution-policy-hardening.md),
  under the shared gates in
  [`architecture-quality-and-scalability-hardening.md`](./architecture-quality-and-scalability-hardening.md).
  Adding a provider still requires a separate runtime-support, security, docs,
  and smoke-test change.

## 3. Actors, surfaces, and terminology

| Actor | Goal | Entry point | Surface |
|---|---|---|---|
| Repository owner | select approved runtime/model | setup/Variables/inputs | plan/docs/run |
| Workflow | request capabilities | event/single action | Job Summary/logs |
| Agent role | perform bounded task | semantic port | structured/text result |
| Provider CLI | execute model request | admitted argv/stdin | process output |

Runtime provider selects the executable; model provider selects who serves the
model. Roles are planner (read), findings (read), reviewer (read), fixer (write
workspace), and tester (read). “Active” means reachable from this exact event,
not merely configured.

## 4. Goals, non-goals, and fixed invariants

### 4.1 Goals

1. Every invocation MUST have one valid complete effective tuple.
2. Inactive roles MUST NOT be provisioned, authenticated, or invoked.
3. Provider output MUST cross a provider-neutral locally validated contract.

### 4.2 Non-goals

1. Copilot does not dynamically choose the cheapest/best model.
2. It does not fail over between providers or models.
3. It does not guarantee provider availability, price, quota, or data residency.

### 4.3 Fixed product/safety invariants

1. Missing/malformed/unsupported tuple or disallowed model fails before execution.
2. Callers cannot provide command text or argv; executable selection accepts no arguments or wrappers.
3. Read-only roles cannot receive write/network/approval authority beyond their admitted plan.
4. Agent processes never receive GitHub git credentials.
5. Structured output is locally validated even if the provider validates it.

## 5. Current versus proposed product journey

| Stage | Rejected/unsafe shape | As-built contract | Effect |
|---|---|---|---|
| Selection | provider implies model | independent qualified model | explicit behavior |
| Roles | one runtime eagerly prepared | only active role tuples | lower cost/risk |
| Invocation | caller supplies command text | provider policy builds argv | injection resistance |
| Runtime ownership | replace a newer runner CLI | reuse it and record identity | no global mutation |
| Failure | silent fallback | terminal named error | auditability |
| Output | trust provider JSON | local schema/size check | consistent contract |

No legacy behavior is supported; the hardened runtime is the only contract.

## 6. Functional behavior and state model

### 6.1 Happy path

1. Determine active roles from event/command/single action.
2. Merge common tuple with complete role overrides and validate.
3. Enforce model-provider/model allowlists and provisioning policy.
4. Reuse an operator runtime, or install and exactly verify the pinned package
   only when the supported default executable is missing/forced.
5. Verify CLI identity and credential/login readiness.
6. Invoke the generic process adapter with the admitted role plan.
7. Bound/parse/validate output and return semantic result.

An operational Codex login probe is itself an agent process. Before `login
status`, it MUST resolve the selected executable and any Windows npm package
bin, validate the shim, direct interpreter, and package bin with the same
owner/ACL file policy used for version and execution preflight, and execute
with literal arguments and the bounded credential environment. A failed trust
check reports authentication as unavailable without starting the CLI. A
focused fixture MUST prove a writable launcher cannot run during this probe.
The admitted execution plan separately records and rechecks its launcher hash
when that plan is later executed; the synchronous login probe has no stored
execution plan to recheck.

### 6.2 Alternative paths

- Different active roles in one workflow may use different runtimes/models.
- Existing Codex login may satisfy an explicit credential alternative.
- `auto` provisions only missing active default runtimes; `always` reinstalls
  default Codex/OpenCode from the pinned package. An explicit executable is
  operator-owned in every mode.
- Optional effort maps to Codex reasoning, OpenCode variant, or provider-neutral context for Cursor.

### 6.3 State model

| State | Meaning | Next | Recovery |
|---|---|---|---|
| inactive | role unreachable | terminal | none |
| resolving | inheritance/tuple building | invalid/authorized | fix config |
| authorized | actor/model policy passed | provisioning/ready | none |
| provisioning | CLI installation/check | ready/failed | pin/runner fix |
| authenticating | credential/login preflight | ready/failed | configure credential |
| executing | provider process running | validating/failed | inspect bounded error |
| validating | output local contract | complete/failed | provider/prompt fix |
| complete | semantic result returned | terminal | none |

No provider fallback transition exists. Retry repeats readiness checks and MUST
not treat a partial installer as authenticated success.

## 7. User-facing configuration

| Input | Recommended default | Allowed/bounds | Persistence |
|---|---|---|---|
| `agent-provider` | `codex` | `codex`, `opencode`, `cursor` | repository/run |
| `agent-model-provider` | `openai` | validated identifier + allowlist | repository/run |
| `agent-model` | `gpt-6-luna` | validated unqualified model + allowlist | repository/run |
| `agent-effort` | empty | validated provider-supported value | repository/run |
| `agent-executable` | reviewed basename | exact basename or absolute path to it | repository/run |
| `<role>-*` | inherit common tuple | same bounds | repository/run |
| `AGENT_PROVISIONING` | `auto` | auto/always/disabled | runner/repository |
| allowlists | setup-derived exact values | comma-separated exact providers/models | workflow environment |

Model values MUST not repeat provider prefixes. A meaningful alternative is
OpenCode with an explicitly qualified allowed provider/model. Cursor requires
the documented credential and a preinstalled runtime. No-fallback, local schema,
active-role-only, credential isolation, and permission modes are not configurable.
The same default MUST appear in the action input, setup plan, generated
workflow fallbacks, and default allowlist (`openai/gpt-6-luna`). A configured
repository `AGENT_MODEL` or role-specific value is intentional and MUST not be
silently rewritten by source defaults; operators migrating this repository
update `AGENT_MODEL` and `AGENT_ALLOWED_MODELS` together. The effective model is
snapshotted for a run. Existing explicit `gpt-5.6-luna` deployments remain
supported when exactly allowlisted. Reasoning effort, credentials, and provider
transport do not change as part of the default migration.

## 8. Clean Architecture design

| Boundary | Owns | Must not own/import |
|---|---|---|
| Domain | provider/role/config tuple | process/env |
| Policies | activation, inheritance, runtime support, validation | CLI invocation |
| Application ports | findings/fixer/language capability requests | provider DTO/flags |
| Data adapters | provider-neutral capability and generic process lifecycle | workflow routing/provider authority |
| Infrastructure planning | executable/runtime-identity/artifact preflight | product role decisions |
| Entrypoints/setup | inputs and composition | provider-specific branching beyond adapters |

```mermaid
flowchart LR
  E[Event/command] --> A[Active-role policy]
  A --> C[Effective tuple policy]
  C --> P[Semantic capability port]
  P --> D[Admitted execution plan]
  D --> G[Generic process adapter]
  G --> O[Local output validator]
```

Dependency/cycle tests, CLI entrypoint tests, provider-port boundaries,
allowlist/docs validation, and workflow secret checks MUST prevent erosion.

## 9. UI/UX and content contract

```markdown
Pending: **Preparing the `reviewer` role.** Runtime `codex`; model `openai/gpt-6-luna`.
Action required: **Codex authentication is missing.** Log in on the runner or configure an approved fallback credential.
Blocked: **`anthropic/model-x` is outside `AGENT_ALLOWED_MODELS`.** No provider process started.
Partial: **The provider completed, but its structured result was invalid.** Nothing was published or modified.
Complete: **Reviewer completed with a locally validated result.** Continue in the linked PR status.
```

Output MUST name role, runtime, qualified model, phase, and one recovery action
without printing prompts, credentials, or raw provider response. Technical argv
is debug-only and redacted. Text accompanies icons; English is fallback; terminal
and Job Summary content remains narrow-readable. Provider errors are mapped to
stable categories before public presentation.

## 10. Failure, recovery, and cleanup

| Failure | Impact | Retained facts | Retry | Action | Cleanup |
|---|---|---|---|---|---|
| invalid tuple/allowlist | no process | config | yes | correct exact value | none |
| provisioning | CLI unavailable/partial | install logs only | yes | provide runtime/fix pinned install | remove temp install per adapter |
| auth preflight | no query | credential name only | yes | login/add secret | none |
| process timeout/exit | capability fails | bounded diagnostics | yes | inspect provider/quota | terminate child |
| schema/size invalid | no trusted result | raw output not published | yes | fix prompt/provider | discard output |
| write role postflight | no trusted commit | workspace state | guarded retry | abort/review | mutation guard |

## 11. Security, permissions, and privacy

Credentials remain in provider-supported environment/login stores and are never
command arguments, prompts, result payloads, or catalog/config examples. Read
roles use read-only/no-approval/network-restricted modes where supported. Write
roles receive workspace access only after actor authorization and still cannot
own trusted git. Processes use policy-owned argv, bounded environment, timeouts,
output limits, redaction, and local schemas. Repository instructions are
untrusted input, not authorization.

## 12. Observability and operational UX

Logs/summary expose active role, provider, qualified model, configured effort,
provision/auth/execute/validate phase, elapsed time where available, and mapped
failure. Content-free Bugbot telemetry is optional. Setup/doctor and the
credential-health workflow surface readiness per credential. Inactive roles
produce no provisioning noise. Model/provider changes are operational changes
that require smoke evidence.

## 13. Compatibility, migration, rollout, and rollback

### Windows Action runtime acceptance (issue #404)

Windows support MUST use a direct Node or native executable for provider
version checks and admitted execution. A `.cmd`/`.bat` wrapper MUST NOT be
executed through a shell with agent arguments or prompts. For a reviewed npm
runtime, resolve its package-owned bin target from a valid package manifest,
keep it inside that package, and admit only a Node script or native executable.
Malformed, missing, or externally redirected bins fail before an agent starts.
Installation MUST call the runner's npm CLI through Node on Windows with the
manifest-pinned package/version, not depend on shell lookup of `npm.cmd`.
Explicit operator executables retain ownership and are never replaced.

For a JavaScript Action, `process.execPath` names the Actions runner's embedded
Node runtime, while `actions/setup-node` places the npm-bearing Node
installation on the job PATH. The embedded runtime is not an npm installation.
Windows provisioning MUST resolve the Node executable provided to the job,
locate npm's CLI script beside that exact executable, and invoke the script
directly with the manifest pin. A missing CLI script fails before installation;
the code MUST NOT fall back to a shell, `npm.cmd`, or an unrelated ambient npm.
Fixtures MUST distinguish the embedded Action runtime from a separate Node
installation, cover a path containing spaces, and exercise the missing-script
failure. A manual service-runner fixture MUST verify that the selected Node and
its npm CLI script actually exist without using an agent credential or setup.

The Windows runtime MUST use a private, owner-only ACL for generated artifacts;
POSIX mode bits are insufficient evidence on Windows. Cancellation and timeout
MUST terminate the agent process tree before generated artifacts are removed.
The process still receives the bounded environment and argv, with no inherited
GitHub token or raw diagnostic output. If an ACL or process-tree check cannot be
performed, execution fails closed. Windows CLI and Action support remain an open
acceptance gate until isolated Windows CI fixtures pass and a real runner review
confirms the job without a credential-bearing test dispatch.

Selected executables, their package-owned JavaScript entrypoints, and the Node
interpreter also require a read-only Windows ACL preflight before version checks
or execution. The file owner must be the runner user or a trusted platform
principal. No untrusted principal may hold write, delete, ownership, or DACL
mutation rights, whether an ACE is explicit or inherited. Read/execute access
alone may be shared. Unknown ACE rights or unreadable ACLs fail closed. The
preflight must not rewrite an operator-owned executable. Fixtures cover a
normal Git for Windows/npm or Node ACL, a broad writable grant, inherited
write, and malformed ACL evidence on hosted and service Windows runners.
Numeric SDDL ACE masks MUST reject both generic write (`0x40000000`) and
generic all (`0x10000000`) for an untrusted principal, as well as file-specific
mutation bits. Focused tests MUST exercise those generic rights directly;
the mask definition should make their inclusion reviewable without mental
hexadecimal arithmetic.
The installed-file preflight must read the full descriptor, including owner;
`icacls /save` exports a DACL only and cannot establish ownership. A bounded
read-only Windows ACL query is required, while generated runtime artifacts
retain their separate owner-only `icacls` policy.

The 2026-10-02 hosted Windows fixture found an effective
`Authenticated Users: 0x1301bf` (modify) grant on both the Action-embedded Node
and setup-node's job Node. The policy correctly rejects both; choosing the
other ambient Node is not a fix. A self-hosted Windows fixture also failed
the same executable preflight, although its exact rejected ACE still needs
review. Until the installed toolchain has trusted ownership and no broad
mutation grant, Windows agent execution is **open and blocked**. Credentialed
repository Action jobs MUST route to the verified macOS self-hosted runners;
the Windows fixture jobs remain visible and red as evidence. Do not infer
Windows agent support from Git Bash, npm availability, or Mac Action success.
Runner owners must harden the Node, npm CLI, Codex shim and package entrypoint
ACLs, then rerun the isolated hosted/service fixtures before re-enabling
Windows. The GitHub-hosted image cannot be declared safe without its own
fixture evidence or a separately reviewed trusted toolchain.

There is no legacy provider alias or silent model fallback. Blank role fields
inherit common fields; invalid explicit values fail. A new provider/model is
rolled out by updating domain types, runtime-support/allowlist policy, provider plan,
setup/workflows, credentials, docs, tests, and controlled smoke evidence.
Rollback restores the prior tuple/installation pin; provider-created external effects are
handled under that provider's policy. For this default-only migration, rollback
restores both repository Variables (`AGENT_MODEL=gpt-5.6-luna` and
`AGENT_ALLOWED_MODELS=openai/gpt-5.6-luna`) and the source/workflow defaults;
changing only one side would fail allowlist preflight. A controlled Codex smoke
run MUST verify the target model with the runner credential before declaring the
new effective default healthy.
The reviewed Codex installation pin and generated provisioning workflow MUST
advance together when the default model requires newer CLI model metadata. The
`0.153.4` CLI rejects `gpt-6-luna`; the reviewed `0.156.1` CLI passes a local
authenticated `codex exec` smoke. Repository Actions must still prove the same
tuple with their own credential. An installed operator-owned CLI is never silently
replaced; its version and model smoke remain an explicit operator responsibility.

## 14. Testing strategy and numeric budget

| Area | Minimum cases | Risks |
|---|---:|---|
| Activation/config/runtime support | 30 | event roles, inheritance, formats, allowlists |
| Provision/auth/execution state | 24 | modes, retries, timeout, partial install |
| Provider plans/error mapping | 24 | argv/stdin/env/effort/output per provider |
| Workflow/setup contracts | 21 | secrets, pinned installations synchronized with manifest, Node prerequisite, active inputs, shared model fallback and exact allowlist across action/setup/workflows |
| UX/sanitization | 12 | phase/errors/redaction/narrow output |
| Integration/security/cutover | 19 | role→provider, injection, credentials, new provider, configured-variable precedence and model smoke |
| **Total** | **130** | no double counting |

The Windows extension adds at least 18 distinct fixture cases: 6 for pinned
installation and `.cmd` resolution, 4 for malformed/path-escaped bins and
operator-owned executables, 4 for ACL/artifact rejection, and 4 for execution,
descendant cancellation, timeout, and cleanup. This is an extension to the
130-case baseline, with no reused case counted twice. CI MUST run these cases on
Windows and retain macOS/Ubuntu coverage. A live agent run is a separate human
gate and is not part of automated acceptance.

Global thresholds remain; activation/configuration/executable policies SHOULD reach
100% branch coverage. Use fake executables/processes/credentials and no live
provider in unit/integration tests. Each provider requires controlled smoke tests
for read and applicable write modes. Human evidence covers setup/doctor/action/CLI
errors and credential masking.

## 15. Documentation and discoverability

| Audience | Artifact | Required content |
|---|---|---|
| User | execution/runtime/model docs | tuple and defaults |
| Setup owner | input/CLI configuration | roles, credentials, allowlists |
| Operator | provisioning/failure and upgrade/rollback docs | readiness, paired Variable migration, smoke, recovery |
| Contributor | this SDD/architecture | semantic ports/adapters |

## 16. Acceptance scenarios

1. An event prepares only its reachable roles.
2. Blank role fields inherit common tuple; invalid explicit values do not fallback.
3. Disallowed provider/model or unsafe executable selection fails before process execution.
4. Each provider receives its documented argv/stdin/effort without secrets.
5. Unauthorized mutation request prepares no write role.
6. Missing CLI/auth reports one phase-specific recovery action.
7. Invalid/oversized structured output is rejected locally and not published.
8. Runtime failure does not invoke a second provider/model.
9. Adding a provider cannot pass without an exhaustive plan policy, security, workflow, docs, and smoke evidence.
10. A non-empty operator-owned runtime version is recorded and executed without
    replacement; exact version matching applies only after Copilot installs a package.
11. With no explicit model override, action/setup/generated workflows choose
    `gpt-6-luna` and the exact allowlist includes `openai/gpt-6-luna`; a
    configured model outside that allowlist fails before execution.
12. With explicit repository or role model configuration, that value retains
    precedence; changing only the source fallback does not claim to migrate the
    effective model. Updating both repository Variables and running a controlled
    smoke test establishes the new effective default without changing effort.
13. The manifest, generated provisioning workflow, and operator documentation
    pin Codex `0.156.1`; a version-sync contract test fails if they diverge. The
    old `0.153.4` binary cannot be presented as a Luna-compatible default.
14. On Windows, `always` installs the exact pinned Codex package through Node,
    verifies the CLI version, and executes a fake package bin with literal
    arguments without invoking a command shell.
15. A malformed or escaped npm bin, weak runtime ACL, or failed process-tree
    termination blocks execution or reports failure without trusted output or
    leaked prompt/credentials. The fixture leaves no managed artifacts.

## 17. Requirements traceability

| Requirement | Owner | Evidence | Documentation |
|---|---|---|---|
| active roles | activation policy | activation tests | execution contract |
| tuple/allowlist | config policies | builder/policy tests | model selection |
| Luna default and migration | domain default, setup projection, action and workflow fallbacks | default/override/allowlist contract tests and controlled runner smoke | input reference, model selection, upgrade/recovery |
| Luna-compatible Codex pin | runtime manifest and generated provisioning workflow | exact-version and version-sync tests; same-version local and Action smoke | CLI provisioning, version pinning, recovery |
| provisioning/auth | provisioner/preflight adapters | ownership/install/infra tests | provisioning/credentials |
| semantic execution | capability adapter/provider plans | policy and process tests | runtime/CLI commands |
| local validation/security | parsers/schema/environment | security tests | failure/trust docs |
| Windows runtime | npm/bin resolver, planner, process and ACL adapters | [2026-10-02 isolated matrix](https://github.com/vypdev/copilot/actions/runs/36955416020): hosted Windows passed 20 fake package, ACL, descendant cancellation and cleanup cases; macOS/Ubuntu and npm-pack smoke passed; self-hosted runner and live agent review remain open | provisioning and failure policy |

## 18. Maintenance sequence

1. Update role/config/runtime-support contracts and exhaustive tests.
2. Update semantic ports/use cases and activation cases.
3. Update provider/provision/auth adapters and fake executable tests.
4. Update setup/workflows/docs/catalog and smoke matrix.
5. Run full gates plus controlled provider and human UX validation.

## 19. Definition of Done

- [ ] The 130-case budget, coverage, architecture, workflow, and docs gates pass.
- [ ] Every active/inactive, config, provisioning, auth, execution, and validation state is tested.
- [ ] Credentials, executable selection, output, read/write authority, and no-fallback rules pass security review.
- [ ] All five UI states and setup/action/CLI surfaces are accessible and redacted.
- [ ] Provider smoke evidence and rollback instructions exist.
- [ ] Documentation and catalog reflect current defaults, allowlists, reviewed
  runtime identities, and pinned installation recipes.

## 20. References and decisions

- Primary sources: catalogued agent code, workflows, tests, and docs.
- Related SDDs: setup; comment automation; Bugbot; PR lifecycle.
- Planned hardening: `agent-execution-policy-hardening.md` owns provider-policy
  isolation and its cross-provider security contract; the architecture
  hardening SDD owns shared sequencing and verification gates.
- Decision: semantic role ports and explicit complete tuples; no fallback.
- Rejected: eager provisioning, shell-string assembly, provider DTOs in use cases.
- Follow-up: automatic model selection is outside this baseline.
