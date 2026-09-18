import { decidePullRequestApproval, isDocumentationOnlyDiff, type ApprovalEvidence } from '../pull_request_approval';
import { DEFAULT_PULL_REQUEST_APPROVAL_POLICY, parsePullRequestApprovalPolicy, validatePullRequestApprovalPolicy, type PullRequestApprovalPolicy } from '../pull_request_approval_policy';

const head = 'a'.repeat(40);
const base = 'b'.repeat(40);
const testedMerge = 'c'.repeat(40);
const policy: PullRequestApprovalPolicy = {
  version: 1, mode: 'guarded', targetRoles: ['development'], branchKinds: ['feature'],
  requireLinkedIssue: true, additionalExcludedPaths: [],
  producerAttested: true,
  testChecks: [{ name: 'CI Check', sourceAppId: 15368, workflowName: 'CI Check' }],
  coverage: { mode: 'check', checkName: 'CI Check' },
  allowHumanDismissed: false, skipWhenHumanApproved: true,
};
const evidence = (): ApprovalEvidence => ({
  repositoryId: 1, pullNumber: 42, headSha: head, baseSha: base, testedMergeSha: testedMerge,
  mergeCommitVerified: true, baseRef: 'develop',
  targetRole: 'development', branchKind: 'feature', linkedIssue: true,
  open: true, draft: false, sameRepository: true, authorId: 10, authorIsBot: false, botUserId: 20,
  changedPaths: ['src/feature.ts'], filesComplete: true,
  rulesReadable: true, dismissesStaleReviews: true, requiredChecks: ['CI Check'],
  checks: [{ name: 'CI Check', sourceAppId: 15368, workflowName: 'CI Check', headSha: head,
    conclusion: 'success', status: 'completed', runId: 50, attempt: 1 }],
  bugbot: { headSha: head, outcome: 'complete', coverage: 'complete', open: 0,
    reopened: 0, dismissed: 0, verificationRequired: 0, unknown: 0 },
  bugbotSeverity: 'info', bugbotDryRun: false,
  reviews: [], reviewHistoryComplete: true,
});

