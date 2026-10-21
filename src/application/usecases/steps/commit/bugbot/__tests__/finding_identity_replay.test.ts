import { buildCommentBody, parseMarker } from '../../../../../policies/bugbot_finding_marker_policy';
import { toPullRequestReviewOperationError } from '../../../../../../data/repository/pull_request/pull_request_review_error_metadata';
import { DEFAULT_BUGBOT_REVIEW_CONFIGURATION } from '../../../../../../domain/bugbot/review_configuration';
import type { PullRequestReviewComment, PullRequestReviewCommentDraft, PullRequestReviewSummary } from '../../../../../ports/pull_request_review_comment_ports';
import { analyzeBugbotRevision } from '../analyze_bugbot_revision_use_case';
import { applyDetectedFindings } from '../apply_detected_findings';
import { parseBugbotFindingComments } from '../bugbot_finding_context';
import { BugbotReviewTelemetry } from '../bugbot_review_telemetry';
import { prepareBugbotFindings } from '../prepare_bugbot_findings';
import { publishFindings } from '../publish_findings_use_case';
import { reconcileBugbotReviewState } from '../reconcile_bugbot_review_state_use_case';
import type { BugbotReviewOperationContext } from '../bugbot_review_operation_context';
import type { BugbotContext } from '../types';

const head = 'a'.repeat(40);
const oldId = 'ui/src/model.ts:73:operations-empty';
const raw = { id: oldId, title: 'Recent operations can be mislabeled as an empty dashboard',
  description: 'Stored operations must make the dashboard nonempty.', file: 'ui/src/model.ts', line: 73,
  category: 'correctness', symbol: 'hasStoredData', codeSnippet: 'return snapshot.total > 0;' };
const old = prepareBugbotFindings({ findings: [raw] }, [], 'low', 20)!.toPublish[0];
const current = { ...raw, id: 'ui/src/model.ts:72:empty-state-ignores-stored-records', line: 72,
  title: 'Stored operations and library entries are classified as empty' };
const operation: BugbotReviewOperationContext = {
  repository: { owner: 'org', name: 'repo' },
  target: { issueNumber: -1, isPullRequest: true, pullRequestNumber: 1, headBranch: 'feature',
    commitBranch: 'feature', baseBranch: 'develop', pullRequestAction: 'synchronize', draft: false },
  trigger: { kind: 'pull_request', headOwner: 'org' }, trustedAuthorLogin: 'bugbot',
  ignorePatterns: [], organizationRules: [], locale: { issue: 'en-US', pullRequest: 'en-US' },
  analysis: { agentConfiguration: { provider: 'codex', model: 'reviewer' }, minimumSeverity: 'low',
    commentLimit: 20, reviewConfiguration: DEFAULT_BUGBOT_REVIEW_CONFIGURATION },
};

