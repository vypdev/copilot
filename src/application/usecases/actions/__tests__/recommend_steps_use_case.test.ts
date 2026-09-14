import { RecommendStepsUseCase } from '../recommend_steps_use_case';
import { Ai } from '../../../../data/model/ai';
import { Config } from '../../../../data/model/config';
import { getResultPayload } from '../../../../data/model/result';
import type { Execution } from '../../../../data/model/execution';
import { projectRecommendStepsContext, type RecommendStepsOutcome } from '../../push_single_action_contexts';
import type { AgentQueryResult } from '../../../ports/agent_query_ports';

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

async function localizedRecommendation(request: { configuration: unknown; agentId: string; prompt: string; options?: unknown }): Promise<AgentQueryResult> {
  const response = await mockAskAgent(request.configuration, request.agentId, request.prompt, request.options);
  if (typeof response === 'string') {
    return response === 'NO_NEW_RECOMMENDATIONS'
      ? { outputLocale: 'en-US', status: 'unchanged', steps: null }
      : { outputLocale: 'en-US', status: 'recommendation', steps: response };
  }
  if (!response || typeof response !== 'object' || Array.isArray(response)) return response;
  const payload = response as Record<string, unknown>;
  return {
    outputLocale: 'en-US',
    status: typeof payload.steps === 'string' ? 'recommendation' : payload.status,
    ...payload,
  };
}

