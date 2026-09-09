# Product Specification Standard

This directory contains implementation-driving product and engineering
specifications. A spec is a shared product contract, not only a technical design.
It must make the intended behavior understandable to someone who did not take
part in the original discussion and testable by someone who did not implement it.

New specifications start from [`_template.md`](./_template.md). Existing specs
should converge on this standard when they are materially revised.

## 1. Core criteria

Every spec must be:

- **Product-near:** use the names, states, actions, and surfaces that users and
  operators will actually see.
- **Visual where it helps:** show multi-step flows, state changes, ownership, or
  several relationships with a compact diagram, table, timeline, or Markdown
  wireframe.
- **Textually complete:** every visual has an adjacent textual equivalent; color,
  emoji, screenshots, and Mermaid are never the only source of meaning.
- **Explicit:** distinguish current facts, proposed behavior, recommended
  defaults, configurable choices, fixed safety limits, non-goals, and open
  questions.
- **End-to-end:** include happy paths, alternatives, partial success, failure,
  retry, cancellation, migration, and cleanup where relevant.
- **Verifiable:** important statements use normative language and map to an
  automated test, contract check, or explicit human acceptance artifact.
- **Proportional:** a concern may be marked not applicable with a reason; it must
  not disappear silently.

Use `MUST`, `SHOULD`, and `MAY` deliberately. A `MUST` requires an acceptance
scenario. Avoid prescribing implementation details unless they protect product
behavior, architecture, interoperability, or safety.

## 2. Required specification contract

A specification must cover the following concerns or mark them not applicable:

| Concern | Required outcome |
|---|---|
| Decision metadata | Status, date, owners, scope, review gates, and unresolved decisions |
| Problem and evidence | Current behavior, concrete pain, affected actors, and evidence/source |
| Goals and limits | Measurable outcomes, non-goals, fixed safety/product invariants |
| Product journey | Current versus proposed flow, actors, entrypoints, visible surfaces, next actions |
| Domain model | Shared terminology, invariants, states, transitions, and ownership of facts |
| Configuration | Recommended defaults, bounded alternatives, validation, precedence, persistence, migration |
| Architecture | Dependency direction, pure policy, use cases, ports, adapters, presentation, state and trust boundaries |
| UI/UX and content | Information hierarchy, examples for every primary state, navigation, accessibility, localization |
| Failure and recovery | Impact, partial-success facts, retryability, idempotency, cleanup, operator action |
| Security and privacy | Permissions, untrusted input, secrets, execution boundaries, auditability |
| Observability | User status, operator evidence, logs/metrics, correlation, noise budget |
| Compatibility and rollout | Existing in-flight state, migration, deprecation, rollout and rollback |
| Testing | Numeric risk-derived budget, distribution, coverage, fixtures, integration and human evidence |
| Documentation | User, setup, configuration, recovery, migration, architecture and discoverability |
| Acceptance and DoD | Observable scenarios, traceability, implementation order, all quality gates |

## 3. Product and GitHub UI/UX standard

GitHub issues, pull requests, reviews, comments, checks, labels, releases, and Job
Summaries are product surfaces when a person uses them to understand or operate a
feature. CLI output and generated documentation are product surfaces for the same
reason.

For each primary state, the first visible content must answer in this order:

1. What is happening now?
2. What completed already?
3. What happens next?
4. Is human action required?
5. What is the impact, especially for partial success or failure?
6. Where can the result or transition be inspected?
7. Where are technical details available?

A spec affecting these surfaces must include representative rendered Markdown
or a wireframe for at least pending, action-required, blocked/failed, partially
complete, and complete states. Use actual product terminology and plausible data.
Do not specify only abstract fields such as `status`, `message`, and `url`.

The UX contract must define, when applicable:

- one primary status and one primary action;
- progress/state representation and the facts behind it;
- deterministic titles, headings, labels, and durable markers;
- descriptive links to the issue, PR, comparison, commit, run, artifact, release,
  package, documentation, and recovery action;
- progressive disclosure: user meaning first, technical diagnostics later;
- error content in `impact -> cause -> action -> retained state` order;
- idempotent update behavior and a bounded comment/notification budget;
- locale source, supported locales, and fallback behavior;
- narrow/mobile readability, light/dark themes, and logical heading/table use;
- sanitization of mentions, commands, Markdown, HTML markers, URLs, and diagrams;
  and
- a textual fallback for Mermaid, images, icons, and other visual elements.

For a flow with three or more dependent transitions, include one overview visual.
For a user-facing issue or PR change, include at least one concrete content
mockup. Screenshots can supplement these artifacts but cannot replace the
semantic written contract.

## 4. Clean Architecture standard

