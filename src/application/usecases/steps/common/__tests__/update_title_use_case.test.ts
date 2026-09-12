import { UpdateTitleUseCase } from '../update_title_use_case';
import { projectUpdateTitleContext, type UpdateTitleContextSource } from '../update_title_workflow';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
}));

const mockGetTitle = jest.fn();
const mockUpdateTitleIssueFormat = jest.fn();
const mockUpdateTitlePullRequestFormat = jest.fn();

function baseParam(overrides: Record<string, unknown> = {}) {
  return {
    isIssue: false,
    isPullRequest: false,
    owner: 'o',
    repo: 'r',
    tokens: { token: 't' },
    issue: { number: 1, title: 'Issue', branchManagementAlways: false },
    pullRequest: { number: 2, title: 'PR' },
    issueNumber: 1,
    emoji: { emojiLabeledTitle: false, branchManagementEmoji: '' },
    release: { active: false, version: null },
    hotfix: { active: false, version: null },
    labels: {},
    ...overrides,
  } as unknown as UpdateTitleContextSource;
}

describe('UpdateTitleUseCase', () => {
  let useCase: UpdateTitleUseCase;

  beforeEach(() => {
    useCase = new UpdateTitleUseCase({
      getTitle: mockGetTitle,
      updateIssueTitle: mockUpdateTitleIssueFormat,
      updatePullRequestTitle: mockUpdateTitlePullRequestFormat,
    });
    mockGetTitle.mockReset();
    mockUpdateTitleIssueFormat.mockReset();
    mockUpdateTitlePullRequestFormat.mockReset();
  });

  function invoke(param: UpdateTitleContextSource) {
    return useCase.invoke(projectUpdateTitleContext(param));
  }

  it('returns empty result when neither issue nor pull request', async () => {
    const param = baseParam({ isIssue: false, isPullRequest: false });

    const results = await invoke(param);

    expect(results).toHaveLength(0);
    expect(mockGetTitle).not.toHaveBeenCalled();
  });

  it('returns success executed false when isIssue but emojiLabeledTitle is false', async () => {
    const param = baseParam({ isIssue: true, emoji: { emojiLabeledTitle: false, branchManagementEmoji: '' } });

    const results = await invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockGetTitle).not.toHaveBeenCalled();
  });

  it('returns success executed false when isPullRequest but emojiLabeledTitle is false', async () => {
    const param = baseParam({ isPullRequest: true, emoji: { emojiLabeledTitle: false, branchManagementEmoji: '' } });

    const results = await invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
  });

  it('returns success executed true when isIssue, emojiLabeledTitle, and updateTitleIssueFormat returns new title', async () => {
    mockGetTitle.mockResolvedValue('Old title');
    mockUpdateTitleIssueFormat.mockResolvedValue('v1.0.0 Old title');
    const param = baseParam({
      isIssue: true,
      emoji: { emojiLabeledTitle: true, branchManagementEmoji: '' },
      release: { active: true, version: '1.0.0' },
    });

    const results = await invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('Old title') && s.includes('v1.0.0 Old title'))).toBe(true);
    expect(mockUpdateTitleIssueFormat).toHaveBeenCalled();
  });

  it('returns success executed false when isIssue and updateTitleIssueFormat returns null', async () => {
    mockGetTitle.mockResolvedValue('Title');
    mockUpdateTitleIssueFormat.mockResolvedValue(null);
    const param = baseParam({
      isIssue: true,
      emoji: { emojiLabeledTitle: true, branchManagementEmoji: '' },
    });

    const results = await invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
  });

  it('uses param.issue.title when getTitle returns undefined for issue', async () => {
    mockGetTitle.mockResolvedValue(undefined);
    mockUpdateTitleIssueFormat.mockResolvedValue('🚀 Fallback title');
    const param = baseParam({
      isIssue: true,
      emoji: { emojiLabeledTitle: true, branchManagementEmoji: '' },
      issue: { number: 1, title: 'Fallback title', branchManagementAlways: false },
    });

    const results = await invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(mockUpdateTitleIssueFormat).toHaveBeenCalledWith(expect.objectContaining({
      version: '',
      currentTitle: 'Fallback title',
      issueNumber: 1,
      branchManagementAlways: false,
      branchManagementEmoji: '',
    }));
  });

  it('returns failure when isPullRequest, emojiLabeledTitle, but getTitle returns undefined', async () => {
    mockGetTitle.mockResolvedValue(undefined);
    const param = baseParam({
      isPullRequest: true,
      emoji: { emojiLabeledTitle: true, branchManagementEmoji: '' },
    });

    const results = await invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].steps).toContain('Tried to update title, but there was a problem.');
  });

  it('returns failure when getTitle throws', async () => {
    mockGetTitle.mockRejectedValue(new Error('API error'));
    const param = baseParam({
      isIssue: true,
      emoji: { emojiLabeledTitle: true, branchManagementEmoji: '' },
    });

    const results = await invoke(param);

    expect(results[0].success).toBe(false);
  });

  it('uses hotfix version when hotfix.active and release not active', async () => {
    mockGetTitle.mockResolvedValue('Old');
    mockUpdateTitleIssueFormat.mockResolvedValue('v1.2.1 Old');
    const param = baseParam({
      isIssue: true,
      emoji: { emojiLabeledTitle: true, branchManagementEmoji: '' },
      release: { active: false, version: null },
      hotfix: { active: true, version: '1.2.1' },
    });

    const results = await invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(mockUpdateTitleIssueFormat).toHaveBeenCalledWith(expect.objectContaining({
      version: '1.2.1',
      currentTitle: expect.any(String),
      issueNumber: 1,
      branchManagementAlways: false,
      branchManagementEmoji: '',
    }));
  });

  it('uses an empty version when hotfix is active without a resolved version', async () => {
    mockGetTitle.mockResolvedValue('Hotfix title');
    mockUpdateTitleIssueFormat.mockResolvedValue('🔥🐛 - Hotfix title');
    const param = baseParam({
      isIssue: true,
      emoji: { emojiLabeledTitle: true, branchManagementEmoji: '' },
      release: { active: false, version: null },
      hotfix: { active: true, version: undefined },
    });

    await invoke(param);

    expect(mockUpdateTitleIssueFormat).toHaveBeenCalledWith(expect.objectContaining({
      version: '',
      currentTitle: 'Hotfix title',
    }));
  });

  it('passes empty version when release active but version undefined to avoid Unknown Version loop', async () => {
    mockGetTitle.mockResolvedValue('My Release');
    mockUpdateTitleIssueFormat.mockResolvedValue('🚀 - My Release');
    const param = baseParam({
      isIssue: true,
      emoji: { emojiLabeledTitle: true, branchManagementEmoji: '' },
      release: { active: true, version: undefined },
    });

    await invoke(param);

    expect(mockUpdateTitleIssueFormat).toHaveBeenCalledWith(expect.objectContaining({
      version: '',
      currentTitle: 'My Release',
      issueNumber: 1,
      branchManagementAlways: false,
      branchManagementEmoji: '',
    }));
  });

  it('returns success with new title when isPullRequest and updateTitlePullRequestFormat returns title', async () => {
    mockGetTitle.mockResolvedValue('Issue Title');
    mockUpdateTitlePullRequestFormat.mockResolvedValue('feat: PR title');
    const param = baseParam({
      isPullRequest: true,
      emoji: { emojiLabeledTitle: true, branchManagementEmoji: '' },
      pullRequest: { number: 5, title: 'Old PR title' },
      issueNumber: 1,
    });

    const results = await invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('Old PR title') && s.includes('feat: PR title'))).toBe(true);
    expect(mockUpdateTitlePullRequestFormat).toHaveBeenCalledWith(expect.objectContaining({
      pullRequestTitle: 'Old PR title',
      issueTitle: 'Issue Title',
      issueNumber: 1,
      pullRequestNumber: 5,
    }));
  });

  it('returns success executed false when isPullRequest and updateTitlePullRequestFormat returns null', async () => {
    mockGetTitle.mockResolvedValue('Issue');
    mockUpdateTitlePullRequestFormat.mockResolvedValue(null);
    const param = baseParam({
      isPullRequest: true,
      emoji: { emojiLabeledTitle: true, branchManagementEmoji: '' },
      pullRequest: { number: 3, title: 'PR' },
      issueNumber: 1,
    });

    const results = await invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
  });
});
