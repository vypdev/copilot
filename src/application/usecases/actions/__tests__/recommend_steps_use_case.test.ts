import { RecommendStepsUseCase } from '../recommend_steps_use_case';
import { Ai } from '../../../../data/model/ai';
import { Config } from '../../../../data/model/config';
import { getResultPayload } from '../../../../data/model/result';
import type { Execution } from '../../../../data/model/execution';
import { projectRecommendStepsContext, type RecommendStepsOutcome } from '../../push_single_action_contexts';
import type { AgentQueryResult } from '../../../ports/agent_query_ports';
import { createIssueDescriptionFingerprint } from '../../../policies/recommendation_policy';

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
const DEFAULT_ACCEPTANCE = 'The requested behavior is implemented and all relevant checks pass.';

function planFromText(value: string): Record<string, unknown> {
  const requestedTitles = value
    .split('\n')
    .map(line => line.replace(/^\s*\d+[.)]\s*/u, '').trim())
    .filter(Boolean);
  const titles = [...requestedTitles];
  const fallbackTitles = ['Implement the requested behavior', 'Verify the relevant behavior', 'Update affected documentation'];
  for (const fallback of fallbackTitles) {
    if (titles.length >= 3) break;
    if (!titles.includes(fallback)) titles.push(fallback);
  }
  return {
    steps: titles.slice(0, 8).map(title => ({ title, details: [] })),
    acceptance: DEFAULT_ACCEPTANCE,
  };
}

async function localizedRecommendation(request: { configuration: unknown; agentId: string; prompt: string; options?: unknown }): Promise<AgentQueryResult> {
  const response = await mockAskAgent(request.configuration, request.agentId, request.prompt, request.options);
  if (typeof response === 'string') {
    return response === 'NO_NEW_RECOMMENDATIONS'
      ? { outputLocale: 'en-US', status: 'unchanged', steps: null, acceptance: null }
      : { outputLocale: 'en-US', status: 'recommendation', ...planFromText(response) };
  }
  if (!response || typeof response !== 'object' || Array.isArray(response)) return response;
  const payload = response as Record<string, unknown>;
  const plan = typeof payload.steps === 'string' ? planFromText(payload.steps) : {};
  return {
    outputLocale: 'en-US',
    status: typeof payload.steps === 'string' ? 'recommendation' : payload.status,
    ...payload,
    ...plan,
  };
}

