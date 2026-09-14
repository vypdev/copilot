import { AnswerIssueHelpUseCase } from '../answer_issue_help_use_case';
import { Ai } from '../../../../../data/model/ai';
import type { AnswerIssueHelpContext } from '../../../issue_workflow_context';

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
function configuredAgent() {
  return new Ai('http://localhost:4096', 'opencode/model', false, [], false, 'low', 20)
    .getAgentConfiguration('planner');
}

function baseParam(overrides: Partial<AnswerIssueHelpContext> = {}): AnswerIssueHelpContext {
  return {
    issueNumber: 1,
    opened: true,
    questionOrHelp: true,
    description: 'How do I configure the webhook for this project?',
    agentConfiguration: configuredAgent(),
    locale: 'en-US',
    newIssue: false,
    ...overrides,
  };
}

describe('AnswerIssueHelpUseCase', () => {
  let useCase: AnswerIssueHelpUseCase;

  beforeEach(() => {
    useCase = new AnswerIssueHelpUseCase({ addComment: mockAddComment }, { query: (request: { configuration: unknown; agentId: string; prompt: string; options?: unknown }) => mockAskAgent(request.configuration, request.agentId, request.prompt, request.options) });
    mockAddComment.mockReset();
    mockAskAgent.mockReset();
  });

  it('skips (executed false) when issue is not opened', async () => {
    const param = baseParam({
      opened: false,
      description: 'Question?',
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
      questionOrHelp: false,
      description: 'Implement feature X',
    });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('skips when OpenCode is not configured', async () => {
    const param = baseParam({
      agentConfiguration: new Ai('', '', false, [], false, 'low', 20).getAgentConfiguration('planner'),
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('skips when issue number is invalid', async () => {
    const param = baseParam({
      issueNumber: 0,
      description: 'Question?',
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('skips when issue body is empty', async () => {
    const param = baseParam({
      description: '',
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
      1,
      'You can set the webhook in Settings > Integrations.',
    );
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
  });

  it('runs when issue has help label', async () => {
    mockAskAgent.mockResolvedValue({ answer: 'Here is some help.' });
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      questionOrHelp: true,
      description: 'I need help with deployment',
    });

    const results = await useCase.invoke(param);

    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    expect(mockAskAgent.mock.calls[0][2]).toContain('I need help with deployment');
    expect(mockAddComment).toHaveBeenCalledWith(1, 'Here is some help.');
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
  });

  it('includes the bot welcome in the first answer for a newly opened issue', async () => {
    mockAskAgent.mockResolvedValue({ answer: 'Here is some help.' });
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam({
      tokenUser: 'vypbot',
      newIssue: true,
    });

    await useCase.invoke(param);

    const publishedComment = mockAddComment.mock.calls[0][1] as string;
    expect(publishedComment).toContain('<!-- copilot:welcome -->');
    expect(publishedComment).toContain('Hi! I’m **@vypbot**');
    expect(publishedComment).toContain('Here is some help.');
  });

  it('targets the configured issue locale and localizes the first welcome', async () => {
    mockAskAgent.mockResolvedValue({ answer: 'Aquí tienes ayuda.' });
    mockAddComment.mockResolvedValue(undefined);

    await useCase.invoke(baseParam({ tokenUser: 'vypbot', newIssue: true, locale: 'es-ES' }));

    expect(mockAskAgent.mock.calls[0][2]).toContain('human-readable sentence in es-ES');
    const publishedComment = mockAddComment.mock.calls[0][1] as string;
    expect(publishedComment).toContain('Hola, soy **@vypbot**');
    expect(publishedComment).toContain('Aquí tienes ayuda.');
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
