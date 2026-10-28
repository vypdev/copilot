import { resolvePullRequestFinding } from '../resolve_pull_request_finding';
import { analyzeBugbotRevision } from '../analyze_bugbot_revision_use_case';
import { applyDetectedFindings } from '../apply_detected_findings';
import { parseBugbotFindingComments, collectPreviousBugbotFindings } from '../bugbot_finding_context';
import { buildPreviousFindingsContext } from '../bugbot_previous_findings_context';
import { BugbotReviewTelemetry } from '../bugbot_review_telemetry';
import { prepareBugbotFindings } from '../prepare_bugbot_findings';
import { buildMarker, buildResolvedFindingNote, parseMarker } from '../../../../../policies/bugbot_finding_marker_policy';
import { projectBugbotProviderEvidence } from '../../../../../policies/bugbot_provider_projection_policy';
import { buildBugbotReconciliationPlan } from '../../../../../policies/bugbot_reconciliation_policy';
import { PullRequestReviewOperationError } from '../../../../../ports/pull_request_review_errors';
import type { PullRequestReviewThreadState } from '../../../../../ports/pull_request_review_comment_ports';
import { countBugbotFindingStates } from '../../../../../../domain/bugbot/review_state';
import { DEFAULT_BUGBOT_REVIEW_CONFIGURATION } from '../../../../../../domain/bugbot/review_configuration';
import { decidePullRequestApproval, type ApprovalEvidence } from '../../../../../../domain/pull_request_approval';
import { DEFAULT_PULL_REQUEST_APPROVAL_POLICY } from '../../../../../../domain/pull_request_approval_policy';
import type { BugbotContext } from '../types';
import type { BugbotReviewOperationContext } from '../bugbot_review_operation_context';

const head = 'a'.repeat(40);
const base = 'b'.repeat(40);
const identity = 'PRRC_original';
const report = { id: 'old', title: 'Original finding', description: 'Original failure condition',
  file: 'src/a.ts', line: 1, severity: 'medium' };
const normalized = prepareBugbotFindings({ findings: [report] }, [], 'low', 20)!.toPublish[0];
const operation: BugbotReviewOperationContext = {
  repository: { owner: 'org', name: 'repo' }, target: { issueNumber: 7, isPullRequest: true,
    pullRequestNumber: 7, headBranch: 'bugfix/7', commitBranch: 'bugfix/7', baseBranch: 'develop', pullRequestAction: 'synchronize', draft: false },
  trigger: { kind: 'pull_request', headOwner: 'org' }, trustedAuthorLogin: 'bugbot',
  ignorePatterns: [], organizationRules: [], locale: { issue: 'en-US', pullRequest: 'en-US' },
  analysis: { agentConfiguration: { provider: 'codex', model: 'reviewer' },
    minimumSeverity: 'low', commentLimit: 20, reviewConfiguration: DEFAULT_BUGBOT_REVIEW_CONFIGURATION },
};