describe('guarded PR approval policy', () => {
  it('defaults a new setup to recommendation without a native review', () => {
    expect(DEFAULT_PULL_REQUEST_APPROVAL_POLICY.mode).toBe('recommend');
  });
  it('keeps an absent runtime Variable off', () => {
    expect(parsePullRequestApprovalPolicy(undefined).mode).toBe('off');
  });
  it('accepts one exact producer and round-trips a valid policy', () => {
    expect(validatePullRequestApprovalPolicy(policy)).toEqual([]);
    expect(parsePullRequestApprovalPolicy(JSON.stringify(policy))).toEqual(policy);
  });
  it.each([
    [{ ...policy, version: 2 }, 'version'],
    [{ ...policy, targetRoles: ['development', 'development'] }, 'targetRoles'],
    [{ ...policy, branchKinds: ['release'] }, 'branchKinds'],
    [{ ...policy, additionalExcludedPaths: ['../secret'] }, 'additionalExcludedPaths'],
    [{ ...policy, testChecks: [] }, 'test checks'],
    [{ ...policy, coverage: { mode: 'check', checkName: 'Other' } }, 'checkName'],
    [{ ...policy, rogue: true }, 'Unknown'],
  ])('rejects an invalid policy field', (invalid, marker) => {
    expect(validatePullRequestApprovalPolicy(invalid).join(' ')).toContain(marker);
  });
  it('rejects malformed and oversized runtime JSON', () => {
    expect(() => parsePullRequestApprovalPolicy('{')).toThrow('valid JSON');
    expect(() => parsePullRequestApprovalPolicy(' '.repeat(16_385))).toThrow('16 KiB');
  });
  it('accepts complete current-head evidence only', () => {
    expect(decidePullRequestApproval(policy, evidence()).status).toBe('eligible');
  });
  it.each([
    [{ draft: true }, 'unsupported-pr'],
    [{ sameRepository: false }, 'unsupported-pr'],
    [{ filesComplete: false }, 'unsupported-pr'],
    [{ authorIsBot: true }, 'bot-author'],
    [{ authorId: 20 }, 'bot-author'],
    [{ linkedIssue: false }, 'scope'],
    [{ changedPaths: ['.github/workflows/ci.yml'] }, 'protected-path'],
    [{ changedPaths: ['build/github_action/index.js'] }, 'protected-path'],
    [{ ignoredChangedPaths: ['src/feature.ts'] }, 'bugbot-ignored-path'],
    [{ rulesReadable: false }, 'unsafe-rules'],
    [{ dismissesStaleReviews: false }, 'unsafe-rules'],
    [{ mergeCommitVerified: false }, 'merge-ref-unavailable'],
    [{ requiredChecks: ['Copilot / Approval'] }, 'approval-check-cycle'],
    [{ requiredChecks: ['CI Check', 'Security Scan'] }, 'check-producer-unconfigured'],
    [{ bugbotSeverity: 'low' }, 'bugbot-configuration'],
    [{ bugbotDryRun: true }, 'bugbot-configuration'],
    [{ checks: [] }, 'check-missing'],
    [{ bugbot: undefined }, 'bugbot-missing'],
    [{ reviewHistoryComplete: false }, 'reviews-unavailable'],
  ])('does not approve when a fixed prerequisite fails', (change, code) => {
    expect(decidePullRequestApproval(policy, { ...evidence(), ...change }).code).toBe(code);
  });
  it.each(['failure', 'neutral', 'skipped', 'cancelled'])('blocks a non-success CI conclusion: %s', conclusion => {
    const current = evidence();
    const checks = [{ ...current.checks[0], conclusion }];
    expect(decidePullRequestApproval(policy, { ...current, checks }).code).toBe('check-failed');
  });
  it('blocks a wrong App and a superseding failed retry', () => {
    const current = evidence();
    expect(decidePullRequestApproval(policy, { ...current,
      checks: [{ ...current.checks[0], sourceAppId: 2 }],
    }).code).toBe('check-source');
    expect(decidePullRequestApproval(policy, { ...current,
      checks: [...current.checks, { ...current.checks[0], runId: 51, conclusion: 'failure' }],
    }).code).toBe('check-failed');
  });
  it('accepts CI on the verified test merge and prefers its failure over a head-only success', () => {
    const current = evidence();
    const mergeCheck = { ...current.checks[0], headSha: testedMerge, runId: 51 };
    expect(decidePullRequestApproval(policy, { ...current, checks: [mergeCheck] }).status).toBe('eligible');
    expect(decidePullRequestApproval(policy, { ...current, checks: [current.checks[0], { ...mergeCheck, conclusion: 'failure' }] }).code)
      .toBe('check-failed');
  });
  it.each(['partial', 'failed', 'superseded', 'dry-run'])('rejects incomplete Bugbot evidence: %s', outcome => {
    const current = evidence();
    expect(decidePullRequestApproval(policy, { ...current, bugbot: { ...current.bugbot!, outcome } }).code).toBe('bugbot-incomplete');
  });
  it('blocks unknown and dismissed findings by default', () => {
    const current = evidence();
    expect(decidePullRequestApproval(policy, { ...current, bugbot: { ...current.bugbot!, unknown: 1 } }).code).toBe('bugbot-findings');
    expect(decidePullRequestApproval(policy, { ...current, bugbot: { ...current.bugbot!, dismissed: 1 } }).code).toBe('bugbot-findings');
    expect(decidePullRequestApproval({ ...policy, allowHumanDismissed: true }, {
      ...current, bugbot: { ...current.bugbot!, dismissed: 1 },
    }).status).toBe('eligible');
  });
  it('does not repeat a dismissed or existing bot review', () => {
    const current = evidence();
    const review = { id: 5, userId: 20, state: 'APPROVED', commitId: head, submittedAt: '2026-01-01T00:00:00Z' };
    expect(decidePullRequestApproval(policy, { ...current, reviews: [review] }).status).toBe('already-approved');
    expect(decidePullRequestApproval(policy, { ...current, reviews: [{ ...review, state: 'DISMISSED' }] }).code).toBe('approval-dismissed');
    expect(decidePullRequestApproval(policy, { ...current, reviews: [review, { ...review, id: 6, state: 'DISMISSED' }] }).code).toBe('approval-dismissed');
    expect(decidePullRequestApproval(policy, { ...current, reviews: [review,
      { ...review, id: 6, state: 'COMMENTED', submittedAt: '2026-01-02T00:00:00Z' },
    ] }).code).toBe('existing-approval');
  });
  it('respects active human change requests and avoids a redundant human-approved review', () => {
    const current = evidence();
    const review = { id: 5, userId: 30, state: 'CHANGES_REQUESTED', commitId: head, submittedAt: '2026-01-01T00:00:00Z' };
    expect(decidePullRequestApproval(policy, { ...current, reviews: [review] }).code).toBe('changes-requested');
    expect(decidePullRequestApproval(policy, { ...current, reviews: [{ ...review, state: 'APPROVED' }] }).code).toBe('human-approved');
  });
  it('supports recommendation mode and strict numeric diff coverage', () => {
    const current = evidence();
    expect(decidePullRequestApproval({ ...policy, mode: 'recommend' }, current).code).toBe('recommend-mode');
    const numeric: PullRequestApprovalPolicy = { ...policy, coverage: {
      mode: 'numeric', checkName: 'CI Check', minDiffPercent: 80, artifactWorkflowName: 'CI Check', reporterAttested: true,
    } };
    expect(decidePullRequestApproval(numeric, current).code).toBe('coverage-evidence');
    expect(decidePullRequestApproval(numeric, { ...current, numericCoverage: {
      headSha: head, baseSha: base, coveredChangedLines: 7, totalChangedLines: 10,
    } }).code).toBe('coverage-low');
    expect(decidePullRequestApproval(numeric, { ...current, numericCoverage: {
      headSha: head, baseSha: base, coveredChangedLines: 8, totalChangedLines: 10,
    } }).status).toBe('eligible');
  });
  it('exempts only a completely classified documentation diff from numeric line coverage', () => {
    const numeric: PullRequestApprovalPolicy = { ...policy, coverage: {
      mode: 'numeric', checkName: 'CI Check', minDiffPercent: 80, artifactWorkflowName: 'CI Check', reporterAttested: true,
    } };
    expect(isDocumentationOnlyDiff(['docs/feature.mdx', 'README.md'])).toBe(true);
    expect(isDocumentationOnlyDiff([])).toBe(false);
    expect(isDocumentationOnlyDiff(['docs/feature.mdx', 'src/example.ts'])).toBe(false);
    expect(isDocumentationOnlyDiff(['docs/hidden.ts'])).toBe(false);
    expect(decidePullRequestApproval(numeric, { ...evidence(), changedPaths: ['docs/feature.mdx'] }).status).toBe('eligible');
    expect(decidePullRequestApproval(numeric, { ...evidence(), changedPaths: ['docs/feature.mdx', 'src/example.ts'] }).code)
      .toBe('coverage-evidence');
  });
});
