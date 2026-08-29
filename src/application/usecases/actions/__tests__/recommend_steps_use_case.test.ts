import { RecommendStepsUseCase } from '../recommend_steps_use_case';
import { Ai } from '../../../../data/model/ai';
import { Config } from '../../../../data/model/config';
import type { Execution } from '../../../../data/model/execution';

jest.mock('../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebugInfo: jest.fn(),
}));

jest.mock('../../../../utils/task_emoji', () => ({
  getTaskEmoji: jest.fn(() => '💡'),
}));

const mockGetDescription = jest.fn();
const mockAskAgent = jest.fn();

function baseParam(overrides: Record<string, unknown> = {}): Execution {
  return {
    owner: 'owner',
    repo: 'repo',
    issueNumber: 42,
    tokens: { token: 'token' },
    currentConfiguration: new Config({}),
    ai: new Ai('http://localhost:4096', 'opencode/model', false, false, [], false, 'low', 20),
    ...overrides,
  } as unknown as Execution;
}
describe('RecommendStepsUseCase', () => {
  let useCase: RecommendStepsUseCase;

  beforeEach(() => {
    useCase = new RecommendStepsUseCase({ getDescription: mockGetDescription }, { query: (request: { configuration: unknown; agentId: string; prompt: string; options?: unknown }) => mockAskAgent(request.configuration, request.agentId, request.prompt, request.options) });
    mockGetDescription.mockReset();
    mockAskAgent.mockReset();
  });

  it('returns failure when ai has no opencode model or server URL', async () => {
    const param = baseParam({ ai: new Ai('', '', false, false, [], false, 'low', 20) });
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors).toContain('Missing agent CLI command and model.');
  });

  it('returns failure when issueNumber is -1', async () => {
    const param = baseParam({ issueNumber: -1 });
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors).toContain('Issue number not found.');
  });

  it('returns failure when issue description is empty or missing', async () => {
    mockGetDescription.mockResolvedValue('');
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.some((e) => String(e).includes('No description found'))).toBe(true);
  });

  it('returns success with recommended steps when AI returns string', async () => {
    mockGetDescription.mockResolvedValue('Implement login feature.');
    mockAskAgent.mockResolvedValue('1. Add auth module\n2. Add tests');
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].steps).toBeDefined();
    expect(results[0].stepFormat).toBe('markdown');
    expect(results[0].steps[0]).toBe('## Recommended implementation steps');
    expect(results[0].payload?.recommendedSteps).toContain('1. Add auth module');
    const prompt = mockAskAgent.mock.calls[0][2];
    expect(prompt).toContain('42');
    expect(prompt).toContain('Implement login feature.');
  });

  it('returns success when AI returns object with steps', async () => {
    mockGetDescription.mockResolvedValue('Fix bug.');
    mockAskAgent.mockResolvedValue({ steps: '1. Reproduce\n2. Fix' });
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(true);
    expect(results[0].payload?.recommendedSteps).toContain('1. Reproduce');
  });

  it('removes Copilot metadata from the prompt and fingerprint input', async () => {
    mockGetDescription.mockResolvedValue('Implement login feature.\n\n<!-- copilot-configuration-start\n{"recommendationState":{"ignored":"metadata"}}\ncopilot-configuration-end -->');
    mockAskAgent.mockResolvedValue('1. Add auth module');

    const results = await useCase.invoke(baseParam());

    expect(results[0].success).toBe(true);
    const prompt = mockAskAgent.mock.calls[0][2];
    expect(prompt).toContain('Implement login feature.');
    expect(prompt).not.toContain('recommendationState');
  });

  it('skips the agent when the visible issue description is unchanged', async () => {
    mockGetDescription.mockResolvedValue('Implement login feature.');
    const previousConfiguration = new Config({
      recommendationState: {
        issueDescriptionFingerprint: 'unused',
        recommendationFingerprint: 'unused',
        recommendation: '1. Add auth module',
      },
    });
    const firstParam = baseParam({ previousConfiguration });
    const firstResult = await useCase.invoke(firstParam);
    const fingerprint = firstResult.length === 0
      ? undefined
      : firstResult[0].payload?.recommendationState?.issueDescriptionFingerprint;

    mockAskAgent.mockReset();
    const matchingParam = baseParam({
      previousConfiguration: new Config({
        recommendationState: {
          issueDescriptionFingerprint: fingerprint,
          recommendationFingerprint: 'unused',
          recommendation: '1. Add auth module',
        },
      }),
    });
    await useCase.invoke(matchingParam);

    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('does not publish a duplicate recommendation when the agent returns the sentinel', async () => {
    mockGetDescription.mockResolvedValue('Implement login feature with more detail.');
    mockAskAgent.mockResolvedValue('NO_NEW_RECOMMENDATIONS');
    const previous = new Config({
      recommendationState: {
        issueDescriptionFingerprint: 'old-description',
        recommendationFingerprint: 'old-recommendation',
        recommendation: '1. Add auth module',
      },
    });
    const param = baseParam({ previousConfiguration: previous });

    const results = await useCase.invoke(param);

    expect(results).toEqual([]);
    expect(param.currentConfiguration.recommendationState?.recommendation).toBe('1. Add auth module');
    expect(param.currentConfiguration.recommendationState?.issueDescriptionFingerprint).not.toBe('old-description');
  });

  it('does not publish a duplicate recommendation when the normalized response is unchanged', async () => {
    mockGetDescription.mockReset();
    mockGetDescription
      .mockResolvedValueOnce('Implement login feature with a minor clarification.')
      .mockResolvedValueOnce('Implement login feature with another minor clarification.');
    mockAskAgent.mockResolvedValue('1. Add auth module\n2. Add tests');
    const previous = new Config({
      recommendationState: {
        issueDescriptionFingerprint: 'old-description',
        recommendationFingerprint: 'old-recommendation',
        recommendation: '1. Add auth module\n2. Add tests',
      },
    });
    const param = baseParam({ previousConfiguration: previous });
    const first = await useCase.invoke(param);
    const recommendationState = first[0].payload.recommendationState;

    mockAskAgent.mockClear();
    const secondParam = baseParam({
      previousConfiguration: new Config({ recommendationState }),
    });
    const second = await useCase.invoke(secondParam);

    expect(second).toEqual([]);
    expect(mockAskAgent).toHaveBeenCalledTimes(1);
  });

  it('returns failure when askAgent throws', async () => {
    mockGetDescription.mockResolvedValue('Do something');
    mockAskAgent.mockRejectedValue(new Error('AI error'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.length).toBeGreaterThan(0);
  });
});
