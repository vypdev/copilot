# Bugbot #950 verification evidence

[Issue #950](https://github.com/vypdev/copilot/issues/950) ·
[Pull request #951](https://github.com/vypdev/copilot/pull/951) ·
[27-issue traceability](traceability.md)

## Current controls

Run the model-free verification, profile configuration, EV-07 gate and
status card tests from the repository root. The EV-07 entry points retain
their exact fixture and scorer dependencies. The normal-flow runner keeps
its default subject manifest. Its historical evaluator is available in the
tagged checkout below.

```sh
pnpm run test:bugbot-shadow-verification
```

[Packaged status-card canary](status-card-publication/README.md#packaged-action) ·
[Native review and Commit backlink](review-progress-follow-up.md)

## EV-07 decision

The [qualification protocol](ev07-shadow/preregistration.md) binds the
model profile, independent corpus and full-review admission criteria.
The most recent measured report records **87.95%** precision on all 174
cases against the **90%** gate, with zero write attempts to the evaluated
PRs. All 42 paired review slots remained unstarted. The measured Luna →
Sol profile remains unqualified. Production verification is disabled.
[Measured preregistration](https://github.com/vypdev/copilot/pull/951#issuecomment-6969861466) ·
[Measured report](https://github.com/vypdev/copilot/pull/951#issuecomment-6970090972)

## Historical evidence

The archive points to `9e9f1536f38dec12d330ac631c786a9625548833`, the last
published head containing all pilots. The frozen protocols, runners,
manifests, scores and per-attempt ledgers retain their original byte
contents and source history.
[Git tag](https://github.com/vypdev/copilot/tree/bugbot-950-pilot-evidence/quality/bugbot/evidence/issue-950)

The Action checks the selected [owning SDD](../../../../specs/bugbot-analysis-publication-and-autofix.md)
against its published bytes. Its relative historical report links lead to
short archive entries. The original manifest remains at its selected path.

```sh
git fetch origin tag bugbot-950-pilot-evidence
git worktree add --detach ../copilot-950-pilot-evidence 9e9f1536f38dec12d330ac631c786a9625548833
```

Read the applicable protocol in that checkout for the original fixture
pins, checksum validation and dry-run commands. Run historical controls
that execute fixture code inside the isolated evaluator environment.
[V4 evidence](https://github.com/vypdev/copilot/blob/9e9f1536f38dec12d330ac631c786a9625548833/quality/bugbot/evidence/issue-950/v4/results.md) ·
[On-demand evidence](https://github.com/vypdev/copilot/blob/9e9f1536f38dec12d330ac631c786a9625548833/quality/bugbot/evidence/issue-950/on-demand/results.md)
