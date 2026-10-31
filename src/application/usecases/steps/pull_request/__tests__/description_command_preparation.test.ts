import { runPreparedDescriptionCommand } from '../description_command_preparation';
import { LinkPullRequestIssueUseCase } from '../link_pull_request_issue_use_case';
import { UpdatePullRequestDescriptionUseCase } from '../update_pull_request_description_use_case';
import { shouldPersistConfiguration } from '../../../../policies/configuration_persistence_policy';
import type { PullRequestDescriptionRequest } from '../../../pull_request_workflow_context';
import type { PullRequestDescriptionDetails } from '../../../../ports/pull_request_description_ports';

jest.mock('../../../../../utils/logger', () => ({ logInfo: jest.fn(), logError: jest.fn(), logDebugInfo: jest.fn() }));

function fixture(eventName = 'issue_comment') {
  let native: PullRequestDescriptionDetails = {
    body: 'Human\n\nResolves #42\n\n<!-- copilot:pr-issue-link:v1;pr=10;issue=42;base=develop;state=pending -->',
    baseBranch: 'main', headBranch: 'feature/42-work', identity: { number: 10, state: 'open',
      repository: 'owner/repo', headRepository: 'owner/repo', headRef: 'feature/42-work', headSha: 'a'.repeat(40) },
  };
  const getDetails = jest.fn(async () => ({ ...native, identity: { ...native.identity! } }));
  const updateDescription = jest.fn(async (_number: number, body: string) => { native = { ...native, body }; });
  const updateBaseBranch = jest.fn(async (_number: number, baseBranch: string) => { native = { ...native, baseBranch }; });
  const wait = jest.fn();
  const link = new LinkPullRequestIssueUseCase({ getDetails, updateDescription, updateBaseBranch,
    isLinked: jest.fn(async () => true) }, { wait });
  const query = jest.fn(async () => {
    expect(native.baseBranch).toBe('develop');
    expect(native.body).not.toContain('copilot:pr-issue-link:');
    return { outputLocale: 'en-US', overview: 'The PR fixes retry handling.', whatChangedHeading: 'What changed',
      changes: ['Restores the original PR target.', 'Preserves verified linkage.'], validationHeading: 'Validation',
      validation: ['Verified the fake-provider recovery.'], reviewNotesHeading: null, reviewNotes: null, closesLinkedIssue: false };
  });
  const description = new UpdatePullRequestDescriptionUseCase({ getDetails, updateDescription,
    getDiff: jest.fn(async () => ({ snapshot: { filesWithFirstDiffLine: [{ path: 'src/retry.ts', firstLine: 1 }],
      filesWithDiffLocations: [], changes: [{ filename: 'src/retry.ts', additions: 1, deletions: 0,
      patch: '+retry()', status: 'modified' as const }] }, coverage: { source: 'diff' as const, status: 'complete' as const, pagesFetched: 1, itemsFetched: 1, itemsRetained: 1, omittedItems: 0, truncatedItems: 0, limitReached: false } })) },
    { getDescription: jest.fn(async () => 'Fix retry handling.') }, { getAllMembers: jest.fn(async () => []) }, { query });
  const request: PullRequestDescriptionRequest = { trigger: 'authorized-command', context: { eventName, issueNumber: 42,
    pullRequest: { number: 10, body: '', headBranch: '', baseBranch: 'develop', creator: 'owner' },
    mode: 'replace', membersOnly: false, targetLocale: 'en-US',
    agentConfiguration: { provider: 'codex', modelProvider: 'openai', model: 'fixture', effort: 'low' } } };
  const prepare = jest.fn(() => link.invoke({ pullRequestNumber: 10, issueNumber: 42, originalBaseBranch: 'develop',
    defaultBranch: 'main', expectedHeadRef: 'feature/42-work', recoveryOnly: true }));
  return { request, prepare, link, description, query, updateDescription, updateBaseBranch, wait, native: () => native,
    setNative: (change: Partial<PullRequestDescriptionDetails>) => { native = { ...native, ...change }; } };
}

it.each(['issue_comment', 'pull_request_review_comment'])('repairs pending linkage before an authorized %s description', async eventName => {
  const value = fixture(eventName);
  const results = await runPreparedDescriptionCommand(value.request, value.description, value.prepare);
  expect(results.every(result => result.success)).toBe(true);
  expect(value.prepare).toHaveBeenCalledTimes(1);
  expect(value.query).toHaveBeenCalledTimes(1);
  expect(value.updateBaseBranch).toHaveBeenCalledWith(10, 'develop');
  expect(value.native().body).toContain('The PR fixes retry handling.');
  expect(value.wait).not.toHaveBeenCalled();
});
it('stops description and stale persistence if pending repair cannot verify native ownership', async () => {
  const value = fixture();
  value.setNative({ identity: { ...value.native().identity!, state: 'closed' } });
  const results = await runPreparedDescriptionCommand(value.request, value.description, value.prepare);
  expect(value.prepare).toHaveBeenCalledTimes(1);
  expect(results[0].errors[0].code).toBe('workflow.stale');
  expect(value.query).not.toHaveBeenCalled();
  expect(value.updateDescription).not.toHaveBeenCalled();
  expect(shouldPersistConfiguration({ isSingleAction: false, isPullRequest: true,
    singleAction: { isRecommendStepsAction: false }, currentConfiguration: { results } })).toBe(false);
});
it('keeps disabled descriptions free of pending-repair mutations', async () => {
  const value = fixture();
  const request = { ...value.request, context: { ...value.request.context, mode: 'disabled' as const } };
  await runPreparedDescriptionCommand(request, value.description, value.prepare);
  expect(value.prepare).not.toHaveBeenCalled();
  expect(value.updateBaseBranch).not.toHaveBeenCalled();
  expect(value.updateDescription).not.toHaveBeenCalled();
  expect(value.query).not.toHaveBeenCalled();
  // Legacy compositions without preparation retain the generator's fail-closed guard.
  expect((await runPreparedDescriptionCommand(value.request, value.description))[0].errors[0].code).toBe('workflow.stale');
});
it('leaves ordinary automatic descriptions on their existing lifecycle preparation path', async () => {
  const value = fixture();
  value.setNative({ body: 'Human', baseBranch: 'develop' });
  const results = await runPreparedDescriptionCommand({ ...value.request, trigger: 'automatic' }, value.description, value.prepare);
  expect(results[0].success).toBe(true);
  expect(value.prepare).not.toHaveBeenCalled();
  expect(value.updateBaseBranch).not.toHaveBeenCalled();
  expect(value.query).toHaveBeenCalledTimes(1);
});

it('keeps an ordinary linked comment with no stored parent or pending marker usable', async () => {
  const value = fixture();
  value.setNative({ body: 'Human', baseBranch: 'develop' });
  const prepare = jest.fn(() => value.link.invoke({ pullRequestNumber: 10, issueNumber: 42,
    originalBaseBranch: '', defaultBranch: 'main', expectedHeadRef: 'feature/42-work', recoveryOnly: true }));
  const request = { ...value.request, context: { ...value.request.context,
    pullRequest: { ...value.request.context.pullRequest, baseBranch: '' } } };
  const results = await runPreparedDescriptionCommand(request, value.description, prepare);
  expect(results.every(result => result.success)).toBe(true);
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(value.query).toHaveBeenCalledTimes(1);
  expect(value.updateBaseBranch).not.toHaveBeenCalled();
});
