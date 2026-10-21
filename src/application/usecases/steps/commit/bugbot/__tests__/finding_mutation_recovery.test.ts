import { applyDetectedFindings } from '../apply_detected_findings';
import { buildMarker, parseMarker } from '../../../../../policies/bugbot_finding_marker_policy';
import { toPullRequestReviewOperationError } from '../../../../../../data/repository/pull_request/pull_request_review_error_metadata';
import type { BugbotReviewOperationContext } from '../bugbot_review_operation_context';
import type { BugbotContext } from '../types';

it('retains a native review after resolution failure and retries without duplicate reviews, threads or lost dismissal', async () => {
  const head = 'a'.repeat(40);
  const dismissedBody = buildMarker('old', true, 'fp-11111111', 'sf-11111111', 'dismissed');
  const native = [{ id: 1, identity: 'PRRC_old', body: dismissedBody }];
  const createReview = jest.fn(async (_pr, _head, _body, comments) => {
    for (const comment of comments) native.push({ id: 2, identity: 'PRRC_new', body: comment.body });
    return { identity: '77' };
  });
  const updateReviewComment = jest.fn(async (identity, body) => { native.find(comment => comment.identity === identity)!.body = body; });
  const resolveThread = jest.fn().mockRejectedValueOnce(toPullRequestReviewOperationError({ status: 503,
    response: { headers: { 'x-github-request-id': 'AB12:34CD' }, data: 'PRIVATE_PROVIDER_BODY' } }, 'resolve-thread'))
    .mockResolvedValue(undefined);
  const operation = { target: { issueNumber: 42 }, trustedAuthorLogin: 'bugbot',
    locale: { pullRequest: 'en-US' }, analysis: { reviewConfiguration: { suggestedChanges: false, traceRules: false } } } as unknown as BugbotReviewOperationContext;
  const context: BugbotContext = {
    existingByFindingId: { old: { pullRequest: { commentIdentity: 'PRRC_old', pullRequestNumber: 50,
      resolved: true, threadResolved: true, resolution: 'dismissed' } } },
    issueComments: [], selectionReason: 'event', eligibleResolutionIds: new Set(),
    coverage: { status: 'complete', sources: [] }, previousFindingsBlock: '', unresolvedFindingsWithBody: [],
    canonicalPullRequest: { number: 50, state: 'open', draft: false, baseRepository: { owner: 'o', name: 'r' },
      headRepositoryOwner: 'o', headRef: 'feature/42', headSha: head },
    prContext: { prHeadSha: head, prFiles: [{ filename: 'src/a.ts', status: 'modified' }], pathToFirstDiffLine: { 'src/a.ts': 1 } },
  };
  const publication = { issueComments: { addComment: jest.fn(), updateComment: jest.fn() },
    pullRequestComments: { createReviewWithComments: createReview, updatePullRequestReviewComment: updateReviewComment,
      unresolvePullRequestReviewThread: jest.fn() } };
  const resolution = { issueComments: { updateComment: jest.fn() }, pullRequestComments: {
    listPullRequestReviewComments: jest.fn(async () => native), updatePullRequestReviewComment: updateReviewComment,
    resolvePullRequestReviewThread: resolveThread, unresolvePullRequestReviewThread: jest.fn() } };
  const prepared = { toPublish: [{ id: 'new', title: 'New finding', description: 'Body', file: 'src/a.ts', line: 1,
    fingerprint: 'fp-22222222', semanticFingerprint: 'sf-22222222' }], resolvedFindingIds: new Set<string>(), overflowCount: 0, overflowTitles: [] };
  const first = await applyDetectedFindings(operation, context, prepared, publication, resolution);
  expect(first).toHaveLength(1);
  expect(first[0]).toMatchObject({ diagnostic: { stage: 'resolution', operation: 'resolve-thread', findingId: 'old', providerStatus: 'http-503' } });
  expect(JSON.stringify(first)).not.toContain('PRIVATE_PROVIDER_BODY');
  expect(native).toHaveLength(2);
  expect(createReview).toHaveBeenCalledTimes(1);
  // A fresh provider read observes the completed native publication before retry.
  const refreshed = { ...context, existingByFindingId: { ...context.existingByFindingId,
    new: { pullRequest: { commentIdentity: 'PRRC_new', pullRequestNumber: 50, resolved: false, threadResolved: false, fingerprint: 'fp-22222222', semanticFingerprint: 'sf-22222222' } } } };
  const second = await applyDetectedFindings(operation, refreshed, prepared, publication, resolution);
  expect(second).toEqual([]);
  expect(createReview).toHaveBeenCalledTimes(1);
  expect(native).toHaveLength(2);
  expect(native[0].body).toBe(dismissedBody);
  expect(parseMarker(native[0].body)[0].resolution).toBe('dismissed');
});
