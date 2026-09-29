import { SetupQuestionnaireController } from '../setup_questionnaire_controller';
import { createSetupQuestionnaire, setupQuestionContentInventory } from '../../../policies/setup_questionnaire_policy';
import { createDefaultSetupConfiguration } from '../../../policies/setup_configuration_policy';
import type { SetupQuestionRenderer, TerminalDriver, TerminalReadResult } from '../../../ports/setup_terminal_ports';

function renderer(): jest.Mocked<SetupQuestionRenderer> {
  return {
    showIntroduction: jest.fn(),
    showState: jest.fn(),
    renderPrompt: jest.fn((question) => `${question.id}: `),
    renderHelp: jest.fn((question) => `Help for ${question.id}`),
    showHelp: jest.fn(),
    showValidation: jest.fn(),
    showCancelled: jest.fn(),
  };
}

function terminal(results: readonly TerminalReadResult[], fallback: TerminalReadResult = { kind: 'value', value: '' }) {
  let index = 0;
  return {
    isInteractive: jest.fn(() => true),
    readText: jest.fn(async (_prompt: string) => results[index++] ?? fallback),
    readSecret: jest.fn(async (_prompt: string) => ({ kind: 'end-of-input' as const })),
    close: jest.fn(),
  } satisfies jest.Mocked<TerminalDriver>;
}

