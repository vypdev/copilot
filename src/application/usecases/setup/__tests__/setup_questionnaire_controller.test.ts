import { SetupQuestionnaireController } from '../setup_questionnaire_controller';
import { createSetupQuestionnaire } from '../../../policies/setup_questionnaire_policy';
import { createDefaultSetupConfiguration } from '../../../policies/setup_configuration_policy';
import type { SetupQuestionRenderer, TerminalDriver, TerminalReadResult } from '../../../ports/setup_terminal_ports';

function renderer(): jest.Mocked<SetupQuestionRenderer> {
  return {
    showIntroduction: jest.fn(),
    showState: jest.fn(),
    renderPrompt: jest.fn((question) => `${question.id}: `),
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
});
