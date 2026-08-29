import { AnswerIssueHelpUseCase } from '../answer_issue_help_use_case';
import { Ai } from '../../../../../data/model/ai';
import type { Execution } from '../../../../../data/model/execution';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebugInfo: jest.fn(),
}));

jest.mock('../../../../../utils/task_emoji', () => ({
  getTaskEmoji: jest.fn(() => '💬'),
}));

const mockAddComment = jest.fn();


const mockAskAgent = jest.fn();
function baseParam(overrides: Record<string, unknown> = {}): Execution {
  return {
    owner: 'owner',
    repo: 'repo',
    issueNumber: 1,
    tokens: { token: 'token' },
    ai: new Ai('http://localhost:4096', 'opencode/model', false, false, [], false, 'low', 20),
    labels: { isQuestion: true, isHelp: false },
    issue: {
      opened: true,
      number: 1,
      body: 'How do I configure the webhook for this project?',
    },
    ...overrides,
  } as unknown as Execution;
}

describe('AnswerIssueHelpUseCase', () => {
  let useCase: AnswerIssueHelpUseCase;

  beforeEach(() => {
    useCase = new AnswerIssueHelpUseCase({ addComment: mockAddComment, openIssue: jest.fn() }, { query: (request: { configuration: unknown; agentId: string; prompt: string; options?: unknown }) => mockAskAgent(request.configuration, request.agentId, request.prompt, request.options) });
    mockAddComment.mockReset();
    mockAskAgent.mockReset();
  });

  it('skips (executed false) when issue is not opened', async () => {
    const param = baseParam({
      issue: { ...baseParam().issue, opened: false, number: 1, body: 'Question?' },
    });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it('skips when issue is not question or help', async () => {
    const param = baseParam({
      labels: { isQuestion: false, isHelp: false },
      issue: { ...baseParam().issue, opened: true, number: 1, body: 'Implement feature X' },
    });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('skips when OpenCode is not configured', async () => {
    const param = baseParam({
      ai: new Ai('', '', false, false, [], false, 'low', 20),
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('skips when issue number is invalid', async () => {
    const param = baseParam({
      issue: { ...baseParam().issue, opened: true, number: 0, body: 'Question?' },
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('skips when issue body is empty', async () => {
    const param = baseParam({
      issue: { ...baseParam().issue, opened: true, number: 1, body: '' },
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('calls askAgent with description and posts comment when OpenCode returns answer', async () => {
    mockAskAgent.mockResolvedValue({ answer: 'You can set the webhook in Settings > Integrations.' });
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    const prompt = mockAskAgent.mock.calls[0][2];
    expect(prompt).toContain('question/help issue');
    expect(prompt).toContain('How do I configure the webhook for this project?');
    expect(mockAddComment).toHaveBeenCalledWith(
      'owner',
      'repo',
      1,
      'You can set the webhook in Settings > Integrations.',
      'token'
    );
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
  });

  it('runs when issue has help label', async () => {
    mockAskAgent.mockResolvedValue({ answer: 'Here is some help.' });
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      labels: { isQuestion: false, isHelp: true },
      issue: { ...baseParam().issue, body: 'I need help with deployment' },
    });

    const results = await useCase.invoke(param);

    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    expect(mockAskAgent.mock.calls[0][2]).toContain('I need help with deployment');
    expect(mockAddComment).toHaveBeenCalledWith('owner', 'repo', 1, 'Here is some help.', 'token');
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
  });

  it('returns failure when OpenCode returns no answer', async () => {
    mockAskAgent.mockResolvedValue(undefined);
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    expect(mockAddComment).not.toHaveBeenCalled();
    expect(results[0].success).toBe(false);
    expect(results[0].executed).toBe(true);
    expect(results[0].errors.map((error) => error.message)).toContain('Configured agent returned no answer for initial help.');
  });

  it('returns failure when OpenCode returns empty answer', async () => {
    mockAskAgent.mockResolvedValue({ answer: '' });
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(mockAddComment).not.toHaveBeenCalled();
    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain('Configured agent returned no answer for initial help.');
  });

  it('returns failure when addComment throws', async () => {
    mockAskAgent.mockResolvedValue({ answer: 'Help text' });
    mockAddComment.mockRejectedValue(new Error('API error'));
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].errors?.some((e) => String(e).includes('AnswerIssueHelpUseCase'))).toBe(true);
  });
});
