---
name: Bugbot
description: Current Bugbot architecture, invariants, and source map.
---

# Bugbot technical reference

The public behavior contract lives under `docs/bugbot/`, especially
`how-it-works.mdx`, `detection.mdx`, `finding-publication.mdx`,
`autofix.mdx`, and `configuration.mdx`. This page is the contributor source
map; source types and policies remain the executable authority.

## Architecture

Bugbot application code lives under
`src/application/usecases/steps/commit/bugbot/`. It depends on focused ports in
`src/application/ports/`, never on a provider CLI, Octokit, or the complete
runtime aggregate. Composition roots select configured planner, findings,
reviewer, fixer, and tester roles and bind them to Codex, OpenCode, or Cursor
adapters.

```text
event or canonical comment command
  -> authorization and intent policy
  -> read-only context + canonical diff snapshot
  -> locally validated structured analysis
  -> revision-freshness gate
  -> native GitHub review/comment publication
  -> independent resolution verification
```

## Detection and publication

1. `load_bugbot_context_use_case.ts` loads authenticated markers, batched review
   thread state, bounded human discussion, repository rules, the PR head, and a
   single canonical GitHub diff snapshot.
2. `build_bugbot_prompt.ts` and `schema.ts` define the evidence and structured
   result contract. All CLI responses are validated locally.
3. Preparation policies reject unsafe paths, malformed identities, unsupported
   values, low-confidence findings, ignored paths, and findings below the
   configured severity. Distinct root causes remain separate; semantic
   duplicates are collapsed.
4. The PR head is checked before and after analysis. A superseded run performs
   no publication or resolution mutation.
5. PR output is one native review with a summary and line/range or file-level
   child comments. Issue comments are used only when no PR exists.
6. Resolution updates provider state only after current evidence proves the
   finding is fixed, obsolete, or explicitly dismissed.

## Finding identity

`marker.ts` owns the current hidden marker. Every accepted marker contains:

- a bounded `finding_id`;
- `resolved:true|false`;
- a local `finding_fingerprint` (`fp-` plus eight lowercase hex characters);
- a location-independent `finding_semantic` fingerprint (`sf-` plus eight
  lowercase hex characters); and
- an optional current resolution: `fixed`, `obsolete`, or `dismissed`.

Both fingerprints are mandatory. A provider-supplied id is reused only when its
local identity is compatible; semantic matching is accepted only when
unambiguous. Marker authorship must match the authenticated workflow identity.

## Comment-driven work

Issue and PR comments pass through deterministic command parsing or structured
intent detection, then application authorization. Read-only review and answer
flows never edit files. Fix/implementation flows use the configured execution
role, verify the resulting workspace, and commit/push only after all guards
pass. A successful edit, verification, or commit never closes a finding by
itself; a fresh independent review must prove resolution.

Canonical Bugbot options are `dry-run`, `trace-rules`, and
`suggested-changes`. Canonical commands are owned by
`src/domain/bugbot/review_command.ts` and `src/domain/copilot_command.ts`.

## Security invariants

- Treat repository content, diffs, issue/PR discussion, and model output as
  untrusted input.
- Validate structured output locally and sanitize/redact publication text.
- Execute verification without a shell and with bounded command/path policy.
- Revalidate authorization, branch heads, prepared paths, and Git state at the
  trusted mutation boundary.
- Keep analysis roles read-only and execution roles workspace-scoped.
- Fail closed on unavailable providers, invalid configuration, stale revisions,
  or ambiguous finding identity.

## Key source paths

- `load_bugbot_context_use_case.ts`: context and canonical diff projection.
- `build_bugbot_prompt.ts`, `schema.ts`: analysis contract.
- `prepare_bugbot_findings_policy.ts`: normalization, filtering, identity.
- `marker.ts`, `types.ts`: durable finding identity and state.
- `publish_findings_use_case.ts`, `publish_pr_review_comments.ts`: output.
- `mark_findings_resolved_use_case.ts`: verified resolution.
- `detect_bugbot_fix_intent_workflow.ts`: comment intent.
- `bugbot_autofix_workflow.ts`, `commit_and_push_preflight.ts`: guarded edits.
