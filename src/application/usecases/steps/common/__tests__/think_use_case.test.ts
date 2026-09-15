import { ThinkUseCase } from '../think_use_case';
import { Ai } from '../../../../../data/model/ai';
import { projectThinkContext, type ThinkContextSource } from '../think_workflow';
import type { AgentQueryResult } from '../../../../ports/agent_query_ports';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebugInfo: jest.fn(),
}));

const mockAskAgent = jest.fn();
const mockGetDescription = jest.fn();

async function localizedAnswer(prompt: string): Promise<AgentQueryResult> {
  const response = await mockAskAgent.mock.results[mockAskAgent.mock.results.length - 1]?.value;
  if (!response || typeof response !== 'object' || Array.isArray(response)) return response;
  const outputLocale = prompt.includes('es-ES') ? 'es-ES' : 'en-US';
  return { outputLocale, ...response as Record<string, unknown> };
}

function baseParam(overrides: Record<string, unknown> = {}) {
  return {
    owner: 'o',
    repo: 'r',
    isPullRequest: false,
    issueNumber: 1,
    tokenUser: 'bot',
    tokens: { token: 't' },
    ai: new Ai('https://opencode.example.com', 'model-x', false, [], false, 'low', 20),
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
  } as unknown as ThinkContextSource & { readonly labels: { readonly isQuestion: boolean; readonly isHelp: boolean } };
}

