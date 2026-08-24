import { CheckPullRequestCommentLanguageUseCase } from '../check_pull_request_comment_language_use_case';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logDebugInfo: jest.fn(),
}));

const translatedKey = `<!-- content_translated
If you'd like this comment to be translated again, please delete the entire comment, including this message. It will then be processed as a new one.
-->`;

const mockAskAgent = jest.fn();
const mockUpdateComment = jest.fn();

function baseParam(overrides: Record<string, unknown> = {}) {
  return {
    owner: 'o',
    repo: 'r',
    pullRequest: { number: 5, commentId: 10, commentBody: 'Hello' },
    tokens: { token: 't' },
    locale: { pullRequest: 'Spanish' },
    ai: { getAgentConfiguration: () => ({ provider: 'opencode', model: 'model', command: 'opencode run' }) },
    ...overrides,
  } as unknown as Parameters<CheckPullRequestCommentLanguageUseCase['invoke']>[0];
}

describe('CheckPullRequestCommentLanguageUseCase', () => {
  let useCase: CheckPullRequestCommentLanguageUseCase;

  beforeEach(() => {
    useCase = new CheckPullRequestCommentLanguageUseCase({ updateComment: mockUpdateComment }, { query: (request: { configuration: unknown; agentId: string; prompt: string; options?: unknown }) => mockAskAgent(request.configuration, request.agentId, request.prompt, request.options) });
    mockAskAgent.mockReset();
    mockUpdateComment.mockReset();
  });

  it('returns success executed false when commentBody is empty', async () => {
    const param = baseParam({ pullRequest: { number: 5, commentId: 0, commentBody: '' } });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('returns success executed false when commentBody contains translatedKey', async () => {
    const param = baseParam({
      pullRequest: { number: 5, commentId: 0, commentBody: `Done\n${translatedKey}` },
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('returns success executed true when AI responds done', async () => {
    mockAskAgent.mockResolvedValue({ status: 'done' });
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    const checkPrompt = mockAskAgent.mock.calls[0][2];
    expect(checkPrompt).toContain('Spanish');
    expect(checkPrompt).toContain('Hello');
  });

  it('calls updateComment when must_translate and askAgent returns schema with translatedText', async () => {
    mockAskAgent
      .mockResolvedValueOnce({ status: 'must_translate' })
      .mockResolvedValueOnce({ translatedText: 'Hola traducido' });
    mockUpdateComment.mockResolvedValue(undefined);
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(mockAskAgent).toHaveBeenCalledTimes(2);
    const translatePrompt = mockAskAgent.mock.calls[1][2];
    expect(translatePrompt).toContain('Spanish');
    expect(translatePrompt).toContain('Hello');
    expect(mockUpdateComment).toHaveBeenCalledWith(
      'o',
      'r',
      5,
      10,
      expect.stringContaining('Hola traducido'),
      't'
    );
  });

  it('does not update comment when askAgent returns undefined for translation', async () => {
    mockAskAgent
      .mockResolvedValueOnce({ status: 'must_translate' })
      .mockResolvedValueOnce(undefined);
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(mockAskAgent).toHaveBeenCalledTimes(2);
    expect(mockUpdateComment).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
  });

  it('does not update comment when askAgent returns empty translatedText', async () => {
    mockAskAgent
      .mockResolvedValueOnce({ status: 'must_translate' })
      .mockResolvedValueOnce({ translatedText: '' });
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(mockAskAgent).toHaveBeenCalledTimes(2);
    expect(mockUpdateComment).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
  });

  it('calls translation and updateComment when language check returns null', async () => {
    mockAskAgent
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ translatedText: 'Hola' });
    mockUpdateComment.mockResolvedValue(undefined);
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(mockAskAgent).toHaveBeenCalledTimes(2);
    expect(mockUpdateComment).toHaveBeenCalledWith(
      'o',
      'r',
      5,
      10,
      expect.stringContaining('Hola'),
      't'
    );
    expect(results.length).toBeGreaterThanOrEqual(0);
  });
});
