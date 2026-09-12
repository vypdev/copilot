import { Result } from '../../../../../data/model/result';
import { PublishResultUseCase } from '../publish_resume_use_case';
import { ApplicationError } from '../../../../errors/application_error';
import {
  projectPublishResultContext,
  type PublishResultContextSource,
} from '../publish_resume_workflow';

const mockGetAccumulatedLogsAsText = jest.fn(() => '');
jest.mock('../../../../ports/logging_ports', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  getAccumulatedLogsAsText: () => mockGetAccumulatedLogsAsText(),
}));

const mockGetRandomElement = jest.fn<string | undefined, [readonly string[]]>(() => undefined);
jest.mock('../../../../../utils/list_utils', () => ({
  getRandomElement: (values: readonly string[]) => mockGetRandomElement(values),
}));

const mockAddComment = jest.fn();
const logReport = {
  getAccumulatedLogEntries: jest.fn(() => []),
  getAccumulatedLogsAsText: () => mockGetAccumulatedLogsAsText(),
  clearAccumulatedLogs: jest.fn(),
};

function baseImages(): PublishResultContextSource['images'] {
  return {
    imagesOnIssue: true,
    imagesOnPullRequest: true,
    issueAutomaticActions: [],
    issueReleaseGifs: [],
    issueHotfixGifs: [],
    issueBugfixGifs: [],
    issueFeatureGifs: [],
    issueDocsGifs: [],
    issueChoreGifs: [],
    pullRequestReleaseGifs: [],
    pullRequestHotfixGifs: [],
    pullRequestBugfixGifs: [],
    pullRequestFeatureGifs: [],
    pullRequestDocsGifs: [],
    pullRequestChoreGifs: [],
    pullRequestAutomaticActions: [],
  };
}

function baseParam(overrides: Partial<PublishResultContextSource> = {}) {
  const defaultConfig = { results: [new Result({ id: 'x', success: true, executed: true, steps: ['Step 1'] })] };
  return projectPublishResultContext({
    issueNumber: 42,
    issue: { number: 42 },
    pullRequest: { number: 99 },
    isIssue: false,
    isPullRequest: false,
    isPush: false,
    isSingleAction: false,
    isBugfix: false,
    isFeature: false,
    isDocs: false,
    isChore: false,
    currentConfiguration: defaultConfig,
    images: baseImages(),
    singleAction: { issue: 123 },
    release: { active: false },
    hotfix: { active: false },
    issueNotBranched: false,
    debug: false,
    ...overrides,
  });
}