function baseParam(overrides: Record<string, unknown> = {}): Execution {
  return {
    owner: 'owner',
    repo: 'repo',
    issueNumber: 42,
    tokens: { token: 'token' },
    currentConfiguration: new Config({}),
    ai: new Ai('http://localhost:4096', 'opencode/model', false, [], false, 'low', 20),
    ...overrides,
  } as unknown as Execution;
}
describe('RecommendStepsUseCase', () => {
  let useCase: RecommendStepsUseCase;
  let lastOutcome: RecommendStepsOutcome | undefined;
  let invoke: (param: Execution) => Promise<readonly import('../../../../data/model/result').Result[]>;

  beforeEach(() => {
    useCase = new RecommendStepsUseCase({ getDescription: mockGetDescription }, { query: localizedRecommendation });
    invoke = async (param) => {
      lastOutcome = await useCase.invoke(projectRecommendStepsContext(param));
      return lastOutcome.results;
    };
    mockGetDescription.mockReset();
    mockAskAgent.mockReset();
  });

  it('returns failure when ai has no opencode model or server URL', async () => {
    const param = baseParam({ ai: new Ai('', '', false, [], false, 'low', 20) });
    const results = await invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain('Missing agent model or executable.');
  });

  it('returns failure when issueNumber is -1', async () => {
    const param = baseParam({ issueNumber: -1 });
    const results = await invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain('Issue number not found.');
  });

  it('returns failure when issue description is empty or missing', async () => {
    mockGetDescription.mockResolvedValue('');
    const param = baseParam();
    const results = await invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.some((e) => String(e).includes('No description found'))).toBe(true);
  });

  it('returns success with recommended steps when AI returns string', async () => {
    mockGetDescription.mockResolvedValue('Implement login feature.');
    mockAskAgent.mockResolvedValue('1. Add auth module\n2. Add tests');
    const param = baseParam();
    const results = await invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].steps).toEqual([]);
    expect(getResultPayload(results[0].payload)?.recommendedSteps).toContain('1. Add auth module');
    const prompt = mockAskAgent.mock.calls[0][2];
    expect(prompt).toContain('42');
    expect(prompt).toContain('Implement login feature.');
    expect(prompt).toContain('outputLocale` exactly as `en-US');
    expect(mockAskAgent.mock.calls[0][3]).toMatchObject({
      expectJson: true,
      schemaName: 'recommend_steps_response',
    });
  });

  it('returns success when AI returns object with steps', async () => {
    mockGetDescription.mockResolvedValue('Fix bug.');
    mockAskAgent.mockResolvedValue({ steps: '1. Reproduce\n2. Fix' });
    const param = baseParam();
    const results = await invoke(param);
    expect(results[0].success).toBe(true);
    expect(getResultPayload(results[0].payload)?.recommendedSteps).toContain('1. Reproduce');
  });

  it('keeps onboarding inside the single semantic plan card instead of result steps', async () => {
    mockGetDescription.mockResolvedValue('Implement login feature.');
    mockAskAgent.mockResolvedValue('1. Add auth module');
    const param = baseParam({
      tokenUser: 'vypbot',
      eventName: 'issues',
      issue: { opened: true },
      inputs: { eventName: 'issues', action: 'opened' },
    });

    const results = await invoke(param);

    expect(results[0].steps).toEqual([]);
    expect(getResultPayload(results[0].payload)?.recommendedSteps).toBe('1. Add auth module');
  });

  it('removes Copilot metadata from the prompt and fingerprint input', async () => {
    mockGetDescription.mockResolvedValue('Implement login feature.\n\n<!-- copilot-configuration-start\n{"recommendationState":{"ignored":"metadata"}}\ncopilot-configuration-end -->');
    mockAskAgent.mockResolvedValue('1. Add auth module');

    const results = await invoke(baseParam());

    expect(results[0].success).toBe(true);
    const prompt = mockAskAgent.mock.calls[0][2];
    expect(prompt).toContain('Implement login feature.');
    expect(prompt).not.toContain('recommendationState');
  });

  it('does not remove a block when its managed start and end identifiers differ', async () => {
    mockGetDescription.mockResolvedValue('Visible request.\n\n<!-- copilot-configuration-start\nleak\ncopilot-recommendation-end -->');
    mockAskAgent.mockResolvedValue('1. Keep the visible request unchanged');

    const results = await invoke(baseParam());

    expect(results[0].success).toBe(true);
    const prompt = mockAskAgent.mock.calls[0][2];
    expect(prompt).toContain('leak');
  });

  it('reconciles the existing plan without calling the agent when the visible description is unchanged', async () => {
    mockGetDescription.mockResolvedValue('Implement login feature.');
    mockAskAgent.mockResolvedValue('1. Add auth module');
    const previousConfiguration = new Config({
      recommendationState: {
        issueDescriptionFingerprint: 'unused',
        recommendationFingerprint: 'unused',
        recommendation: '1. Add auth module',
      },
    });
    const firstParam = baseParam({ previousConfiguration });
    const firstResult = await invoke(firstParam);
    const fingerprint = firstResult.length === 0
      ? undefined
      : (getResultPayload(firstResult[0].payload)?.recommendationState as { issueDescriptionFingerprint?: string } | undefined)?.issueDescriptionFingerprint;

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
    const results = await invoke(matchingParam);

    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: 'RecommendStepsUseCase', success: true, executed: true });
    expect(getResultPayload(results[0].payload)).toMatchObject({
      issueNumber: 42,
      recommendedSteps: '1. Add auth module',
      recommendationState: { issueDescriptionFingerprint: fingerprint },
    });

    const unconfiguredResults = await invoke(baseParam({
      ai: new Ai('', '', false, [], false, 'low', 20),
      previousConfiguration: matchingParam.previousConfiguration,
    }));
    expect(unconfiguredResults).toHaveLength(1);
    expect(getResultPayload(unconfiguredResults[0].payload)?.recommendedSteps).toBe('1. Add auth module');
  });

  it('fails without calling the agent when a stored plan is stale and the agent is no longer configured', async () => {
    mockGetDescription.mockResolvedValue('The issue description has changed.');
    const previousConfiguration = new Config({
      recommendationState: {
        issueDescriptionFingerprint: 'stale-description',
        recommendationFingerprint: 'existing-recommendation',
        recommendation: '1. Keep the existing plan',
      },
    });

    const results = await invoke(baseParam({
      ai: new Ai('', '', false, [], false, 'low', 20),
      previousConfiguration,
    }));

    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ success: false, executed: true });
    expect(results[0].errors[0]).toMatchObject({
      code: 'configuration.invalid',
      message: 'Missing agent model or executable.',
    });
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

    const results = await invoke(param);

    expect(results).toEqual([]);
    expect(lastOutcome?.configurationPatch?.recommendationState.recommendation).toBe('1. Add auth module');
    expect(lastOutcome?.configurationPatch?.recommendationState.issueDescriptionFingerprint).not.toBe('old-description');
  });

  it('rejects unchanged status when no previous recommendation exists', async () => {
    mockGetDescription.mockResolvedValue('Implement login feature.');
    mockAskAgent.mockResolvedValue('NO_NEW_RECOMMENDATIONS');

    const results = await invoke(baseParam());

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ success: false, executed: true });
    expect(results[0].errors[0]).toMatchObject({
      code: 'agent.failed',
      message: 'The configured agent returned unchanged without a previous recommendation.',
    });
    expect(lastOutcome?.configurationPatch).toBeUndefined();
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
    const first = await invoke(param);
    const recommendationState = getResultPayload(first[0].payload)?.recommendationState;

    mockAskAgent.mockClear();
    const secondParam = baseParam({
      previousConfiguration: new Config({ recommendationState }),
    });
    const second = await invoke(secondParam);

    expect(second).toEqual([]);
    expect(mockAskAgent).toHaveBeenCalledTimes(1);
  });

  it('returns failure when askAgent throws', async () => {
    mockGetDescription.mockResolvedValue('Do something');
    mockAskAgent.mockRejectedValue(new Error('AI error'));
    const param = baseParam();
    const results = await invoke(param);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.length).toBeGreaterThan(0);
  });

  it('returns failure instead of publishing a placeholder when the agent has no recommendation', async () => {
    mockGetDescription.mockResolvedValue('Do something');
    mockAskAgent.mockResolvedValue(undefined);

    const results = await invoke(baseParam());

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors[0].message).toBe('The configured agent returned no recommendation.');
    expect(results[0].steps).toEqual([]);
  });

  it('rejects an agent object without a string steps field', async () => {
    mockGetDescription.mockResolvedValue('Do something');
    mockAskAgent.mockResolvedValue({ answer: 'not the recommendation contract' });

    const results = await invoke(baseParam());

    expect(results[0].success).toBe(false);
    expect(results[0].errors[0].message).toBe('The configured agent returned no recommendation.');
  });

  it('rejects a mismatched output locale without creating recommendation state', async () => {
    mockGetDescription.mockResolvedValue('Do something');
    mockAskAgent.mockResolvedValue({ outputLocale: 'fr-FR', status: 'recommendation', steps: '1. Faire' });

    const results = await invoke(baseParam());

    expect(results[0].errors[0]).toMatchObject({ code: 'locale.output-invalid' });
    expect(lastOutcome?.configurationPatch).toBeUndefined();
  });
});