function baseParam(overrides: Record<string, unknown> = {}): Execution {
  return {
    owner: 'owner',
    repo: 'repo',
    issueNumber: 42,
    tokens: { token: 'token' },
    locale: { repository: 'en-US', issue: 'en-US', pullRequest: 'en-US' },
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

  it('returns success with a structured implementation plan', async () => {
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

  it('returns success when the query adapter supplies structured plan fields', async () => {
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
    expect(getResultPayload(results[0].payload)?.recommendedSteps).toContain('1. Add auth module');
    expect(getResultPayload(results[0].payload)?.implementationPlan).toMatchObject({
      steps: expect.arrayContaining([expect.objectContaining({ title: 'Add auth module' })]),
      acceptance: DEFAULT_ACCEPTANCE,
    });
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
    const firstState = getResultPayload(firstResult[0].payload)?.recommendationState;
    const matchingParam = baseParam({ previousConfiguration: new Config({ recommendationState: firstState }) });
    const results = await invoke(matchingParam);

    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: 'RecommendStepsUseCase', success: true, executed: true });
    expect(getResultPayload(results[0].payload)).toMatchObject({
      issueNumber: 42,
      recommendedSteps: expect.stringContaining('1. Add auth module'),
      implementationPlan: expect.objectContaining({ acceptance: DEFAULT_ACCEPTANCE }),
      recommendationState: { issueDescriptionFingerprint: fingerprint },
    });

    const unconfiguredResults = await invoke(baseParam({
      ai: new Ai('', '', false, [], false, 'low', 20),
      previousConfiguration: matchingParam.previousConfiguration,
    }));
    expect(unconfiguredResults).toHaveLength(1);
    expect(getResultPayload(unconfiguredResults[0].payload)?.recommendedSteps).toContain('1. Add auth module');
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

  it('keeps a matching legacy plan readable when no agent is configured', async () => {
    mockGetDescription.mockResolvedValue('Implement login feature.');
    const previousConfiguration = new Config({
      recommendationState: {
        issueDescriptionFingerprint: createIssueDescriptionFingerprint('Implement login feature.'),
        recommendationFingerprint: 'legacy-recommendation',
        recommendation: '1. Keep the existing plan',
      },
    });

    const results = await invoke(baseParam({
      ai: new Ai('', '', false, [], false, 'low', 20),
      previousConfiguration,
    }));

    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ success: true, executed: true });
    expect(getResultPayload(results[0].payload)).toMatchObject({
      recommendedSteps: '1. Keep the existing plan',
    });
    expect(getResultPayload(results[0].payload)).not.toHaveProperty('implementationPlan');
  });

  it('does not publish a duplicate recommendation when the agent returns the sentinel', async () => {
    mockGetDescription.mockResolvedValue('Implement login feature with more detail.');
    mockAskAgent.mockResolvedValue('NO_NEW_RECOMMENDATIONS');
    const previous = new Config({
      recommendationState: {
        issueDescriptionFingerprint: 'old-description',
        recommendationFingerprint: 'old-recommendation',
        recommendation: '1. Add auth module',
        implementationPlan: planFromText('1. Add auth module\n2. Add tests'),
        implementationPlanLocale: 'en-US',
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

  it.each([
    { steps: null, acceptance: 'Must be null.' },
    { steps: planFromText('One\nTwo\nThree').steps, acceptance: null },
  ])('rejects an inconsistent unchanged response %#', async ({ steps, acceptance }) => {
    mockGetDescription.mockResolvedValue('Implement login feature.');
    mockAskAgent.mockResolvedValue({ status: 'unchanged', steps, acceptance });

    const results = await invoke(baseParam());

    expect(results[0].errors[0].message).toBe('The configured agent returned an invalid implementation plan.');
  });

  it('rejects an unknown response status', async () => {
    mockGetDescription.mockResolvedValue('Implement login feature.');
    mockAskAgent.mockResolvedValue({ status: 'unexpected', steps: null, acceptance: null });

    const results = await invoke(baseParam());

    expect(results[0].errors[0].message).toBe('The configured agent returned an invalid implementation plan.');
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
    expect(results[0].errors[0].message).toBe('The configured agent returned an invalid implementation plan.');
    expect(results[0].steps).toEqual([]);
  });

  it('rejects an agent object outside the structured plan contract', async () => {
    mockGetDescription.mockResolvedValue('Do something');
    mockAskAgent.mockResolvedValue({ answer: 'not the recommendation contract' });

    const results = await invoke(baseParam());

    expect(results[0].success).toBe(false);
    expect(results[0].errors[0].message).toBe('The configured agent returned an invalid implementation plan.');
  });

  it('rejects a mismatched output locale without creating recommendation state', async () => {
    mockGetDescription.mockResolvedValue('Do something');
    mockAskAgent.mockResolvedValue({ outputLocale: 'fr-FR', status: 'recommendation', ...planFromText('1. Faire') });

    const results = await invoke(baseParam());

    expect(results[0].errors[0]).toMatchObject({ code: 'locale.output-invalid' });
    expect(lastOutcome?.configurationPatch).toBeUndefined();
  });

  it('persists every structured plan field in the configured issue locale', async () => {
    mockGetDescription.mockResolvedValue('Implementa el flujo de acceso.');
    mockAskAgent.mockResolvedValue({
      outputLocale: 'es-MX',
      status: 'recommendation',
      steps: [
        { title: 'Definir el contrato', details: ['Documentar las entradas.'] },
        { title: 'Implementar el flujo', details: [] },
        { title: 'Verificar el comportamiento', details: ['Ejecutar las pruebas.'] },
      ],
      acceptance: 'El flujo funciona y todas las pruebas relevantes pasan.',
    });

    const results = await invoke(baseParam({
      locale: { repository: 'en-US', issue: 'es-MX', pullRequest: 'en-US' },
    }));
    const payload = getResultPayload(results[0].payload);

    expect(results[0].success).toBe(true);
    expect(payload?.implementationPlan).toMatchObject({
      steps: [
        { title: 'Definir el contrato', details: ['Documentar las entradas.'] },
        { title: 'Implementar el flujo', details: [] },
        { title: 'Verificar el comportamiento', details: ['Ejecutar las pruebas.'] },
      ],
      acceptance: 'El flujo funciona y todas las pruebas relevantes pasan.',
    });
    expect(payload?.recommendationState).toMatchObject({ implementationPlanLocale: 'es-MX' });
    expect(mockAskAgent.mock.calls[0][2]).toContain('outputLocale` exactly as `es-MX');
  });

  it('regenerates a matching structured plan when the configured issue locale changes', async () => {
    mockGetDescription.mockResolvedValue('Implement login feature.');
    mockAskAgent.mockResolvedValue({
      outputLocale: 'es-MX',
      status: 'recommendation',
      steps: [
        { title: 'Definir el contrato', details: [] },
        { title: 'Implementar el flujo', details: [] },
        { title: 'Verificar el comportamiento', details: [] },
      ],
      acceptance: 'El flujo funciona y todas las pruebas relevantes pasan.',
    });
    const previousConfiguration = new Config({
      recommendationState: {
        issueDescriptionFingerprint: createIssueDescriptionFingerprint('Implement login feature.'),
        recommendationFingerprint: 'english-plan',
        recommendation: '1. Define the contract\n2. Implement the flow\n3. Verify behavior',
        implementationPlan: planFromText('Define the contract\nImplement the flow\nVerify behavior'),
        implementationPlanLocale: 'en-US',
      },
    });

    const results = await invoke(baseParam({
      locale: { repository: 'en-US', issue: 'es-MX', pullRequest: 'en-US' },
      previousConfiguration,
    }));
    const payload = getResultPayload(results[0].payload);

    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    expect(mockAskAgent.mock.calls[0][2]).toContain('Previous structured recommendation from another or unknown locale');
    expect(mockAskAgent.mock.calls[0][2]).toContain('do not return unchanged');
    expect(payload?.recommendationState).toMatchObject({ implementationPlanLocale: 'es-MX' });
    expect(payload?.implementationPlan).toMatchObject({
      steps: expect.arrayContaining([expect.objectContaining({ title: 'Definir el contrato' })]),
    });
  });

  it('rejects unchanged output when a matching structured plan requires locale migration', async () => {
    mockGetDescription.mockResolvedValue('Implement login feature.');
    mockAskAgent.mockResolvedValue({
      outputLocale: 'es-MX', status: 'unchanged', steps: null, acceptance: null,
    });
    const previousConfiguration = new Config({
      recommendationState: {
        issueDescriptionFingerprint: createIssueDescriptionFingerprint('Implement login feature.'),
        recommendationFingerprint: 'english-plan',
        recommendation: '1. Define the contract\n2. Implement the flow\n3. Verify behavior',
        implementationPlan: planFromText('Define the contract\nImplement the flow\nVerify behavior'),
        implementationPlanLocale: 'en-US',
      },
    });

    const results = await invoke(baseParam({
      locale: { repository: 'en-US', issue: 'es-MX', pullRequest: 'en-US' },
      previousConfiguration,
    }));

    expect(results[0].errors[0]).toMatchObject({
      code: 'agent.failed',
      message: 'The configured agent returned unchanged for a plan that requires locale migration.',
    });
    expect(lastOutcome?.configurationPatch).toBeUndefined();
  });

  it('does not replay a structured plan with an unverified locale when no agent is configured', async () => {
    mockGetDescription.mockResolvedValue('Implement login feature.');
    const previousConfiguration = new Config({
      recommendationState: {
        issueDescriptionFingerprint: createIssueDescriptionFingerprint('Implement login feature.'),
        recommendationFingerprint: 'pre-locale-plan',
        recommendation: '1. Define the contract\n2. Implement the flow\n3. Verify behavior',
        implementationPlan: planFromText('Define the contract\nImplement the flow\nVerify behavior'),
      },
    });

    const results = await invoke(baseParam({
      ai: new Ai('', '', false, [], false, 'low', 20),
      previousConfiguration,
    }));

    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(results[0].errors[0]).toMatchObject({
      code: 'configuration.invalid',
      message: 'Missing agent model or executable.',
    });
  });

  it.each([
    { name: 'fewer than three steps', plan: { steps: [{ title: 'Only one', details: [] }], acceptance: DEFAULT_ACCEPTANCE } },
    { name: 'more than eight steps', plan: { steps: Array.from({ length: 9 }, (_, index) => ({ title: `Step ${index}`, details: [] })), acceptance: DEFAULT_ACCEPTANCE } },
    { name: 'more than two details', plan: { steps: Array.from({ length: 3 }, (_, index) => ({ title: `Step ${index}`, details: ['a', 'b', 'c'] })), acceptance: DEFAULT_ACCEPTANCE } },
    { name: 'missing acceptance', plan: { steps: Array.from({ length: 3 }, (_, index) => ({ title: `Step ${index}`, details: [] })) } },
    { name: 'an additional response field', plan: { ...planFromText('One\nTwo\nThree'), metadata: 'not allowed' } },
  ])('rejects $name', async ({ plan }) => {
    mockGetDescription.mockResolvedValue('Do something');
    mockAskAgent.mockResolvedValue({ outputLocale: 'en-US', status: 'recommendation', ...plan });

    const results = await invoke(baseParam());

    expect(results[0]).toMatchObject({ success: false, executed: true });
    expect(results[0].errors[0].message).toBe('The configured agent returned an invalid implementation plan.');
  });

  it('migrates a matching legacy plan when the agent is configured', async () => {
    mockGetDescription.mockResolvedValue('Implement login feature.');
    mockAskAgent.mockResolvedValue('1. Define authentication\n2. Implement authentication\n3. Test authentication');
    const matchingLegacy = new Config({
      recommendationState: {
        issueDescriptionFingerprint: createIssueDescriptionFingerprint('Implement login feature.'),
        recommendationFingerprint: 'legacy',
        recommendation: 'Old free-form plan',
      },
    });
    mockAskAgent.mockClear();

    const results = await invoke(baseParam({ previousConfiguration: matchingLegacy }));

    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    expect(mockAskAgent.mock.calls[0][2]).toContain('Previous legacy recommendation');
    expect(mockAskAgent.mock.calls[0][2]).toContain('do not return unchanged');
    expect(getResultPayload(results[0].payload)?.implementationPlan).toBeDefined();
  });

  it('rejects unchanged while a legacy plan still requires migration', async () => {
    mockGetDescription.mockResolvedValue('Implement login feature.');
    mockAskAgent.mockResolvedValue('NO_NEW_RECOMMENDATIONS');
    const legacy = new Config({
      recommendationState: {
        issueDescriptionFingerprint: createIssueDescriptionFingerprint('Implement login feature.'),
        recommendationFingerprint: 'legacy',
        recommendation: 'Old free-form plan',
      },
    });

    const results = await invoke(baseParam({ previousConfiguration: legacy }));

    expect(results[0].errors[0].message).toBe('The configured agent returned unchanged for a legacy plan that requires structured migration.');
  });
});