describe('PublishResultUseCase', () => {
  let useCase: PublishResultUseCase;

  beforeEach(() => {
    useCase = new PublishResultUseCase(
      { addComment: mockAddComment },
      logReport,
    );
    mockAddComment.mockReset();
    mockGetAccumulatedLogsAsText.mockReturnValue('');
    mockGetRandomElement.mockReset().mockReturnValue(undefined);
  });

  it('does not call addComment when content is empty (no steps in results)', async () => {
    const param = baseParam({
      isIssue: true,
      currentConfiguration: { results: [new Result({ id: 'x', success: true, executed: true, steps: [] })] },
    });

    await useCase.invoke(param);

    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it('does not publish a GIF-only comment when debug logs are the only output', async () => {
    mockGetAccumulatedLogsAsText.mockReturnValue('[INFO] no-op');
    const param = baseParam({
      isIssue: true,
      debug: true,
      release: { active: true },
      images: {
        ...baseImages(),
        issueReleaseGifs: ['release.gif'],
      },
      currentConfiguration: {
        results: [new Result({ id: 'x', success: true, executed: false, steps: [] })],
      },
    });

    await useCase.invoke(param);

    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it('does not publish a reminder-only comment', async () => {
    const param = baseParam({
      isIssue: true,
      release: { active: true },
      images: {
        ...baseImages(),
        issueReleaseGifs: ['release.gif'],
      },
      currentConfiguration: {
        results: [new Result({ id: 'x', success: true, executed: true, steps: [], reminders: ['Remember this'] })],
      },
    });

    await useCase.invoke(param);

    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it('publishes failures even when a result has no steps', async () => {
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      isIssue: true,
      currentConfiguration: {
        results: [new Result({ id: 'x', success: false, executed: true, errors: [new ApplicationError('authorization.credential-invalid', 'Agent authentication failed')] })],
      },
    });

    await useCase.invoke(param);

    expect(mockAddComment).toHaveBeenCalledWith(42, expect.stringContaining('Agent authentication failed'));
  });

  it('calls addComment on issue when isIssue and results have steps', async () => {
    mockAddComment.mockResolvedValue(undefined);
    const resultsWithSteps = [new Result({ id: 'a', success: true, executed: true, steps: ['Step 1'] })];
    const param = baseParam({ isIssue: true, currentConfiguration: { results: resultsWithSteps } });

    await useCase.invoke(param);

    expect(mockAddComment).toHaveBeenCalledTimes(1);
    expect(mockAddComment).toHaveBeenCalledWith(42, expect.stringContaining('1. Step 1'));
  });

  it('preserves markdown result structure instead of numbering every line', async () => {
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      isIssue: true,
      currentConfiguration: {
        results: [new Result({
          id: 'recommendation',
          success: true,
          executed: true,
          stepFormat: 'markdown',
          steps: ['## Recommended implementation steps', '1. Add the module\n2. Add tests\n\n```sh\npnpm test\n```'],
        })],
      },
    });

    await useCase.invoke(param);

    const commentBody = mockAddComment.mock.calls[0][1] as string;
    expect(commentBody).toContain('# 🪄 Automatic Actions\n## Recommended implementation steps');
    expect(commentBody).toContain('\n1. Add the module\n2. Add tests');
    expect(commentBody).toContain('```sh\npnpm test\n```');
    expect(commentBody).not.toContain('1. ## Recommended implementation steps');
    expect(commentBody).not.toContain('2. 1. Add the module');
  });

  it('calls addComment on pull request when isPullRequest and results have steps', async () => {
    mockAddComment.mockResolvedValue(undefined);
    const resultsWithSteps = [new Result({ id: 'a', success: true, executed: true, steps: ['Step 1'] })];
    const param = baseParam({ isPullRequest: true, currentConfiguration: { results: resultsWithSteps } });

    await useCase.invoke(param);

    expect(mockAddComment).toHaveBeenCalledTimes(1);
    expect(mockAddComment).toHaveBeenCalledWith(99, expect.stringContaining('1. Step 1'));
  });

  it('does not duplicate a Bugbot native review with an independent PR comment', async () => {
    const param = baseParam({
      isPullRequest: true,
      currentConfiguration: {
        results: [new Result({
          id: 'DetectPotentialProblemsUseCase',
          success: true,
          executed: true,
          steps: ['Potential problems detection completed.'],
        })],
      },
    });

    await useCase.invoke(param);

    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it('includes debug log section in comment body when debug is true and logs are present', async () => {
    mockAddComment.mockResolvedValue(undefined);
    mockGetAccumulatedLogsAsText.mockReturnValue('[INFO] line1\n[WARN] line2');
    const param = baseParam({
      isIssue: true,
      debug: true,
      currentConfiguration: { results: [new Result({ id: 'a', success: true, executed: true, steps: ['Step 1'] })] },
    });

    await useCase.invoke(param);

    const commentBody = mockAddComment.mock.calls[0][1] as string;
    expect(commentBody).toContain('Debug log');
    expect(commentBody).toContain('[INFO] line1');
    expect(commentBody).toContain('[WARN] line2');
  });

  it('does not include debug log section when debug is false', async () => {
    mockAddComment.mockResolvedValue(undefined);
    mockGetAccumulatedLogsAsText.mockReturnValue('[INFO] line1');
    const param = baseParam({ isIssue: true, debug: false });

    await useCase.invoke(param);

    const commentBody = mockAddComment.mock.calls[0][1] as string;
    expect(commentBody).not.toContain('Debug log');
  });

  it('does not include debug log section when debug is true but accumulated logs are empty', async () => {
    mockAddComment.mockResolvedValue(undefined);
    mockGetAccumulatedLogsAsText.mockReturnValue('');
    const param = baseParam({
      isIssue: true,
      debug: true,
      currentConfiguration: { results: [new Result({ id: 'a', success: true, executed: true, steps: ['Step 1'] })] },
    });

    await useCase.invoke(param);

    const commentBody = mockAddComment.mock.calls[0][1] as string;
    expect(commentBody).not.toContain('Debug log');
  });

  it('returns a failure result without mutating the publication snapshot when addComment throws', async () => {
    mockAddComment.mockRejectedValue(new Error('API error'));
    const param = baseParam({ isIssue: true });
    const initialLength = param.results.length;

    const failure = await useCase.invoke(param);

    expect(param.results).toHaveLength(initialLength);
    expect(failure?.success).toBe(false);
    expect(failure?.steps).toContain('Tried to publish the resume, but there was a problem.');
  });

  it('uses release title and image when isIssue and release.active', async () => {
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      isIssue: true,
      release: { active: true },
      currentConfiguration: { results: [new Result({ id: 'a', success: true, executed: true, steps: ['Step'] })] },
    });
    await useCase.invoke(param);
    expect(mockAddComment).toHaveBeenCalledWith(42, expect.stringContaining('Release Actions'));
  });

  it('renders a selected issue image only when issue images are enabled', async () => {
    mockAddComment.mockResolvedValue(undefined);
    mockGetRandomElement.mockReturnValue('release.gif');
    const param = baseParam({
      isIssue: true,
      release: { active: true },
      images: { ...baseImages(), issueReleaseGifs: ['release.gif'] },
    });

    await useCase.invoke(param);

    expect(mockAddComment).toHaveBeenCalledWith(42, expect.stringContaining('![image](release.gif)'));
  });

  it('omits a selected issue image when issue images are disabled', async () => {
    mockAddComment.mockResolvedValue(undefined);
    mockGetRandomElement.mockReturnValue('release.gif');
    const param = baseParam({
      isIssue: true,
      release: { active: true },
      images: { ...baseImages(), imagesOnIssue: false, issueReleaseGifs: ['release.gif'] },
    });

    await useCase.invoke(param);

    expect(mockAddComment.mock.calls[0][1]).not.toContain('![image](release.gif)');
  });

  it('renders a selected pull-request image only when pull-request images are enabled', async () => {
    mockAddComment.mockResolvedValue(undefined);
    mockGetRandomElement.mockReturnValue('pull-request.gif');
    const param = baseParam({
      isPullRequest: true,
      images: { ...baseImages(), pullRequestAutomaticActions: ['pull-request.gif'] },
    });

    await useCase.invoke(param);

    expect(mockAddComment).toHaveBeenCalledWith(99, expect.stringContaining('![image](pull-request.gif)'));
  });

  it('omits a selected pull-request image when pull-request images are disabled', async () => {
    mockAddComment.mockResolvedValue(undefined);
    mockGetRandomElement.mockReturnValue('pull-request.gif');
    const param = baseParam({
      isPullRequest: true,
      images: { ...baseImages(), imagesOnPullRequest: false, pullRequestAutomaticActions: ['pull-request.gif'] },
    });

    await useCase.invoke(param);

    expect(mockAddComment.mock.calls[0][1]).not.toContain('![image](pull-request.gif)');
  });

  it('uses hotfix title when isIssue and hotfix.active', async () => {
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      isIssue: true,
      hotfix: { active: true },
      currentConfiguration: { results: [new Result({ id: 'a', success: true, executed: true, steps: ['Step'] })] },
    });
    await useCase.invoke(param);
    expect(mockAddComment).toHaveBeenCalledWith(42, expect.stringContaining('Hotfix Actions'));
  });

  it('uses feature title when isIssue and isFeature', async () => {
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      isIssue: true,
      isFeature: true,
      currentConfiguration: { results: [new Result({ id: 'a', success: true, executed: true, steps: ['Step'] })] },
    });
    await useCase.invoke(param);
    expect(mockAddComment).toHaveBeenCalledWith(42, expect.stringContaining('Feature Actions'));
  });

  it('uses docs title when isIssue and isDocs', async () => {
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      isIssue: true,
      isDocs: true,
      currentConfiguration: { results: [new Result({ id: 'a', success: true, executed: true, steps: ['Step'] })] },
    });
    await useCase.invoke(param);
    expect(mockAddComment).toHaveBeenCalledWith(42, expect.stringContaining('Documentation Actions'));
  });

  it('uses chore title when isPullRequest and isChore', async () => {
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      isPullRequest: true,
      isChore: true,
      currentConfiguration: { results: [new Result({ id: 'a', success: true, executed: true, steps: ['Step'] })] },
    });
    await useCase.invoke(param);
    expect(mockAddComment).toHaveBeenCalledWith(99, expect.stringContaining('Chore Actions'));
  });

  it('uses Automatic Actions and singleAction.issue when isSingleAction', async () => {
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      isSingleAction: true,
      singleAction: { issue: 456 },
      currentConfiguration: { results: [new Result({ id: 'a', success: true, executed: true, steps: ['Step'] })] },
    });
    await useCase.invoke(param);
    expect(mockAddComment).toHaveBeenCalledWith(456, expect.any(String));
  });

  it('includes reminder section when results have reminders', async () => {
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      isIssue: true,
      currentConfiguration: {
        results: [
          new Result({ id: 'a', success: true, executed: true, steps: ['Step'], reminders: ['Remind me'] }),
        ],
      },
    });
    await useCase.invoke(param);
    expect(mockAddComment).toHaveBeenCalledWith(42, expect.stringContaining('Reminder'));
    expect(mockAddComment).toHaveBeenCalledWith(42, expect.stringContaining('1. Remind me'));
  });

  it('includes errors section when results have errors', async () => {
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      isIssue: true,
      currentConfiguration: {
        results: [
          new Result({ id: 'a', success: true, executed: true, steps: ['Step'], errors: [new ApplicationError('workflow.failed', 'Something failed')] }),
        ],
      },
    });
    await useCase.invoke(param);
    expect(mockAddComment).toHaveBeenCalledWith(42, expect.stringContaining('Errors Found'));
  });

  it('calls addComment on issueNumber when isPush and issueNumber > 0', async () => {
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      isPush: true,
      issueNumber: 7,
      currentConfiguration: { results: [new Result({ id: 'a', success: true, executed: true, steps: ['Step'] })] },
    });
    await useCase.invoke(param);
    expect(mockAddComment).toHaveBeenCalledWith(7, expect.any(String));
  });

  it('uses issueNotBranched and Automatic Actions title when isIssue and issueNotBranched', async () => {
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      isIssue: true,
      issueNotBranched: true,
      currentConfiguration: { results: [new Result({ id: 'a', success: true, executed: true, steps: ['Step'] })] },
    });
    await useCase.invoke(param);
    expect(mockAddComment).toHaveBeenCalledWith(42, expect.stringContaining('Automatic Actions'));
  });

  it('uses bugfix title when isIssue and isBugfix', async () => {
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      isIssue: true,
      isBugfix: true,
      currentConfiguration: { results: [new Result({ id: 'a', success: true, executed: true, steps: ['Step'] })] },
    });
    await useCase.invoke(param);
    expect(mockAddComment).toHaveBeenCalledWith(42, expect.stringContaining('Bugfix Actions'));
  });

  it('uses release title when isPullRequest and release.active', async () => {
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      isPullRequest: true,
      release: { active: true },
      currentConfiguration: { results: [new Result({ id: 'a', success: true, executed: true, steps: ['Step'] })] },
    });
    await useCase.invoke(param);
    expect(mockAddComment).toHaveBeenCalledWith(99, expect.stringContaining('Release Actions'));
  });

  it('uses Automatic Actions when isPullRequest and no release/hotfix/type flags', async () => {
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      isPullRequest: true,
      release: { active: false },
      hotfix: { active: false },
      currentConfiguration: { results: [new Result({ id: 'a', success: true, executed: true, steps: ['Step'] })] },
    });
    await useCase.invoke(param);
    expect(mockAddComment).toHaveBeenCalledWith(99, expect.stringContaining('Automatic Actions'));
  });

  it('does not call addComment when isPush but issueNumber is 0', async () => {
    const param = baseParam({
      isPush: true,
      isIssue: false,
      isPullRequest: false,
      issueNumber: 0,
      currentConfiguration: { results: [new Result({ id: 'a', success: true, executed: true, steps: ['Step'] })] },
    });
    await useCase.invoke(param);
    expect(mockAddComment).not.toHaveBeenCalled();
  });
});
