---
name: product-specification
description: Create, revise, or review repository product and engineering specifications, SDDs, and implementation RFCs with explicit architecture, test budgets, documentation, bounded configuration, and user-facing GitHub UX. Use when a document will guide implementation or acceptance; do not use for implementation-only tasks or informal answers.
---

# Product Specification

Produce a specification that lets product, engineering, reviewers, and
operators understand the same intended product and verify when it is complete.

Before drafting or reviewing, read these repository sources in full:

- [Product Specification Standard](../../../specs/README.md)
- [Specification template](../../../specs/_template.md)

Use existing code, workflows, documentation, configuration, and observed
failures as evidence. Follow the repository's Graphify rules before broad source
exploration. Research external behavior when it is unstable, provider-specific,
safety-critical, or central to the decision, and link primary sources.

## Working method

1. Establish current behavior and evidence before proposing changes.
2. Separate product requirements, implementation choices, recommended defaults,
   safety invariants, non-goals, and open decisions.
3. Describe the complete user/operator journey, including pending, successful,
   partial, blocked, retried, and canceled states.
4. Apply Clean Architecture to the project's real boundaries: identify pure
   decisions, use cases, semantic ports, adapters, composition, presentation,
   state ownership, trust boundaries, and executable dependency constraints.
5. Define configuration as a bounded product contract: defaults, values/ranges,
   invalid combinations, precedence, persistence, migration, and intentionally
   non-configurable safety rules.
6. Treat issues, PRs, comments, labels, checks, summaries, CLI output, and docs as
   UI when people rely on them. Show representative content and navigation, not
   only the data or API behind it.
7. Make complex relationships visual with a small diagram, state table,
   timeline, or Markdown wireframe. Always provide an adjacent textual
   equivalent and never rely on color or emoji alone.
8. Define a numeric, risk-derived test budget with distribution by behavior
   area, coverage expectations, integration/replay/race/security cases, and any
   required human UX evidence. A count alone is never sufficient.
9. Specify documentation deliverables for users, setup, configuration,
   operations/recovery, migration, and architecture as applicable.
10. Finish with observable acceptance scenarios, requirement traceability, an
    implementation sequence, and a Definition of Done containing every quality
    gate.

## Quality boundary

Be proportional: simple changes can mark sections not applicable with a reason.
Never omit architecture, testing, documentation, configuration, UX, security,
or operations merely because the implementation has not been designed yet.

Prefer realistic states, messages, and links in examples while clearly
distinguishing examples from fixed configuration. Keep the primary product view
plain and close to the user's language; place internal identifiers, provider
DTOs, stack traces, and low-level diagnostics in technical detail.

Do not declare a spec ready while a decision that can materially change
architecture, public behavior, data safety, or acceptance remains unresolved.
