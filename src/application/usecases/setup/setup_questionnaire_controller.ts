import type {
  SetupConfigurationCollectorPort,
  SetupQuestionRenderer,
  TerminalDriver,
} from '../../ports/setup_terminal_ports';
import type {
  SetupQuestionnaireContext,
  SetupQuestionnaireEvent,
  SetupQuestionnaireState,
  SetupQuestionnaireStateId,
} from '../../../domain/setup_questionnaire';
import { transitionSetupQuestionnaire } from '../../policies/setup_questionnaire_policy';
import { ApplicationError } from '../../errors/application_error';

export class SetupQuestionnaireController implements SetupConfigurationCollectorPort {
  constructor(
    private readonly terminal: TerminalDriver,
    private readonly renderer: SetupQuestionRenderer,
  ) {}

  async collect(
    initial: SetupQuestionnaireState,
    context: SetupQuestionnaireContext,
  ): Promise<SetupQuestionnaireState> {
    if (!this.terminal.isInteractive()) {
      throw new ApplicationError(
        'configuration.invalid',
        'Interactive setup requires an interactive terminal. Use --non-interactive with explicit configuration.',
      );
    }
    this.renderer.showIntroduction();
    let state = initial;
    let visibleState: SetupQuestionnaireStateId | undefined;
    while (state.terminal === 'collecting' && state.question) {
      if (visibleState !== state.stateId) {
        this.renderer.showState(state.stateId);
        visibleState = state.stateId;
      }
      if (state.validation) this.renderer.showValidation(state.validation);
      const input = await this.terminal.readText(this.renderer.renderPrompt(state.question));
      state = transitionSetupQuestionnaire(state, toEvent(input), context);
    }
    if (state.terminal === 'cancelled') this.renderer.showCancelled();
    return state;
  }
}

function toEvent(input: Awaited<ReturnType<TerminalDriver['readText']>>): SetupQuestionnaireEvent {
  return input.kind === 'value' ? { kind: 'answer', value: input.value } : input;
}
