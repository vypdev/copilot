import { CheckIssueCommentLanguageUseCase } from '../check_issue_comment_language_use_case';

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
    issue: { number: 1, commentId: 42, commentBody: 'Hello world' },
    tokens: { token: 't' },
    locale: { issue: 'Spanish' },
    ai: { getAgentConfiguration: () => ({ provider: 'opencode', model: 'model', command: 'opencode run' }) },
    ...overrides,
  } as unknown as Parameters<CheckIssueCommentLanguageUseCase['invoke']>[0];
}

describe('CheckIssueCommentLanguageUseCase', () => {
  let useCase: CheckIssueCommentLanguageUseCase;

  beforeEach(() => {
    useCase = new CheckIssueCommentLanguageUseCase({ updateComment: mockUpdateComment }, { query: (request: { configuration: unknown; agentId: string; prompt: string; options?: unknown }) => mockAskAgent(request.configuration, request.agentId, request.prompt, request.options) });
    mockAskAgent.mockReset();
    mockUpdateComment.mockReset();
  });

  it('returns success executed false when commentBody is empty', async () => {
    const param = baseParam({ issue: { number: 1, commentId: 0, commentBody: '' } });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('returns success executed false when commentBody already contains translatedKey', async () => {
    const param = baseParam({
      issue: { number: 1, commentId: 0, commentBody: `Translated text\n${translatedKey}` },
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('returns success executed true when AI responds done (already in locale)', async () => {
    mockAskAgent.mockResolvedValue({ status: 'done' });
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    const checkPrompt = mockAskAgent.mock.calls[0][2];
    expect(checkPrompt).toContain('Spanish');
    expect(checkPrompt).toContain('Hello world');
    expect(mockUpdateComment).not.toHaveBeenCalled();
  });

  it('calls updateComment when AI responds must_translate and askAgent returns schema with translatedText', async () => {
    mockAskAgent
      .mockResolvedValueOnce({ status: 'must_translate' })
      .mockResolvedValueOnce({ translatedText: 'Texto traducido' });
    mockUpdateComment.mockResolvedValue(undefined);
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(mockAskAgent).toHaveBeenCalledTimes(2);
    const translatePrompt = mockAskAgent.mock.calls[1][2];
    expect(translatePrompt).toContain('Spanish');
    expect(translatePrompt).toContain('Hello world');
    expect(mockUpdateComment).toHaveBeenCalledWith(
      'o',
      'r',
      1,
      42,
      expect.stringContaining('Texto traducido'),
      't'
    );
    expect(results.length).toBeGreaterThanOrEqual(0);
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
      .mockResolvedValueOnce({ translatedText: '   ' });
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(mockAskAgent).toHaveBeenCalledTimes(2);
    expect(mockUpdateComment).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
  });

  it('does not update comment when askAgent returns translatedText missing', async () => {
    mockAskAgent
      .mockResolvedValueOnce({ status: 'must_translate' })
      .mockResolvedValueOnce({ reason: 'Ambiguous input' });
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
      1,
      42,
      expect.stringContaining('Hola'),
      't'
    );
    expect(results.length).toBeGreaterThanOrEqual(0);
  });
});