Apply Clean Architecture to the repository's real boundaries rather than
inventing a parallel folder taxonomy. A design must identify:

- domain entities, value objects, invariants, and pure policies;
- application use cases and narrow immutable input/output contracts;
- semantic ports that express capabilities without provider DTOs;
- data/provider adapters and their error mappings;
- infrastructure and composition ownership;
- entrypoint responsibility and trusted/untrusted event boundaries;
- presentation view models and renderers, separate from mutation policy;
- durable state, concurrency, idempotency, and migration ownership; and
- forbidden dependency directions that can be enforced automatically.

Use a component/dependency diagram when three or more layers or external systems
interact. Use a sequence or state diagram when ordering, retries, asynchronous
events, or partial completion affect correctness.

Architecture requirements are incomplete without executable constraints. The
spec must state which dependency, contract, cycle, schema, or workflow checks
will prevent boundary erosion.

## 5. Configuration standard

Configuration exists to support legitimate product variation, not to make every
implementation detail optional. Every input must define:

| Field | Required information |
|---|---|
| Name and type | Stable public name, type, and owning surface |
| Recommended default | Safe default and why it is recommended |
| Allowed values/range | Bounded choices with observable semantics |
| Validation | Invalid values and invalid cross-field combinations |
| Scope and precedence | Project/repository/operation scope and override order |
| Persistence | Whether an in-flight operation snapshots or rereads the value |
| Migration | Behavior for absent, legacy, renamed, or future values |
| Security | Values that must never accept arbitrary code, refs, URLs, or secrets |

Show at least one recommended configuration and one meaningful alternative.
State which correctness and safety invariants are intentionally not configurable.

## 6. Test budget standard

Every implementation-driving spec must contain a numeric test budget. Derive it
from the behavior and risk inventory; do not reuse one universal count for small
and large changes.

The budget table must distribute a minimum number of distinct cases across the
applicable areas:

- domain/configuration/pure planning;
- state transitions, idempotency, replay, cancellation, and races;
- application use cases;
- adapters and provider error mapping;
- workflows, permissions, schemas, and setup contracts;
- presentation states, links, localization, accessibility, and sanitization;
- integration/end-to-end and compatibility/migration; and
- security/abuse cases.

Each `it`/`test` case counts once. Parameterized rows count separately only when
they represent distinct behavior. The number is a floor, not a substitute for
covering every requirement and failure mode.

The spec must also define:

- repository-wide thresholds that remain in force;
- higher branch coverage for new pure policy where justified;
- changed-module expectations;
- deterministic fakes instead of real waits or live services;
- fixtures/golden output without relying only on snapshots;
- workflow/contract checks that parse structure rather than grep prose;
- required manual UX evidence that automation cannot establish; and
- a traceability mapping from each normative requirement to tests or evidence.

## 7. Documentation standard

Documentation is an implementation deliverable. Identify the applicable
audiences and artifacts:

- user journey and recommended default;
- setup, permissions, environments, credentials, and external prerequisites;
- complete configuration reference and examples;
- operator state model, troubleshooting, recovery, replay, and cleanup;
- upgrade, migration, compatibility, deprecation, and rollback;
- architecture, contracts, trust boundaries, and contributor guidance; and
- route/navigation registration, links, assets, examples, and validation jobs.

Lead documentation with the normal path and one helpful visual, then disclose
configuration, failures, and internals progressively. Examples must be checked
against implementation fixtures or contract tests whenever practical.

## 8. Acceptance, traceability, and review

Acceptance scenarios describe observable behavior, not implementation activity.
Cover normal, alternative, boundary, invalid, duplicate, out-of-order, partial,
failure, recovery, migration, security, UX, and accessibility behavior as
applicable.

Maintain a traceability table for substantial specs:

```text
Requirement -> domain/policy/use case/adapter/presentation -> test or evidence -> documentation
```

Before changing a spec to `Ready for implementation`, reviewers must be able to
answer yes to the following:

- Is the origin/current behavior supported by evidence?
- Can a user understand the proposed product without reading implementation code?
- Are product defaults and non-configurable safety limits explicit?
- Are architecture boundaries and executable constraints clear?
- Is the numeric test budget proportional and complete?
- Are documentation and migration deliverables named?
- Do UI examples cover pending, action, error/partial, and completed states?
- Can status and required action be understood quickly without logs?
- Are security, idempotency, retries, concurrency, and cleanup addressed?
- Does every `MUST` map to acceptance and verification?
- Are material decisions resolved or explicitly blocking readiness?

The Definition of Done must repeat these gates. A concern mentioned only in an
introductory paragraph is not an enforceable delivery requirement.