function harness(resolved = false) {
  const comments: PullRequestReviewComment[] = [{ id: 1, identity: 'PRRC_1', authorLogin: 'bugbot',
    parentReviewIdentity: '77', url: 'https://github.com/org/repo/pull/1#discussion_r1',
    body: buildCommentBody(old, resolved) }];
  const thread = { resolved, resolvedByLogin: 'bugbot' };
  const reviews: PullRequestReviewSummary[] = [{ identity: '77', authorLogin: 'bugbot', commitId: head,
    body: '## 🤖 Bugbot review snapshot\n\nOriginal report.' }];
  const status: Array<{ id: number; body: string; user: { login: string } }> = [];
  const createReviewWithComments = jest.fn(async (_pr: number, _head: string, body: string, drafts: PullRequestReviewCommentDraft[]) => {
    reviews.push({ identity: '88', authorLogin: 'bugbot', commitId: head, body });
    for (const draft of drafts) {
      const id = comments.length + 1;
      comments.push({ id, identity: `PRRC_${id}`, authorLogin: 'bugbot', parentReviewIdentity: '88',
        body: draft.body, url: `https://github.com/org/repo/pull/1#discussion_r${id}` });
    }
    return { identity: '88' };
  });
  const updatePullRequestReviewComment = jest.fn(async (identity: string, body: string) => {
    comments.find((comment) => comment.identity === identity)!.body = body;
  });
  const unresolvePullRequestReviewThread = jest.fn(async () => { thread.resolved = false; });
  const resolvePullRequestReviewThread = jest.fn(async () => { thread.resolved = true; });
  const publication = { issueComments: { addComment: jest.fn(), updateComment: jest.fn() },
    pullRequestComments: { createReviewWithComments, updatePullRequestReviewComment, unresolvePullRequestReviewThread } };
  const resolution = { issueComments: { updateComment: jest.fn() }, pullRequestComments: {
    listPullRequestReviewComments: async () => comments, updatePullRequestReviewComment,
    unresolvePullRequestReviewThread, resolvePullRequestReviewThread } };
  const threads = () => Object.fromEntries(comments.map((comment) => [comment.identity,
    comment.identity === 'PRRC_1' ? thread : { resolved: false }]));
  const load = (): BugbotContext => ({
    existingByFindingId: parseBugbotFindingComments([], new Map([[1, comments]]), 'bugbot',
      new Map([[1, threads()]])).existingByFindingId,
    issueComments: [], selectionReason: 'event', coverage: { status: 'complete', sources: [] },
    eligibleResolutionIds: new Set([oldId]), previousFindingsBlock: '',
    unresolvedFindingsWithBody: [{ id: oldId, fullBody: comments[0].body! }],
    canonicalPullRequest: { number: 1, state: 'open', draft: false, baseRepository: { owner: 'org', name: 'repo' },
      headRepositoryOwner: 'org', headRef: 'feature', headSha: head },
    prContext: { prHeadSha: head, prFiles: [{ filename: raw.file, status: 'modified' }],
      pathToFirstDiffLine: { [raw.file]: 72 }, pathToDiffLocations: { [raw.file]: [{ line: 72, side: 'RIGHT' }] } },
  });
  const reconcile = (loadedContext: BugbotContext, findings = [current], errors: readonly Error[] = []) =>
    reconcileBugbotReviewState({
      target: { pullRequestNumber: 1, analyzedHeadSha: head, trustedAuthorLogin: 'bugbot', locale: 'en-US' },
      loadedContext,
      activeFindings: prepareBugbotFindings({ findings }, [], 'low', 20)!.toPublish,
      mutationErrors: errors,
      snapshotPorts: {
        getPullRequestHeadSha: async () => head,
        listPullRequestReviewComments: async () => comments,
        listPullRequestReviewThreadStates: async () => threads(),
        listPullRequestReviews: async () => reviews,
        listIssueComments: async () => status,
        navigationForPullRequest: () => ({ pullRequestUrl: 'https://github.com/org/repo/pull/1',
          commitUrl: `https://github.com/org/repo/commit/${head}` }),
      },
      presentationPorts: {
        comments: {
          addComment: async (_pr, body) => { status.push({ id: 2, body, user: { login: 'bugbot' } }); },
          updateComment: async (_pr, _id, body) => { status[0].body = body; },
        },
        updatePullRequestReview: async (_pr, id, body) => { reviews.find((review) => review.identity === id)!.body = body; },
      },
    });
  return { comments, thread, publication, resolution, load, reconcile, status };
}

it('replays a changed title/location through publication, final projection and a fresh recheck without an orphan', async () => {
  const test = harness();
  const query = jest.fn().mockResolvedValue({ outputLocale: 'en-US', findings: [current],
    resolved_findings: [{ id: oldId, resolution: 'fixed' }] });
  const run = async () => {
    const loaded = test.load();
    const prepared = (await analyzeBugbotRevision(operation, loaded, {
      agent: { query }, telemetry: new BugbotReviewTelemetry(operation),
    }))!;
    expect(prepared.toPublish[0].id).toBe(oldId);
    expect(prepared.resolvedFindingIds.size).toBe(0);
    expect(await applyDetectedFindings(operation, loaded, prepared, test.publication, test.resolution)).toEqual([]);
    return test.reconcile(loaded);
  };
  const first = await run();
  const second = await run();
  expect(first.projection.findings).toEqual([expect.objectContaining({ id: oldId, title: current.title,
    state: 'open', url: 'https://github.com/org/repo/pull/1#discussion_r1', parentReviewIdentity: '77' })]);
  expect(first.projection.counts.unknown).toBe(0);
  expect(first.errors).toEqual([]);
  expect(second.projection.digest).toBe(first.projection.digest);
  expect(second.statusCardOperation).toBe('unchanged');
  expect(test.publication.pullRequestComments.createReviewWithComments).not.toHaveBeenCalled();
  expect(test.comments).toHaveLength(1);
  expect(test.status).toHaveLength(1);
  expect(parseMarker(test.comments[0].body)[0].findingId).toBe(oldId);
});

it('keeps the durable marker when publication is called directly with a replacement model ID', async () => {
  const test = harness();
  const findings = prepareBugbotFindings({ findings: [current, { ...current, id: 'duplicate' }] }, [], 'low', 20)!.toPublish;
  await publishFindings({ operation, context: test.load(), findings, ports: test.publication });
  expect(test.publication.pullRequestComments.updatePullRequestReviewComment).toHaveBeenCalledTimes(1);
  expect(parseMarker(test.comments[0].body)[0].findingId).toBe(oldId);
  expect(test.publication.pullRequestComments.createReviewWithComments).not.toHaveBeenCalled();
});

