import { BugbotMutationError, bugbotMutationError } from '../bugbot_mutation_error';
import { PullRequestReviewOperationError, toPullRequestReviewOperationError } from '../../ports/pull_request_review_errors';

it.each([
  [401, 'authorization.credential-invalid'], [403, 'authorization.denied'], [404, 'provider.not-found'],
  [409, 'provider.conflict'], [422, 'provider.contract-invalid'], [429, 'provider.rate-limited'],
  [408, 'provider.unavailable'], [425, 'provider.unavailable'],
  [503, 'provider.unavailable'],
])('preserves safe HTTP %s metadata and classifies recovery as %s', (status, code) => {
  const cause = new PullRequestReviewOperationError('resolve-thread', { providerStatus: status, providerReference: 'AB12:34CD' });
  const error = bugbotMutationError(cause, 'resolution', ['backend/Dockerfile:20:healthcheck-requires-curl'], 'mark-resolved');
  expect(error).toMatchObject({ code, diagnostic: { stage: 'resolution', operation: 'resolve-thread',
    providerStatus: `http-${status}`, providerReference: 'AB12:34CD' } });
  expect(JSON.stringify(error)).not.toMatch(/private-/);
  if (status === 408 || status === 425) expect(error.retryable).toBe(true);
});

it('drops malformed provider status/reference and unsafe finding markup', () => {
  const cause = new PullRequestReviewOperationError('publish-comments', { providerStatus: 400.5, providerReference: '@team\nsecret' });
  const error = bugbotMutationError(cause, 'publication', ['@team<script>'], 'publish-comments');
  expect(error.diagnostic).toMatchObject({ findingId: 'unavailable', providerStatus: 'http-unavailable', providerReference: 'unavailable' });
});

it('retains a typed mutation error unchanged across application boundaries', () => {
  const error = bugbotMutationError(new Error('private'), 'publication', [], 'publish-comments');
  expect(error).toBeInstanceOf(BugbotMutationError);
  expect(bugbotMutationError(error, 'resolution', ['other'], 'mark-resolved')).toBe(error);
  expect(JSON.stringify(error)).not.toContain('private');
});


it.each([null, 'private provider prose'])('does not retain non-object provider errors', cause => {
  const error = bugbotMutationError(toPullRequestReviewOperationError(cause, 'update-comment'), 'publication', ['f1'], 'publish-comments');
  expect(error.diagnostic.providerStatus).toBe('http-unavailable');
  expect(error.message).not.toContain('private');
});