function harness(options: { resolved?: boolean; reason?: 'fixed' | 'obsolete' | 'dismissed'; author?: string; body?: string } = {}) {
  const native = [{ id: 1, identity, authorLogin: options.author ?? 'bugbot', path: 'src/a.ts',
    parentReviewIdentity: 'PRR_original', body: options.body ?? '## Original finding\n\n' + buildResolvedFindingNote(options.reason ?? 'dismissed') +
      buildMarker('old', true, normalized.fingerprint!, normalized.semanticFingerprint!, options.reason ?? 'dismissed') }];
  let thread = { resolved: options.resolved ?? false, resolvedByLogin: undefined as string | undefined };
  const update = jest.fn(async (_identity: string, body: string) => { native[0].body = body; });
  const resolve = jest.fn(async () => { thread = { resolved: true, resolvedByLogin: 'bugbot' }; });
  const unresolve = jest.fn(async () => { thread = { resolved: false, resolvedByLogin: undefined }; });
  const states = jest.fn(async (): Promise<Record<string, PullRequestReviewThreadState>> => ({ [identity]: { ...thread } }));
  const create = jest.fn();
  const comments = { listPullRequestReviewComments: jest.fn(async () => native),
    listPullRequestReviewThreadStates: states, updatePullRequestReviewComment: update,
    resolvePullRequestReviewThread: resolve, unresolvePullRequestReviewThread: unresolve,
    createReviewWithComments: create };
  const issueComments = { addComment: jest.fn(), updateComment: jest.fn() };
  function load(): BugbotContext {
    const parsed = parseBugbotFindingComments([], new Map([[7, native]]), 'bugbot',
      new Map([[7, { [identity]: { ...thread } }]]));
    const previous = buildPreviousFindingsContext(collectPreviousBugbotFindings([], parsed.existingByFindingId, parsed.prFindingIdToBody));
    return { ...parsed, selectionReason: 'event', coverage: { status: 'complete', sources: [] },
      canonicalPullRequest: { number: 7, state: 'open', draft: false, baseRepository: { owner: 'org', name: 'repo' },
        headRepositoryOwner: 'org', headRef: 'bugfix/7', headSha: head },
      eligibleResolutionIds: new Set(previous.selected.map(finding => finding.id)), previousFindingsBlock: previous.block,
      unresolvedFindingsWithBody: [...previous.selected], prContext: { prHeadSha: head,
        prFiles: [{ filename: 'src/a.ts', status: 'modified' }], pathToFirstDiffLine: { 'src/a.ts': 1 } } };
  }
  async function analyze(response: { findings: unknown[]; resolved_findings: unknown[] }, loaded = load()) {
    const query = jest.fn().mockResolvedValue({ outputLocale: 'en-US', ...response });
    const prepared = await analyzeBugbotRevision(operation, loaded, { agent: { query }, telemetry: new BugbotReviewTelemetry(operation) });
    expect(prepared).toBeDefined();
    return { loaded, prepared: prepared!, query };
  }
  async function apply(analysis: Awaited<ReturnType<typeof analyze>>) {
    return applyDetectedFindings(operation, analysis.loaded, analysis.prepared,
      { issueComments, pullRequestComments: comments }, { issueComments, pullRequestComments: comments });
  }
  function projection(analysis: Awaited<ReturnType<typeof analyze>>) {
    const provider = projectBugbotProviderEvidence({ trustedAuthorLogin: 'bugbot',
      activeFindings: analysis.prepared.activeFindings ?? [], existingByFindingId: analysis.loaded.existingByFindingId,
      snapshot: { verifiedHeadSha: head, linkedIssueComments: [], pullRequestComments: native,
        reviewThreads: { [identity]: thread }, reviews: [], conversationComments: [],
        completeness: { pullRequestComments: 'verified', reviewThreads: 'verified', reviews: 'verified',
          conversation: 'verified', linkedIssueComments: 'verified', navigation: 'not-applicable' } } });
    const plan = buildBugbotReconciliationPlan({ providerProjection: provider,
      existingByFindingId: analysis.loaded.existingByFindingId, previousFindingTitles: new Map([['old', 'Original finding']]),
      activeFindings: analysis.prepared.activeFindings ?? [], expectedPublishedFindings: analysis.prepared.toPublish,
      coverage: analysis.loaded.coverage });
    return { ...provider, findings: plan.findings };
  }
  return { native, comments, update, resolve, unresolve, states, create, load, analyze, apply, projection,
    setThread: (resolved: boolean, resolver?: string) => { thread = { resolved, resolvedByLogin: resolver }; } };
}

function approval(findings: ReturnType<ReturnType<typeof harness>['projection']>['findings'], change: Partial<ApprovalEvidence> = {}) {
  const counts = countBugbotFindingStates(findings.map(finding => finding.state));
  const evidence: ApprovalEvidence = {
    repositoryId: 1, pullNumber: 7, headSha: head, baseSha: base, testedMergeSha: 'c'.repeat(40),
    mergeCommitVerified: true, baseRef: 'develop', targetRole: 'development', branchKind: 'bugfix',
    linkedIssue: true, open: true, draft: false, sameRepository: true, authorId: 10, authorIsBot: false,
    botUserId: 20, changedPaths: ['src/a.ts'], filesComplete: true, rulesReadable: true,
    dismissesStaleReviews: true, requiredChecks: ['CI Check'],
    checks: [{ name: 'CI Check', sourceAppId: 15368, workflowName: 'CI Check', headSha: head,
      conclusion: 'success', status: 'completed', runId: 50, attempt: 1 }],
    bugbot: { headSha: head, outcome: 'complete', coverage: 'complete', open: counts.open,
      reopened: counts.reopened, dismissed: counts.dismissed, verificationRequired: counts['verification-required'], unknown: counts.unknown },
    bugbotSeverity: 'info', bugbotDryRun: false, reviews: [], reviewHistoryComplete: true, ...change,
  };
  return decidePullRequestApproval({ ...DEFAULT_PULL_REQUEST_APPROVAL_POLICY, mode: 'guarded', producerAttested: true,
    testChecks: [{ name: 'CI Check', sourceAppId: 15368, workflowName: 'CI Check' }],
    coverage: { mode: 'check', checkName: 'CI Check' }, allowHumanDismissed: false }, evidence);
}