it('publishes and projects an incompatible colliding ID as a separate finding and reuses both threads on recheck', async () => {
  const test = harness();
  const unrelated = { ...current, id: oldId, title: 'Unrelated lease defect', file: 'src/copy.ts',
    symbol: 'schedule', codeSnippet: 'retry(now)' };
  const findings = [current, unrelated];
  const run = async () => {
    const loaded = test.load();
    await publishFindings({ operation, context: loaded,
      findings: prepareBugbotFindings({ findings }, [], 'low', 20)!.toPublish, ports: test.publication });
    return test.reconcile(loaded, findings);
  };
  const first = await run();
  expect(first.projection.findings).toHaveLength(2);
  expect(new Set(first.projection.findings.map((finding) => finding.id)).size).toBe(2);
  expect(first.projection.counts.open).toBe(2);
  expect(first.projection.counts.unknown).toBe(0);
  expect(first.projection.findings.map((finding) => finding.title)).toEqual(expect.arrayContaining([current.title, unrelated.title]));
  const second = await run();
  expect(second.projection.findings).toEqual(first.projection.findings);
  expect(second.projection.digest).toBe(first.projection.digest);
  expect(test.comments).toHaveLength(2);
  expect(test.publication.pullRequestComments.createReviewWithComments).toHaveBeenCalledTimes(1);
});

it('preserves a human dismissal when the same finding is reported under a new ID', async () => {
  const test = harness();
  test.thread.resolved = true;
  test.thread.resolvedByLogin = 'maintainer';
  const loaded = test.load();
  const prepared = (await analyzeBugbotRevision(operation, loaded, {
    agent: { query: jest.fn().mockResolvedValue({ outputLocale: 'en-US', findings: [current], resolved_findings: [] }) },
    telemetry: new BugbotReviewTelemetry(operation),
  }))!;
  expect(prepared.toPublish).toEqual([]);
  expect(prepared.activeFindings).toEqual([]);
  expect(await applyDetectedFindings(operation, loaded, prepared, test.publication, test.resolution)).toEqual([]);
  expect(parseMarker(test.comments[0].body)[0]).toMatchObject({ findingId: oldId, resolution: 'dismissed' });
  expect(test.publication.pullRequestComments.unresolvePullRequestReviewThread).not.toHaveBeenCalled();
});

it.each(['update-comment', 'unresolve-thread'] as const)('retains identity and safe diagnostics after %s fails and converges on retry', async (failedOperation) => {
  const test = harness(failedOperation === 'unresolve-thread');
  const mutation = failedOperation === 'update-comment'
    ? test.publication.pullRequestComments.updatePullRequestReviewComment
    : test.publication.pullRequestComments.unresolvePullRequestReviewThread;
  mutation.mockRejectedValueOnce(toPullRequestReviewOperationError({ status: 503,
    response: { headers: { 'x-github-request-id': 'AB12:34CD' }, data: 'PRIVATE_PROVIDER_BODY' } }, failedOperation));
  const loaded = test.load();
  const prepared = prepareBugbotFindings({ findings: [current] }, [], 'low', 20)!;
  const errors = await applyDetectedFindings(operation, loaded, prepared, test.publication, test.resolution);
  expect(errors).toHaveLength(1);
  expect(errors[0]).toMatchObject({ diagnostic: { operation: failedOperation, findingId: oldId, providerStatus: 'http-503' } });
  const partial = await test.reconcile(loaded, [current], errors);
  expect(partial.projection.findings).toHaveLength(1);
  expect(partial.projection.findings[0].id).toBe(oldId);
  expect(partial.projection.outcome).toBe('partial');
  expect(JSON.stringify(partial)).not.toContain('PRIVATE_PROVIDER_BODY');
  const refreshed = test.load();
  expect(await applyDetectedFindings(operation, refreshed, prepared, test.publication, test.resolution)).toEqual([]);
  const retry = await test.reconcile(refreshed);
  expect(retry.projection.outcome).toBe('complete');
  expect(retry.projection.counts.open).toBe(1);
  expect(retry.projection.counts.unknown).toBe(0);
  expect(test.publication.pullRequestComments.createReviewWithComments).not.toHaveBeenCalled();
});

it('retains one unknown with its exact durable ID when the provider truly omits the comment', async () => {
  const test = harness();
  const loaded = test.load();
  test.comments.length = 0;
  const report = await test.reconcile(loaded);
  expect(report.projection.findings).toEqual([expect.objectContaining({ id: oldId, state: 'unknown' })]);
  expect(report.projection.counts.unknown).toBe(1);
  expect(test.status[0].body).toContain(oldId);
  expect(report.errors).toHaveLength(1);
});
