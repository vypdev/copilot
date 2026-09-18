import { LinkPullRequestIssueUseCase } from '../link_pull_request_issue_use_case';
import type { LinkPullRequestIssueContext } from '../../../pull_request_workflow_context';

jest.mock('../../../../../utils/logger', () => ({ logInfo: jest.fn(), logError: jest.fn() }));

const mockIsLinked = jest.fn();
const mockGetDetails = jest.fn();
const mockUpdateBaseBranch = jest.fn();
const mockUpdateDescription = jest.fn();
const mockWait = jest.fn();

function context(overrides: Partial<LinkPullRequestIssueContext> = {}): LinkPullRequestIssueContext {
  return {
    issueNumber: 42,
    pullRequestNumber: 10,
    originalBaseBranch: 'develop',
    defaultBranch: 'main',
    ...overrides,
  };
}

describe('LinkPullRequestIssueUseCase', () => {
  let useCase: LinkPullRequestIssueUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsLinked.mockResolvedValue(false);
    mockGetDetails.mockResolvedValue({ body: 'Current PR body', baseBranch: 'develop' });
    mockUpdateBaseBranch.mockResolvedValue(undefined);
    mockUpdateDescription.mockResolvedValue(undefined);
    mockWait.mockResolvedValue(undefined);
    useCase = new LinkPullRequestIssueUseCase(
      {
        isLinked: mockIsLinked,
        getDetails: mockGetDetails,
        updateBaseBranch: mockUpdateBaseBranch,
        updateDescription: mockUpdateDescription,
      },
      { wait: mockWait },
    );
  });

  it('uses only the bound PR number and restores temporary state in order', async () => {
    const results = await useCase.invoke(context());

    expect(mockGetDetails).toHaveBeenCalledWith(10);
    expect(mockIsLinked).toHaveBeenCalledWith(10);
    expect(mockUpdateDescription).toHaveBeenNthCalledWith(1, 10, expect.stringContaining('Resolves #42'));
    expect(mockUpdateBaseBranch).toHaveBeenNthCalledWith(1, 10, 'main');
    expect(mockWait).toHaveBeenCalledWith(20_000);
    expect(mockUpdateBaseBranch).toHaveBeenNthCalledWith(2, 10, 'develop');
    expect(mockUpdateDescription).toHaveBeenNthCalledWith(2, 10, 'Current PR body');
    expect(results.every((result) => result.success)).toBe(true);
  });

  it('does nothing when the exact bound PR is already linked', async () => {
    mockIsLinked.mockResolvedValue(true);
    await expect(useCase.invoke(context())).resolves.toEqual([]);
    expect(mockUpdateBaseBranch).not.toHaveBeenCalled();
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });

  it.each([
    { issueNumber: -1 },
    { issueNumber: 10 },
  ])('skips without provider I/O when no separate issue exists: %p', async (override) => {
    const results = await useCase.invoke(context(override));

    expect(results[0]).toMatchObject({ success: true, executed: false });
    expect(results[0].steps[0]).toContain('No separate linked issue');
    expect(mockGetDetails).not.toHaveBeenCalled();
    expect(mockIsLinked).not.toHaveBeenCalled();
    expect(mockUpdateBaseBranch).not.toHaveBeenCalled();
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });

  it('rejects an invalid PR identity even when no separate issue exists', async () => {
    const results = await useCase.invoke(context({ pullRequestNumber: Number.NaN, issueNumber: -1 }));

    expect(results[0]).toMatchObject({ success: false, executed: false });
    expect(results[0].steps[0]).toContain('positive pull-request number');
    expect(mockGetDetails).not.toHaveBeenCalled();
  });

  it('cleans an owned pending operation even when GitHub already reports the link', async () => {
    const pending = '<!-- copilot:pr-issue-link:v1;pr=10;issue=42;base=develop;state=pending -->';
    mockGetDetails.mockResolvedValue({ body: `Original\n\nResolves #42\n\n${pending}`, baseBranch: 'main' });
    mockIsLinked.mockResolvedValue(true);

    const results = await useCase.invoke(context());

    expect(mockWait).not.toHaveBeenCalled();
    expect(mockUpdateBaseBranch).toHaveBeenCalledWith(10, 'develop');
    expect(mockUpdateDescription).toHaveBeenCalledWith(10, 'Original');
    expect(results.every((result) => result.success)).toBe(true);
  });

  it('cleans an owned pending operation when linkage inspection fails', async () => {
    const pending = '<!-- copilot:pr-issue-link:v1;pr=10;issue=42;base=develop;state=pending -->';
    mockGetDetails.mockResolvedValue({ body: `Original\n\nResolves #42\n\n${pending}`, baseBranch: 'main' });
    mockIsLinked.mockRejectedValue(new Error('inspection failed'));

    const results = await useCase.invoke(context());

    expect(mockWait).not.toHaveBeenCalled();
    expect(mockUpdateBaseBranch).toHaveBeenCalledWith(10, 'develop');
    expect(mockUpdateDescription).toHaveBeenCalledWith(10, 'Original');
    expect(results.at(-1)).toMatchObject({
      success: false,
      errors: [expect.objectContaining({
        recovery: {
          id: 'pull-request-link-restored',
          variables: {},
        },
      })],
    });
  });

  it('does not change an already-default base but still restores the body', async () => {
    mockGetDetails.mockResolvedValue({ body: 'Body', baseBranch: 'main' });
    await useCase.invoke(context({ originalBaseBranch: 'main' }));
    expect(mockUpdateBaseBranch).not.toHaveBeenCalled();
    expect(mockUpdateDescription).toHaveBeenCalledTimes(2);
  });

  it('compensates the temporary body when changing the base fails', async () => {
    mockUpdateBaseBranch.mockRejectedValueOnce(new Error('base failed'));
    const results = await useCase.invoke(context());
    expect(results.at(-1)?.success).toBe(false);
    expect(results.at(-1)?.steps).toEqual([
      'Pull-request issue linkage failed, but the original base and description were restored. Re-run the workflow.',
    ]);
    expect(mockUpdateDescription).toHaveBeenNthCalledWith(2, 10, 'Current PR body');
  });

  it('reports a pre-mutation provider read failure without claiming retained state', async () => {
    mockGetDetails.mockRejectedValue(new Error('details unavailable'));

    const results = await useCase.invoke(context());

    expect(results[0]).toMatchObject({
      success: false,
      executed: true,
      steps: ['Unable to link the pull request to its issue. Inspect the PR base and description before rerunning the workflow.'],
    });
    expect(mockIsLinked).not.toHaveBeenCalled();
    expect(mockUpdateBaseBranch).not.toHaveBeenCalled();
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });

  it('reports restored state when the first temporary description write fails', async () => {
    mockUpdateDescription.mockRejectedValueOnce(new Error('description failed'));

    const results = await useCase.invoke(context());

    expect(results.at(-1)?.steps).toEqual([
      'Pull-request issue linkage failed, but the original base and description were restored. Re-run the workflow.',
    ]);
    expect(mockUpdateDescription).toHaveBeenCalledTimes(1);
    expect(mockUpdateBaseBranch).not.toHaveBeenCalled();
    expect(mockWait).not.toHaveBeenCalled();
  });

  it('restores base and body when the observation delay fails', async () => {
    mockWait.mockRejectedValue(new Error('delay failed'));
    const results = await useCase.invoke(context());
    expect(results.at(-1)?.success).toBe(false);
    expect(mockUpdateBaseBranch).toHaveBeenLastCalledWith(10, 'develop');
    expect(mockUpdateDescription).toHaveBeenLastCalledWith(10, 'Current PR body');
  });

  it('attempts body restoration even when base restoration fails', async () => {
    mockUpdateBaseBranch
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('restore failed'));
    const results = await useCase.invoke(context());
    expect(results.at(-1)?.success).toBe(false);
    expect(results.at(-1)?.steps[0]).toContain('retained the temporary default base branch');
    expect(results.at(-1)?.errors[0].recovery).toEqual({
      id: 'pull-request-link-base-retained',
      variables: {},
    });
    expect(mockUpdateDescription).toHaveBeenCalledTimes(2);
  });

  it('reports only a retained temporary issue reference when body restoration fails', async () => {
    mockUpdateDescription
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('restore failed'));
    const results = await useCase.invoke(context());
    expect(results.at(-1)?.steps).toEqual([
      'Pull-request issue linkage failed and retained the temporary issue reference in the description. Restore that PR state, then re-run the workflow.',
    ]);
    expect(results.at(-1)?.errors[0].recovery).toEqual({
      id: 'pull-request-link-reference-retained',
      variables: {},
    });
    expect(mockUpdateBaseBranch).toHaveBeenLastCalledWith(10, 'develop');
  });

  it('reports both retained temporary states when neither restoration succeeds', async () => {
    mockUpdateBaseBranch
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('base restore failed'));
    mockUpdateDescription
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('description restore failed'));

    const results = await useCase.invoke(context());

    expect(results.at(-1)?.errors[0].recovery).toEqual({
      id: 'pull-request-link-base-and-reference-retained',
      variables: {},
    });
  });

  it('resumes an exact pending marker without layering another reference', async () => {
    const pending = '<!-- copilot:pr-issue-link:v1;pr=10;issue=42;base=develop;state=pending -->';
    mockGetDetails.mockResolvedValue({ body: `Current PR body\n\nResolves #42\n\n${pending}`, baseBranch: 'main' });
    await useCase.invoke(context());
    expect(mockUpdateDescription).toHaveBeenCalledTimes(1);
    expect(mockUpdateDescription).toHaveBeenCalledWith(10, 'Current PR body');
  });

  it('blocks recovery when an owned pending operation has an unexpected current base', async () => {
    const pending = '<!-- copilot:pr-issue-link:v1;pr=10;issue=42;base=develop;state=pending -->';
    mockGetDetails.mockResolvedValue({
      body: `Current PR body\n\nResolves #42\n\n${pending}`,
      baseBranch: 'release/2.0',
    });

    const results = await useCase.invoke(context());

    expect(results[0]).toMatchObject({ success: false, executed: true });
    expect(results[0].steps[0]).toContain('pending linkage operation no longer matches');
    expect(mockIsLinked).not.toHaveBeenCalled();
    expect(mockUpdateBaseBranch).not.toHaveBeenCalled();
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });

  it('preserves the authoritative body byte-for-byte across temporary linkage', async () => {
    const originalBody = 'Current PR body with trailing space \n\n';
    mockGetDetails.mockResolvedValue({ body: originalBody, baseBranch: 'develop' });

    await useCase.invoke(context());

    expect(mockUpdateDescription.mock.calls[0][1]).toBe(
      `${originalBody}\n\nResolves #42\n\n<!-- copilot:pr-issue-link:v1;pr=10;issue=42;base=develop;state=pending -->`,
    );
    expect(mockUpdateDescription).toHaveBeenLastCalledWith(10, originalBody);
  });

  it('blocks a same-operation marker that does not match the validated original base', async () => {
    const marker = '<!-- copilot:pr-issue-link:v1;pr=10;issue=42;base=release%2F2.0;state=pending -->';
    mockGetDetails.mockResolvedValue({ body: `Body\n\nResolves #42\n\n${marker}`, baseBranch: 'main' });

    const results = await useCase.invoke(context());

    expect(results[0]).toMatchObject({ success: false, executed: true });
    expect(results[0].steps[0]).toContain('does not match the validated original base');
    expect(mockIsLinked).not.toHaveBeenCalled();
    expect(mockUpdateDescription).not.toHaveBeenCalled();
  });

  it('does not overwrite a current base that changed after the event snapshot', async () => {
    mockGetDetails.mockResolvedValue({ body: 'Body', baseBranch: 'release/2.0' });

    const results = await useCase.invoke(context());

    expect(results[0]).toMatchObject({ success: false, executed: false });
    expect(results[0].steps[0]).toContain('base changed after this event');
    expect(mockIsLinked).not.toHaveBeenCalled();
    expect(mockUpdateBaseBranch).not.toHaveBeenCalled();
  });

  it('treats forged foreign markers as body text and never reads an event URL', async () => {
    mockGetDetails.mockResolvedValue({
      body: 'Body\n\n<!-- copilot:pr-issue-link:v1;pr=999;issue=1;state=complete -->',
      baseBranch: 'develop',
    });
    await useCase.invoke(context());
    expect(mockIsLinked).toHaveBeenCalledWith(10);
    expect(mockUpdateDescription.mock.calls[0][1]).toContain('pr=999');
  });

  it.each([
    { pullRequestNumber: Number.MAX_SAFE_INTEGER + 1 },
    { defaultBranch: '../unsafe' },
    { originalBaseBranch: '' },
  ])('rejects invalid identifiers and branches before provider I/O: %p', async (override) => {
    const results = await useCase.invoke(context(override));
    expect(results[0]).toMatchObject({ success: false, executed: false });
    expect(mockGetDetails).not.toHaveBeenCalled();
    expect(mockIsLinked).not.toHaveBeenCalled();
  });
});