describe('reopened dismissal reconciliation (#700)', () => {
  it.each(['fixed', 'obsolete'] as const)('adjudicates a withdrawn dismissal as %s without another human dismissal', async reason => {
    const h = harness();
    const analysis = await h.analyze({ findings: [], resolved_findings: [{ id: 'old', resolution: reason }] });
    expect(analysis.query.mock.calls[0][0].prompt).toContain('old');
    expect(analysis.prepared.resolvedFindingIds).toEqual(new Set(['old']));
    expect(await h.apply(analysis)).toEqual([]);
    expect(parseMarker(h.native[0].body)[0]).toMatchObject({ findingId: 'old', resolved: true, resolution: reason });
    expect(h.native[0].body).toContain('## Original finding');
    expect(h.update.mock.invocationCallOrder[0]).toBeLessThan(h.resolve.mock.invocationCallOrder[0]);
    const projected = h.projection(analysis);
    expect(projected.findings[0].state).toBe(reason);
    expect(approval(projected.findings).status).toBe('eligible');
    expect(approval(projected.findings, { checks: [] }).code).toBe('check-missing');
    expect(h.create).not.toHaveBeenCalled();
  });

  it('publishes the still-active retained finding into the original reopened thread', async () => {
    const h = harness();
    const analysis = await h.analyze({ findings: [report], resolved_findings: [] });
    expect(analysis.prepared.toPublish).toHaveLength(1);
    expect(await h.apply(analysis)).toEqual([]);
    expect(parseMarker(h.native[0].body)[0].resolved).toBe(false);
    expect(h.projection(analysis).findings[0].state).toBe('reopened');
    expect(approval(h.projection(analysis).findings).code).toBe('bugbot-findings');
    expect(h.resolve).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });

  it('does not infer a fix from omission of the retained finding', async () => {
    const h = harness();
    const original = h.native[0].body;
    const analysis = await h.analyze({ findings: [], resolved_findings: [] });
    expect(await h.apply(analysis)).toEqual([]);
    expect(h.native[0].body).toBe(original);
    expect(h.projection(analysis).findings[0].state).toBe('verification-required');
    expect(approval(h.projection(analysis).findings).code).toBe('bugbot-findings');
    expect(h.resolve).not.toHaveBeenCalled();
  });

  it('preserves an untouched human dismissal despite active and resolved model claims', async () => {
    const h = harness({ resolved: true });
    h.setThread(true, 'maintainer');
    const original = h.native[0].body;
    const analysis = await h.analyze({ findings: [report], resolved_findings: [{ id: 'old', resolution: 'fixed' }] });
    expect(await h.apply(analysis)).toEqual([]);
    expect(h.native[0].body).toBe(original);
    expect(h.projection(analysis).findings[0].state).toBe('dismissed');
    expect(approval(h.projection(analysis).findings).code).toBe('bugbot-findings');
    expect(h.update).not.toHaveBeenCalled();
    expect(h.unresolve).not.toHaveBeenCalled();
  });


  it.each(['fixed', 'active'] as const)('preserves a human dismissal renewed during %s analysis', async result => {
    const h = harness();
    const analysis = await h.analyze(result === 'fixed'
      ? { findings: [], resolved_findings: [{ id: 'old', resolution: 'fixed' }] }
      : { findings: [report], resolved_findings: [] });
    h.setThread(true, 'maintainer');
    const original = h.native[0].body;
    expect(await h.apply(analysis)).toEqual([]);
    expect(h.native[0].body).toBe(original);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.unresolve).not.toHaveBeenCalled();
    expect(h.projection(analysis).findings[0].state).toBe('dismissed');
    expect(approval(h.projection(analysis).findings).code).toBe('bugbot-findings');
  });

  it.each(['fixed', 'active'] as const)('fails closed when a custom %s adapter cannot revalidate native reopening', async result => {
    const h = harness();
    const analysis = await h.analyze(result === 'fixed'
      ? { findings: [], resolved_findings: [{ id: 'old', resolution: 'fixed' }] }
      : { findings: [report], resolved_findings: [] });
    Reflect.deleteProperty(h.comments, 'listPullRequestReviewThreadStates');
    expect(await h.apply(analysis)).toHaveLength(1);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.resolve).not.toHaveBeenCalled();
  });

  it('keeps verification required when fresh provider facts omit the original thread', async () => {
    const h = harness();
    const analysis = await h.analyze({ findings: [], resolved_findings: [{ id: 'old', resolution: 'obsolete' }] });
    h.states.mockResolvedValueOnce({});
    expect(await h.apply(analysis)).toHaveLength(1);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.resolve).not.toHaveBeenCalled();
    expect(h.projection(analysis).findings[0].state).toBe('verification-required');
  });

  it('retries a failed native read without changing the marker or duplicating its review', async () => {
    const h = harness();
    const original = h.native[0].body;
    const response = { findings: [], resolved_findings: [{ id: 'old', resolution: 'fixed' }] };
    const analysis = await h.analyze(response);
    h.states.mockRejectedValueOnce(new PullRequestReviewOperationError('list-threads', { providerStatus: 503 }));
    expect(await h.apply(analysis)).toHaveLength(1);
    expect(h.native[0].body).toBe(original);
    expect(await h.apply(await h.analyze(response))).toEqual([]);
    expect(h.projection(analysis).findings[0].state).toBe('fixed');
    expect(h.create).not.toHaveBeenCalled();
  });

  it('retains the new marker after a failed native resolve and converges on replay', async () => {
    const h = harness();
    const response = { findings: [], resolved_findings: [{ id: 'old', resolution: 'fixed' }] };
    h.resolve.mockRejectedValueOnce(new PullRequestReviewOperationError('resolve-thread', { providerStatus: 503 }));
    const first = await h.analyze(response);
    expect(await h.apply(first)).toHaveLength(1);
    expect(parseMarker(h.native[0].body)[0].resolution).toBe('fixed');
    expect(h.projection(first).findings[0].state).toBe('verification-required');
    const replay = await h.analyze(response);
    expect(await h.apply(replay)).toEqual([]);
    expect(h.projection(replay).findings[0].state).toBe('fixed');
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.native).toHaveLength(1);
    expect(h.create).not.toHaveBeenCalled();
  });

  it('does not resolve the thread when the durable marker update fails', async () => {
    const h = harness();
    const original = h.native[0].body;
    const response = { findings: [], resolved_findings: [{ id: 'old', resolution: 'obsolete' }] };
    h.update.mockRejectedValueOnce(new PullRequestReviewOperationError('update-comment', { providerStatus: 403 }));
    expect(await h.apply(await h.analyze(response))).toHaveLength(1);
    expect(h.native[0].body).toBe(original);
    expect(h.resolve).not.toHaveBeenCalled();
    const replay = await h.analyze(response);
    expect(await h.apply(replay)).toEqual([]);
    expect(h.projection(replay).findings[0].state).toBe('obsolete');
  });

  it('reconciles a previously fixed marker after explicit human reopening', async () => {
    const h = harness({ reason: 'fixed' });
    const analysis = await h.analyze({ findings: [], resolved_findings: [{ id: 'old', resolution: 'fixed' }] });
    expect(await h.apply(analysis)).toEqual([]);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.projection(analysis).findings[0].state).toBe('fixed');
  });

  it('refreshes a reopened fixed marker when verification shows it is now obsolete', async () => {
    const h = harness({ reason: 'fixed' });
    const analysis = await h.analyze({ findings: [], resolved_findings: [{ id: 'old', resolution: 'obsolete' }] });
    expect(await h.apply(analysis)).toEqual([]);
    expect(h.projection(analysis).findings[0].state).toBe('obsolete');
    expect(h.states).toHaveBeenCalledWith(7);
  });

  it.each(['missing', 'malformed', 'ambiguous'] as const)('does not mutate a retained finding whose fresh marker is %s', async form => {
    const h = harness();
    const analysis = await h.analyze({ findings: [], resolved_findings: [{ id: 'old', resolution: 'fixed' }] });
    h.native[0].body = form === 'missing' ? 'Original comment without a marker'
      : form === 'malformed' ? '<!-- copilot-bugbot finding_id:"old" resolved:invalid -->'
      : h.native[0].body + '\n' + buildMarker('old', true, normalized.fingerprint!, normalized.semanticFingerprint!, 'fixed');
    expect(await h.apply(analysis)).toHaveLength(1);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.resolve).not.toHaveBeenCalled();
    expect(approval(h.projection(analysis).findings).code).toBe('bugbot-findings');
  });

  it('does not grant resolution authority to a marker posted by another author', async () => {
    const h = harness({ author: 'contributor' });
    const analysis = await h.analyze({ findings: [], resolved_findings: [{ id: 'old', resolution: 'fixed' }] });
    expect(analysis.loaded.eligibleResolutionIds.size).toBe(0);
    expect(analysis.prepared.resolvedFindingIds.size).toBe(0);
    expect(await h.apply(analysis)).toEqual([]);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.resolve).not.toHaveBeenCalled();
  });

  it('cannot resolve an omitted finding even when the model claims a fix', async () => {
    const h = harness();
    const loaded = h.load();
    loaded.eligibleResolutionIds = new Set();
    const analysis = await h.analyze({ findings: [], resolved_findings: [{ id: 'old', resolution: 'fixed' }] }, loaded);
    expect(await h.apply(analysis)).toEqual([]);
    expect(h.projection(analysis).findings[0].state).toBe('verification-required');
    expect(h.resolve).not.toHaveBeenCalled();
  });

  it('keeps the retained active finding actionable when the model also claims a resolution', async () => {
    const h = harness();
    const analysis = await h.analyze({ findings: [report], resolved_findings: [{ id: 'old', resolution: 'fixed' }] });
    expect(analysis.prepared.resolvedFindingIds.size).toBe(0);
    expect(await h.apply(analysis)).toEqual([]);
    expect(h.projection(analysis).findings[0].state).toBe('reopened');
    expect(h.resolve).not.toHaveBeenCalled();
  });

  it('does not use a verified fixed finding to bypass incomplete review evidence', async () => {
    const h = harness();
    const analysis = await h.analyze({ findings: [], resolved_findings: [{ id: 'old', resolution: 'fixed' }] });
    expect(await h.apply(analysis)).toEqual([]);
    const projected = h.projection(analysis);
    expect(approval(projected.findings, { bugbot: { headSha: head, outcome: 'partial', coverage: 'partial',
      open: 0, reopened: 0, dismissed: 0, verificationRequired: 0, unknown: 0 } }).code).toBe('bugbot-incomplete');
  });



  it('preserves a new durable dismissal that supersedes an analyzed active marker', async () => {
    const h = harness({ body: buildMarker('old', false, normalized.fingerprint!, normalized.semanticFingerprint!) });
    const analysis = await h.analyze({ findings: [], resolved_findings: [{ id: 'old', resolution: 'fixed' }] });
    h.native[0].body = buildResolvedFindingNote('dismissed') +
      buildMarker('old', true, normalized.fingerprint!, normalized.semanticFingerprint!, 'dismissed');
    h.setThread(true, 'maintainer');
    expect(await h.apply(analysis)).toEqual([]);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.resolve).not.toHaveBeenCalled();
    expect(h.projection(analysis).findings[0].state).toBe('dismissed');
  });

  it('requires an explicit adjudicated reason before replacing a dismissed marker', async () => {
    const h = harness();
    await resolvePullRequestFinding(h.comments, { findingId: 'old', commentIdentity: identity,
      pullRequestNumber: 7, reopened: true });
    expect(h.update).not.toHaveBeenCalled();
    expect(h.resolve).not.toHaveBeenCalled();
  });

});