describe('SetupQuestionnaireController', () => {
  it('drives all questions to review and renders each entered state once', async () => {
    const output = renderer();
    const input = terminal([]);
    const result = await new SetupQuestionnaireController(input, output).collect(
      createSetupQuestionnaire(createDefaultSetupConfiguration()),
      {},
    );

    expect(result.terminal).toBe('review');
    expect(output.showIntroduction).toHaveBeenCalledTimes(1);
    expect(output.showState.mock.calls.map(([state]) => state)).toEqual(expect.arrayContaining([
      'capabilities',
      'agent-runtime',
      'repository',
      'storage',
    ]));
    expect(input.readSecret).not.toHaveBeenCalled();
  });

  it('renders validation adjacent to a repeated question', async () => {
    const output = renderer();
    const input = terminal([
      { kind: 'value', value: 'invalid' },
      { kind: 'value', value: '' },
    ]);
    await new SetupQuestionnaireController(input, output).collect(
      createSetupQuestionnaire(createDefaultSetupConfiguration()),
      {},
    );

    expect(output.showValidation).toHaveBeenCalledWith('Enter yes or no.');
    expect(input.readText.mock.calls[0][0]).toBe(input.readText.mock.calls[1][0]);
  });

  it('shows question help and repeats the same unanswered question without mutating the draft', async () => {
    const output = renderer();
    const input = terminal([{ kind: 'value', value: '?' }, { kind: 'value', value: '' }]);
    const initial = createSetupQuestionnaire(createDefaultSetupConfiguration());
    const result = await new SetupQuestionnaireController(input, output).collect(initial, {});
    expect(result.terminal).toBe('review');
    expect(output.showHelp).toHaveBeenCalledWith(initial.question);
    expect(input.readText.mock.calls[0][0]).toBe(input.readText.mock.calls[1][0]);
    expect(initial.answeredQuestionIds).toBeUndefined();
  });

  it('explains :back at the first CLI question without losing the current draft', async () => {
    const output = renderer();
    const input = terminal([{ kind: 'value', value: ':back' }, { kind: 'value', value: '' }]);
    const result = await new SetupQuestionnaireController(input, output).collect(
      createSetupQuestionnaire(createDefaultSetupConfiguration()), {},
    );
    expect(result.terminal).toBe('review');
    expect(output.showValidation).toHaveBeenCalledWith('This is the first question in this pass. Review it or cancel setup.');
    expect(input.readText.mock.calls[0][0]).toBe(input.readText.mock.calls[1][0]);
  });

  it.each([
    ['Ctrl-C', { kind: 'cancel' } as const],
    ['EOF', { kind: 'end-of-input' } as const],
  ])('maps %s to cancellation without asking another question', async (_label, event) => {
    const output = renderer();
    const input = terminal([event]);
    const result = await new SetupQuestionnaireController(input, output).collect(
      createSetupQuestionnaire(createDefaultSetupConfiguration()),
      {},
    );

    expect(result.terminal).toBe('cancelled');
    expect(input.readText).toHaveBeenCalledTimes(1);
    expect(output.showCancelled).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-interactive driver instead of silently accepting defaults', async () => {
    const input = terminal([]);
    input.isInteractive.mockReturnValue(false);
    await expect(new SetupQuestionnaireController(input, renderer()).collect(
      createSetupQuestionnaire(createDefaultSetupConfiguration()),
      {},
    )).rejects.toThrow('requires an interactive terminal');
    expect(input.readText).not.toHaveBeenCalled();
  });

  it('retries Project discovery in the CLI without advancing or replaying prior questions', async () => {
    const context = { skipQuestionIds: setupQuestionContentInventory().map(item => item.id).filter(id => id !== 'projects.ids'),
      projectOwner: 'owner', projectDiscovery: { status: 'unavailable' as const, candidates: [] },
      discoveryRetryRemaining: { checks: 0, projects: 1 } };
    const initial = createSetupQuestionnaire(createDefaultSetupConfiguration(), context);
    expect(initial.question?.id).toBe('projects.ids');
    const input = { ...terminal([]), readMultiSelect: jest.fn()
      .mockResolvedValueOnce({ kind: 'value', value: 'retry' })
      .mockResolvedValueOnce({ kind: 'value', value: 'none' }) };
    const refresh = jest.fn(async () => ({ ...context,
      projectDiscovery: { status: 'observed' as const, candidates: [{ number: 5, title: 'Roadmap', owner: 'owner',
        url: 'https://github.com/orgs/owner/projects/5' }] },
      discoveryRetryRemaining: { checks: 0, projects: 0 } }));
    const result = await new SetupQuestionnaireController(input, renderer()).collect(initial, context, { refresh });
    expect(result.terminal).toBe('review');
    expect(result.draft.projects.ids).toBe('');
    expect(refresh).toHaveBeenCalledWith('projects');
    expect(input.readMultiSelect).toHaveBeenCalledTimes(2);
    expect(input.readMultiSelect.mock.calls[1][1]).toEqual(expect.arrayContaining([expect.stringContaining('Roadmap')]));
  });

  it('removes terminal controls and bidirectional overrides from discovered Project choices', async () => {
    const context = { skipQuestionIds: setupQuestionContentInventory().map(item => item.id).filter(id => id !== 'projects.ids'),
      projectOwner: 'owner', projectDiscovery: { status: 'observed' as const,
        candidates: [{ number: 5, title: 'Roadmap\u001b[2J\nFake\u202e', owner: 'owner',
          url: 'https://github.com/orgs/owner/projects/5\u001b[1m' }] } };
    const input = { ...terminal([]), readMultiSelect: jest.fn().mockResolvedValue({ kind: 'value', value: 'none' }) };
    await new SetupQuestionnaireController(input, renderer()).collect(
      createSetupQuestionnaire(createDefaultSetupConfiguration(), context), context,
    );
    const choices = input.readMultiSelect.mock.calls[0][1] as string[];
    expect(choices[0]).toContain('5 — Roadmap[2JFake');
    expect(choices[0]).not.toMatch(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u);
    expect(choices[0]).toContain('https://github.com/orgs/owner/projects/5[1m');
  });

  it('lists discovered Projects and supports retry when the terminal has no selector method', async () => {
    const context = { skipQuestionIds: setupQuestionContentInventory().map(item => item.id).filter(id => id !== 'projects.ids'),
      projectOwner: 'owner', projectDiscovery: { status: 'observed' as const,
        candidates: [{ number: 5, title: 'Roadmap', owner: 'owner', url: 'https://github.com/orgs/owner/projects/5' }] },
      discoveryRetryRemaining: { checks: 0, projects: 1 } };
    const input = terminal([{ kind: 'value', value: 'retry' }, { kind: 'value', value: '6' }]);
    const refresh = jest.fn(async () => ({ ...context,
      projectDiscovery: { status: 'observed' as const,
        candidates: [{ number: 6, title: 'Planning', owner: 'owner', url: 'https://github.com/orgs/owner/projects/6' }] },
      discoveryRetryRemaining: { checks: 0, projects: 0 } }));
    const result = await new SetupQuestionnaireController(input, renderer()).collect(
      createSetupQuestionnaire(createDefaultSetupConfiguration(), context), context, { refresh },
    );
    expect(result.terminal).toBe('review');
    expect(result.draft.projects.ids).toBe('6');
    expect(input.readText.mock.calls[0][0]).toContain('5 — Roadmap (https://github.com/orgs/owner/projects/5)');
    expect(input.readText.mock.calls[0][0]).toContain('retry — Retry GitHub Project discovery');
    expect(input.readText.mock.calls[1][0]).toContain('6 — Planning');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps selected Project numbers on empty Enter in the text fallback', async () => {
    const defaults = createDefaultSetupConfiguration();
    const context = { skipQuestionIds: setupQuestionContentInventory().map(item => item.id).filter(id => id !== 'projects.ids'),
      projectOwner: 'owner', projectDiscovery: { status: 'observed' as const,
        candidates: [{ number: 5, title: 'Roadmap', owner: 'owner', url: 'https://github.com/orgs/owner/projects/5' }] } };
    const input = terminal([{ kind: 'value', value: '' }]);
    const result = await new SetupQuestionnaireController(input, renderer()).collect(
      createSetupQuestionnaire({ ...defaults, projects: { ...defaults.projects, ids: '5' } }, context), context,
    );
    expect(result.terminal).toBe('review');
    expect(result.draft.projects.ids).toBe('5');
    expect(input.readText.mock.calls[0][0]).toContain('Current selection: 5');
  });

  it('combines selected Projects with manually entered URLs or numbers', async () => {
    const context = { skipQuestionIds: setupQuestionContentInventory().map(item => item.id).filter(id => id !== 'projects.ids'),
      projectOwner: 'owner', projectDiscovery: { status: 'observed' as const,
        candidates: [{ number: 5, title: 'Roadmap', owner: 'owner', url: 'https://github.com/orgs/owner/projects/5' }] } };
    const input = { ...terminal([{ kind: 'value', value: 'https://github.com/orgs/owner/projects/7' }]),
      readMultiSelect: jest.fn().mockResolvedValue({ kind: 'value', value: '5,manual' }) };
    const result = await new SetupQuestionnaireController(input, renderer()).collect(
      createSetupQuestionnaire(createDefaultSetupConfiguration(), context), context,
    );
    expect(result.terminal).toBe('review');
    expect(result.draft.projects.ids).toBe('5,7');
    expect(input.readText).toHaveBeenCalledWith(expect.stringContaining('Enter additional Project numbers'));
  });

  it('cancels safely if manual Project entry reaches end of input', async () => {
    const context = { skipQuestionIds: setupQuestionContentInventory().map(item => item.id).filter(id => id !== 'projects.ids'),
      projectOwner: 'owner' };
    const input = { ...terminal([{ kind: 'end-of-input' }]),
      readMultiSelect: jest.fn().mockResolvedValue({ kind: 'value', value: 'manual' }) };
    const output = renderer();
    const result = await new SetupQuestionnaireController(input, output).collect(
      createSetupQuestionnaire(createDefaultSetupConfiguration(), context), context,
    );
    expect(result.terminal).toBe('cancelled');
    expect(output.showCancelled).toHaveBeenCalledTimes(1);
  });

  it('treats an empty manual Project entry as selecting none', async () => {
    const context = { skipQuestionIds: setupQuestionContentInventory().map(item => item.id).filter(id => id !== 'projects.ids'),
      projectOwner: 'owner' };
    const input = { ...terminal([{ kind: 'value', value: '' }]),
      readMultiSelect: jest.fn().mockResolvedValue({ kind: 'value', value: 'manual' }) };
    const result = await new SetupQuestionnaireController(input, renderer()).collect(
      createSetupQuestionnaire(createDefaultSetupConfiguration(), context), context,
    );
    expect(result.terminal).toBe('review');
    expect(result.draft.projects.ids).toBe('');
  });

  it('keeps a CI check question open if a read-only discovery retry returns no new context', async () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'recommend' };
    const context = { skipQuestionIds: setupQuestionContentInventory().map(item => item.id)
      .filter(id => id !== 'pullRequestApproval.testChecks'),
      approvalCheckDiscoveryStatus: 'unavailable' as const, discoveryRetryRemaining: { checks: 1, projects: 0 } };
    const refresh = jest.fn(async () => undefined);
    const input = terminal([{ kind: 'value', value: 'r' }, { kind: 'cancel' }]);
    const result = await new SetupQuestionnaireController(input, renderer()).collect(
      createSetupQuestionnaire(configuration, context), context, { refresh },
    );
    expect(result.terminal).toBe('cancelled');
    expect(refresh).toHaveBeenCalledWith('checks');
    expect(input.readText).toHaveBeenCalledTimes(2);
  });

  it('renders defensive empty selector choices without crashing on an older question shape', async () => {
    const initial = createSetupQuestionnaire(createDefaultSetupConfiguration());
    const input = { ...terminal([]), readMultiSelect: jest.fn().mockResolvedValue({ kind: 'cancel' }) };
    const multi = { ...initial, question: { ...initial.question!, kind: 'multi-select' as const, choices: undefined } };
    expect((await new SetupQuestionnaireController(input, renderer()).collect(multi, {})).terminal).toBe('cancelled');
    const project = { ...initial, question: { ...initial.question!, kind: 'project-select' as const, projectCandidates: undefined } };
    expect((await new SetupQuestionnaireController(input, renderer()).collect(project, {})).terminal).toBe('cancelled');
    expect(input.readMultiSelect).toHaveBeenCalledTimes(2);
  });

  it('explains exhausted discovery retries and lets the operator continue', async () => {
    const context = { skipQuestionIds: setupQuestionContentInventory().map(item => item.id).filter(id => id !== 'projects.ids'),
      projectOwner: 'owner', discoveryRetryRemaining: { checks: 0, projects: 0 } };
    const input = { ...terminal([]), readMultiSelect: jest.fn()
      .mockResolvedValueOnce({ kind: 'value', value: 'retry' })
      .mockResolvedValueOnce({ kind: 'value', value: 'none' }) };
    const output = renderer();
    const result = await new SetupQuestionnaireController(input, output).collect(
      createSetupQuestionnaire(createDefaultSetupConfiguration(), context), context,
    );
    expect(result.terminal).toBe('review');
    expect(output.showValidation).toHaveBeenCalledWith(expect.stringContaining('No discovery retries remain'));
  });
});