describe('ThinkUseCase', () => {
  let useCase: ThinkUseCase;

  beforeEach(() => {
    useCase = new ThinkUseCase(
      { getDescription: mockGetDescription },
      { query: async (request: { configuration: unknown; agentId: string; prompt: string; options?: unknown }) => {
        mockAskAgent(request.configuration, request.agentId, request.prompt, request.options);
        return localizedAnswer(request.prompt);
      } },
    );
    mockAskAgent.mockReset();
    mockGetDescription.mockReset();
    mockGetDescription.mockResolvedValue(undefined);
  });

  function invoke(param: ThinkContextSource) {
    return useCase.invoke(projectThinkContext(param));
  }

  it('returns success executed false when comment body is empty', async () => {
    const param = baseParam({ issue: { ...baseParam().issue, commentBody: '' } });

    const results = await invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('returns success executed false when tokenUser is not set', async () => {
    const param = baseParam({
      tokenUser: '',
      issue: { ...baseParam().issue, commentBody: '@bot what is 2+2?' },
    });

    const results = await invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('executes an explicit command without requiring a bot username', async () => {
    mockAskAgent.mockResolvedValue({ answer: 'Plan ready.' });
    const param = baseParam({
      tokenUser: '',
      issue: { ...baseParam().issue, commentBody: '/copilot plan the rollout' },
    });

    const context = projectThinkContext(param);
    const results = await useCase.invoke(context);

    expect(context).toMatchObject({
      request: { kind: 'ready', command: { name: 'plan', arguments: ['the', 'rollout'] } },
      agentTask: 'planner',
    });
    expect('tokenUser' in context).toBe(false);
    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    expect(results[0]).toMatchObject({ success: true, executed: true });
  });

  it('returns a local semantic answer without an issue, mention, or publication target', async () => {
    mockAskAgent.mockResolvedValue({ answer: 'Usa el catálogo configurado.' });
    const context = projectThinkContext(baseParam({
      issueNumber: -1,
      tokenUser: '',
      issue: { ...baseParam().issue, commentBody: 'explica el catálogo', number: -1 },
      singleAction: { isThinkAction: true, issue: 0 },
      locale: { repository: 'es-ES', issue: 'en-US', pullRequest: 'en-US' },
    }));

    const results = await useCase.invoke(context);

    expect(context).toMatchObject({
      request: { kind: 'ready', question: 'explica el catálogo', destinationType: 'local' },
      targetLocale: 'es-ES',
    });
    expect(mockGetDescription).not.toHaveBeenCalled();
    expect(mockAskAgent.mock.calls[0][2]).toContain('outputLocale` set exactly to `es-ES');
    expect(results[0]).toMatchObject({
      success: true,
      executed: true,
      payload: { publication: { kind: 'direct-answer', answer: 'Usa el catálogo configurado.' } },
    });
  });

  it('skips an invalid explicit command before invoking the agent', async () => {
    const results = await invoke(baseParam({
      issue: { ...baseParam().issue, commentBody: '/copilot unknown' },
    }));

    expect(results[0]).toMatchObject({ success: true, executed: false });
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('returns a contract error for a ready context without selected agent configuration', async () => {
    const results = await useCase.invoke({
      request: {
        kind: 'ready',
        commentBody: '/copilot plan rollout',
        question: 'Plan rollout',
        issueNumberForContext: 1,
        destinationNumber: 1,
        destinationType: 'issue',
      },
      agentTask: 'planner',
    } as never);

    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.code)).toContain('provider.contract-invalid');
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('defaults a legacy ready context without targetLocale to canonical English', async () => {
    mockAskAgent.mockResolvedValue({ answer: 'Plan ready.' });
    const ai = new Ai('https://opencode.example.com', 'model-x', false, [], false, 'low', 20);

    const results = await useCase.invoke({
      request: {
        kind: 'ready',
        commentBody: '/copilot plan rollout',
        question: 'Plan rollout',
        issueNumberForContext: 1,
        destinationNumber: 1,
        destinationType: 'issue',
      },
      agentTask: 'planner',
      agentConfiguration: ai.getAgentConfiguration('planner'),
    });

    expect(mockAskAgent.mock.calls[0][2]).toContain('outputLocale` set exactly to `en-US');
    expect(results[0]).toMatchObject({
      success: true,
      executed: true,
      payload: { publication: { kind: 'direct-answer', answer: 'Plan ready.' } },
    });
  });

  it('carries translation provenance as typed semantic publication data', async () => {
    mockAskAgent.mockResolvedValue({ answer: 'Use the documented setting.' });
    const ai = new Ai('https://opencode.example.com', 'model-x', false, [], false, 'low', 20);

    const results = await useCase.invoke({
      request: {
        kind: 'ready',
        commentBody: '@bot usa esto',
        question: 'use this',
        issueNumberForContext: 1,
        destinationNumber: 1,
        destinationType: 'issue',
      },
      agentTask: 'planner',
      agentConfiguration: ai.getAgentConfiguration('planner'),
      targetLocale: 'en-US',
      translationPublication: {
        translatedText: 'use this',
        originalText: '@bot usa esto',
        sourceLocale: 'es-ES',
        targetLocale: 'en-US',
      },
    });

    expect(results[0].payload).toEqual({
      publication: {
        kind: 'direct-answer',
        answer: 'Use the documented setting.',
        translation: {
          translatedText: 'use this',
          originalText: '@bot usa esto',
          sourceLocale: 'es-ES',
          targetLocale: 'en-US',
        },
      },
    });
  });

  it('returns success executed false when comment does not mention @user', async () => {
    const param = baseParam({
      issue: { ...baseParam().issue, commentBody: 'hello world' },
    });

    const results = await invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('does not respond without @mention even when issue has question label', async () => {
    const param = baseParam({
      labels: { isQuestion: true, isHelp: false },
      issue: { ...baseParam().issue, commentBody: 'how do I configure the webhook?' },
    });

    const results = await invoke(param);

    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
  });

  it('does not respond without @mention even when issue has help label', async () => {
    const param = baseParam({
      labels: { isQuestion: false, isHelp: true },
      issue: { ...baseParam().issue, commentBody: 'I need help with deployment' },
    });

    const results = await invoke(param);

    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
  });

  it('responds when issue has question label and comment mentions bot', async () => {
    mockGetDescription.mockResolvedValue(undefined);
    mockAskAgent.mockResolvedValue({ answer: 'Here is the answer.' });
    const param = baseParam({
      labels: { isQuestion: true, isHelp: false },
      issue: { ...baseParam().issue, commentBody: '@bot how do I configure the webhook?' },
    });

    const results = await invoke(param);

    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    expect(mockAskAgent.mock.calls[0][2]).toContain('how do I configure the webhook?');
    expect(results[0]).toMatchObject({
      success: true,
      executed: true,
      payload: { publication: { kind: 'direct-answer', answer: 'Here is the answer.' } },
    });
  });

  it('rejects a response for another locale before posting the answer', async () => {
    mockAskAgent.mockResolvedValue({ outputLocale: 'fr-FR', answer: 'Réponse.' });
    const param = baseParam({
      locale: { issue: 'en-US', pullRequest: 'en-US' },
      issue: { ...baseParam().issue, commentBody: '@bot answer this' },
    });

    const results = await invoke(param);

    expect(results[0].errors[0]).toMatchObject({ code: 'locale.output-invalid' });
  });

  it('returns error when OpenCode model is empty', async () => {
    const param = baseParam({
      ai: new Ai('https://server', '', false, [], false, 'low', 20),
      issue: { ...baseParam().issue, commentBody: '@bot hi' },
    });

    const results = await invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain('Configured agent model or executable not found.');
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('returns error when OpenCode CLI returns no answer', async () => {
    const param = baseParam({
      ai: new Ai('', 'model', false, [], false, 'low', 20),
      issue: { ...baseParam().issue, commentBody: '@bot hi' },
    });

    const results = await invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain('Configured agent returned no answer.');
  });

  it('returns success executed false when comment is only the mention', async () => {
    const param = baseParam({
      issue: { ...baseParam().issue, commentBody: '@bot   ' },
    });

    const results = await invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('loads issue context and returns a semantic answer when a comment mentions the bot', async () => {
    mockGetDescription.mockResolvedValue(undefined);
    mockAskAgent.mockResolvedValue({ answer: '4' });
    const param = baseParam({
      issue: { ...baseParam().issue, commentBody: '@bot what is 2+2?' },
    });

    const results = await invoke(param);

    expect(mockGetDescription).toHaveBeenCalledWith(1);
    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      success: true,
      executed: true,
      payload: { publication: { kind: 'direct-answer', answer: '4' } },
    });
  });

  it('strips mention correctly when tokenUser contains regex-special chars', async () => {
    mockGetDescription.mockResolvedValue(undefined);
    mockAskAgent.mockResolvedValue({ answer: 'OK' });
    const param = baseParam({
      tokenUser: 'bot.',
      issue: { ...baseParam().issue, commentBody: '@bot. what is 2+2?' },
    });

    const results = await invoke(param);

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
    const param = baseParam({
      issue: { ...baseParam().issue, commentBody: '@bot how should I start?', number: 42 },
    });

    await invoke(param);

    expect(mockGetDescription).toHaveBeenCalledWith(42);
    const prompt = mockAskAgent.mock.calls[0][2];
    expect(prompt).toContain('Context (issue #42 description):');
    expect(prompt).toContain('Implement login feature for the app.');
    expect(prompt).toContain('Question: [BEGIN_UNTRUSTED_DATA origin=prompt.question');
    expect(prompt).toContain('how should I start?');
  });

  it('for PR review comment uses issueNumber to fetch issue description', async () => {
    mockGetDescription.mockResolvedValue('Original issue description.');
    mockAskAgent.mockResolvedValue({ answer: 'Reply' });
    const param = baseParam({
      isPullRequest: true,
      issue: { ...baseParam().issue, isIssueComment: false, commentBody: '', number: 0 },
      pullRequest: {
        isPullRequestReviewComment: true,
        commentBody: '@bot summarize',
        number: 7,
      },
      issueNumber: 123,
    });

    await invoke(param);

    expect(mockGetDescription).toHaveBeenCalledWith(123);
    const prompt = mockAskAgent.mock.calls[0][2];
    expect(prompt).toContain('Context (issue #123 description):');
    expect(prompt).toContain('Original issue description.');
  });

  it('returns error when OpenCode returns no answer', async () => {
    mockAskAgent.mockResolvedValue(undefined);
    const param = baseParam({
      issue: { ...baseParam().issue, commentBody: '@bot hello' },
    });

    const results = await invoke(param);

    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    expect(results[0].success).toBe(false);
    expect(results[0].executed).toBe(true);
    expect(results[0].errors.map((error) => error.message)).toContain('Configured agent returned no answer.');
  });

  it('returns error when OpenCode returns empty answer', async () => {
    mockAskAgent.mockResolvedValue({ answer: '' });
    const param = baseParam({
      issue: { ...baseParam().issue, commentBody: '@bot hello' },
    });

    const results = await invoke(param);

    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain('Configured agent returned no answer.');
  });

  it('returns a semantic answer for a pull-request review comment', async () => {
    mockAskAgent.mockResolvedValue({ answer: 'Reply' });
    const param = baseParam({
      isPullRequest: true,
      issue: { ...baseParam().issue, isIssueComment: false, commentBody: '' },
      pullRequest: {
        isPullRequestReviewComment: true,
        commentBody: '@bot explain this',
        number: 7,
      },
    });

    const results = await invoke(param);

    expect(results[0]).toMatchObject({
      success: true,
      executed: true,
      payload: { publication: { kind: 'direct-answer', answer: 'Reply' } },
    });
  });

  it('returns error when issue or PR number is 0 or negative', async () => {
    mockAskAgent.mockResolvedValue({ answer: 'Reply' });
    const param = baseParam({
      issue: { ...baseParam().issue, commentBody: '@bot hi', number: 0 },
    });

    const results = await invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain('Issue or PR number not available.');
  });
});
