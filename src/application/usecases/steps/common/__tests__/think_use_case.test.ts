import { ThinkUseCase } from '../think_use_case';
import { Ai } from '../../../../../data/model/ai';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebugInfo: jest.fn(),
}));

const mockAskAgent = jest.fn();
const mockAddComment = jest.fn();
const mockGetDescription = jest.fn();

function baseParam(overrides: Record<string, unknown> = {}) {
  return {
    owner: 'o',
    repo: 'r',
    issueNumber: 1,
    tokenUser: 'bot',
    tokens: { token: 't' },
    ai: new Ai('https://opencode.example.com', 'model-x', false, false, [], false, 'low', 20),
    labels: { isQuestion: false, isHelp: false },
    issue: {
      isIssueComment: true,
      isIssue: false,
      commentBody: '',
      number: 1,
      commentId: 42,
    },
    pullRequest: { isPullRequestReviewComment: false, commentBody: '', number: 5 },
    singleAction: { isThinkAction: false },
    commit: { branch: 'main' },
    ...overrides,
  } as unknown as Parameters<ThinkUseCase['invoke']>[0];
}

describe('ThinkUseCase', () => {
  let useCase: ThinkUseCase;

  beforeEach(() => {
    useCase = new ThinkUseCase(
      { getDescription: mockGetDescription },
      { addComment: mockAddComment, openIssue: jest.fn() },
      { query: (request: { configuration: unknown; agentId: string; prompt: string; options?: unknown }) => mockAskAgent(request.configuration, request.agentId, request.prompt, request.options) },
    );
    mockAskAgent.mockReset();
    mockAddComment.mockReset();
    mockGetDescription.mockReset();
    mockGetDescription.mockResolvedValue(undefined);
  });

  it('returns success executed false when comment body is empty', async () => {
    const param = baseParam({ issue: { ...baseParam().issue, commentBody: '' } });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it('returns success executed false when tokenUser is not set', async () => {
    const param = baseParam({
      tokenUser: '',
      issue: { ...baseParam().issue, commentBody: '@bot what is 2+2?' },
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('returns success executed false when comment does not mention @user', async () => {
    const param = baseParam({
      issue: { ...baseParam().issue, commentBody: 'hello world' },
    });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it('does not respond without @mention even when issue has question label', async () => {
    const param = baseParam({
      labels: { isQuestion: true, isHelp: false },
      issue: { ...baseParam().issue, commentBody: 'how do I configure the webhook?' },
    });

    const results = await useCase.invoke(param);

    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(mockAddComment).not.toHaveBeenCalled();
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
  });

  it('does not respond without @mention even when issue has help label', async () => {
    const param = baseParam({
      labels: { isQuestion: false, isHelp: true },
      issue: { ...baseParam().issue, commentBody: 'I need help with deployment' },
    });

    const results = await useCase.invoke(param);

    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(mockAddComment).not.toHaveBeenCalled();
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
  });

  it('responds when issue has question label and comment mentions bot', async () => {
    mockGetDescription.mockResolvedValue(undefined);
    mockAskAgent.mockResolvedValue({ answer: 'Here is the answer.' });
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      labels: { isQuestion: true, isHelp: false },
      issue: { ...baseParam().issue, commentBody: '@bot how do I configure the webhook?' },
    });

    const results = await useCase.invoke(param);

    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    expect(mockAskAgent.mock.calls[0][2]).toContain('how do I configure the webhook?');
    expect(mockAddComment).toHaveBeenCalledWith('o', 'r', 1, 'Here is the answer.', 't');
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
  });

  it('returns error when OpenCode model is empty', async () => {
    const param = baseParam({
      ai: new Ai('https://server', '', false, false, [], false, 'low', 20),
      issue: { ...baseParam().issue, commentBody: '@bot hi' },
    });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain('Configured agent model or CLI command not found.');
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('returns error when OpenCode CLI returns no answer', async () => {
    const param = baseParam({
      ai: new Ai('', 'model', false, false, [], false, 'low', 20),
      issue: { ...baseParam().issue, commentBody: '@bot hi' },
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain('Configured agent returned no answer.');
  });

  it('returns success executed false when comment is only the mention', async () => {
    const param = baseParam({
      issue: { ...baseParam().issue, commentBody: '@bot   ' },
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('calls getDescription then askAgent and addComment when comment mentions bot', async () => {
    mockGetDescription.mockResolvedValue(undefined);
    mockAskAgent.mockResolvedValue({ answer: '4' });
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      issue: { ...baseParam().issue, commentBody: '@bot what is 2+2?' },
    });

    const results = await useCase.invoke(param);

    expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 1, 't');
    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    expect(mockAddComment).toHaveBeenCalledWith('o', 'r', 1, '4', 't');
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
  });

  it('strips mention correctly when tokenUser contains regex-special chars', async () => {
    mockGetDescription.mockResolvedValue(undefined);
    mockAskAgent.mockResolvedValue({ answer: 'OK' });
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      tokenUser: 'bot.',
      issue: { ...baseParam().issue, commentBody: '@bot. what is 2+2?' },
    });

    const results = await useCase.invoke(param);

    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    const prompt = mockAskAgent.mock.calls[0][2];
    expect(prompt).toContain('Question: [BEGIN_UNTRUSTED_DATA origin=prompt.question');
    expect(prompt).toContain('what is 2+2?');
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
  });

  it('includes issue description in prompt when getDescription returns content', async () => {
    mockGetDescription.mockResolvedValue('Implement login feature for the app.');
    mockAskAgent.mockResolvedValue({ answer: 'Sure, here is how...' });
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      issue: { ...baseParam().issue, commentBody: '@bot how should I start?', number: 42 },
    });

    await useCase.invoke(param);

    expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 42, 't');
    const prompt = mockAskAgent.mock.calls[0][2];
    expect(prompt).toContain('Context (issue #42 description):');
    expect(prompt).toContain('Implement login feature for the app.');
    expect(prompt).toContain('Question: [BEGIN_UNTRUSTED_DATA origin=prompt.question');
    expect(prompt).toContain('how should I start?');
  });

  it('for PR review comment uses issueNumber to fetch issue description', async () => {
    mockGetDescription.mockResolvedValue('Original issue description.');
    mockAskAgent.mockResolvedValue({ answer: 'Reply' });
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      issue: { ...baseParam().issue, isIssueComment: false, commentBody: '', number: 0 },
      pullRequest: {
        isPullRequestReviewComment: true,
        commentBody: '@bot summarize',
        number: 7,
      },
      issueNumber: 123,
    });

    await useCase.invoke(param);

    expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 123, 't');
    const prompt = mockAskAgent.mock.calls[0][2];
    expect(prompt).toContain('Context (issue #123 description):');
    expect(prompt).toContain('Original issue description.');
  });

  it('returns error when OpenCode returns no answer', async () => {
    mockAskAgent.mockResolvedValue(undefined);
    const param = baseParam({
      issue: { ...baseParam().issue, commentBody: '@bot hello' },
    });

    const results = await useCase.invoke(param);

    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    expect(mockAddComment).not.toHaveBeenCalled();
    expect(results[0].success).toBe(false);
    expect(results[0].executed).toBe(true);
    expect(results[0].errors.map((error) => error.message)).toContain('Configured agent returned no answer.');
  });

  it('returns error when OpenCode returns empty answer', async () => {
    mockAskAgent.mockResolvedValue({ answer: '' });
    const param = baseParam({
      issue: { ...baseParam().issue, commentBody: '@bot hello' },
    });

    const results = await useCase.invoke(param);

    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    expect(mockAddComment).not.toHaveBeenCalled();
    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain('Configured agent returned no answer.');
  });

  it('posts comment to PR number when pull_request_review_comment', async () => {
    mockAskAgent.mockResolvedValue({ answer: 'Reply' });
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      issue: { ...baseParam().issue, isIssueComment: false, commentBody: '' },
      pullRequest: {
        isPullRequestReviewComment: true,
        commentBody: '@bot explain this',
        number: 7,
      },
    });

    const results = await useCase.invoke(param);

    expect(mockAddComment).toHaveBeenCalledWith('o', 'r', 7, 'Reply', 't');
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
  });

  it('returns error result when addComment throws', async () => {
    mockAskAgent.mockResolvedValue({ answer: 'ok' });
    mockAddComment.mockRejectedValue(new Error('API error'));
    const param = baseParam({
      issue: { ...baseParam().issue, commentBody: '@bot hi' },
    });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.some((e) => String(e).includes('ThinkUseCase'))).toBe(true);
  });

  it('returns error when issue or PR number is 0 or negative', async () => {
    mockAskAgent.mockResolvedValue({ answer: 'Reply' });
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      issue: { ...baseParam().issue, commentBody: '@bot hi', number: 0 },
    });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain('Issue or PR number not available.');
    expect(mockAddComment).not.toHaveBeenCalled();
  });
});
