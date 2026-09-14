import { AnswerIssueHelpUseCase } from '../answer_issue_help_use_case';
import { Ai } from '../../../../../data/model/ai';
import type { AnswerIssueHelpContext } from '../../../issue_workflow_context';
import type { AgentQueryResult } from '../../../../ports/agent_query_ports';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebugInfo: jest.fn(),
}));

jest.mock('../../../../../utils/task_emoji', () => ({
  getTaskEmoji: jest.fn(() => '💬'),
}));

const mockAskAgent = jest.fn();
async function localizedAnswer(prompt: string): Promise<AgentQueryResult> {
  const response = await mockAskAgent.mock.results[mockAskAgent.mock.results.length - 1]?.value;
  if (!response || typeof response !== 'object' || Array.isArray(response)) return response;
  const outputLocale = prompt.includes('es-ES') ? 'es-ES' : 'en-US';
  return { outputLocale, ...response as Record<string, unknown> };
}
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
    ...overrides,
  };
}

describe('AnswerIssueHelpUseCase', () => {
  let useCase: AnswerIssueHelpUseCase;

  beforeEach(() => {
    useCase = new AnswerIssueHelpUseCase({ query: async (request: { configuration: unknown; agentId: string; prompt: string; options?: unknown }) => {
      mockAskAgent(request.configuration, request.agentId, request.prompt, request.options);
      return localizedAnswer(request.prompt);
    } });
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

  it('returns a semantic direct-answer projection when the agent answers', async () => {
    mockAskAgent.mockResolvedValue({ answer: 'You can set the webhook in Settings > Integrations.' });
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    const prompt = mockAskAgent.mock.calls[0][2];
    expect(prompt).toContain('question/help issue');
    expect(prompt).toContain('How do I configure the webhook for this project?');
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(results[0].payload).toEqual({
      publication: {
        kind: 'direct-answer',
        answer: 'You can set the webhook in Settings > Integrations.',
      },
    });
  });

  it('runs when issue has help label', async () => {
    mockAskAgent.mockResolvedValue({ answer: 'Here is some help.' });
    const param = baseParam({
      questionOrHelp: true,
      description: 'I need help with deployment',
    });

    const results = await useCase.invoke(param);

    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    expect(mockAskAgent.mock.calls[0][2]).toContain('I need help with deployment');
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
  });

  it('targets the configured issue locale and preserves the validated answer', async () => {
    mockAskAgent.mockResolvedValue({ answer: 'Aquí tienes ayuda.' });

    const results = await useCase.invoke(baseParam({ locale: 'es-ES' }));

    expect(mockAskAgent.mock.calls[0][2]).toContain('human-readable sentence in es-ES');
    expect(results[0].payload).toEqual({
      publication: { kind: 'direct-answer', answer: 'Aquí tienes ayuda.' },
    });
  });

  it('rejects a response for another locale before posting help', async () => {
    mockAskAgent.mockResolvedValue({ outputLocale: 'fr-FR', answer: 'Aide.' });

    const results = await useCase.invoke(baseParam({ locale: 'en-US' }));

    expect(results[0].errors[0]).toMatchObject({ code: 'locale.output-invalid' });
  });

  it('returns failure when OpenCode returns no answer', async () => {
    mockAskAgent.mockResolvedValue(undefined);
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    expect(results[0].success).toBe(false);
    expect(results[0].executed).toBe(true);
    expect(results[0].errors.map((error) => error.message)).toContain('Configured agent returned no answer for initial help.');
  });

  it('returns failure when OpenCode returns empty answer', async () => {
    mockAskAgent.mockResolvedValue({ answer: '' });
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain('Configured agent returned no answer for initial help.');
  });

  it('returns failure when the agent query throws', async () => {
    mockAskAgent.mockRejectedValue(new Error('Agent API error'));
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].errors?.some((e) => String(e).includes('AnswerIssueHelpUseCase'))).toBe(true);
  });
});
