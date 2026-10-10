import type {
  SetupConfigurationCollectorPort,
  SetupQuestionRenderer,
  TerminalDriver,
  SetupDiscoveryRefreshPort,
} from '../../ports/setup_terminal_ports';
import type {
  SetupQuestion,
  SetupQuestionnaireContext,
  SetupQuestionnaireEvent,
  SetupQuestionnaireState,
  SetupQuestionnaireStateId,
} from '../../../domain/setup_questionnaire';
import { refreshSetupQuestionnaireQuestion, setupQuestionnaireProgress, transitionSetupQuestionnaire } from '../../policies/setup_questionnaire_policy';
import { ApplicationError } from '../../errors/application_error';
import { safeTerminalChoiceText } from '../../policies/setup_terminal_choice_policy';

export class SetupQuestionnaireController implements SetupConfigurationCollectorPort {
  constructor(
    private readonly terminal: TerminalDriver,
    private readonly renderer: SetupQuestionRenderer,
  ) {}

  async collect(
    initial: SetupQuestionnaireState,
    context: SetupQuestionnaireContext,
    discoveryRefresh?: SetupDiscoveryRefreshPort,
  ): Promise<SetupQuestionnaireState> {
    if (!this.terminal.isInteractive()) {
      throw new ApplicationError(
        'configuration.invalid',
        'Interactive setup requires an interactive terminal. Use --non-interactive with explicit configuration.',
      );
    }
    this.renderer.showIntroduction();
    let state = initial;
    let currentContext = context;
    let pendingProjectSelection: readonly string[] | undefined;
    let visibleState: SetupQuestionnaireStateId | undefined;
    while (state.terminal === 'collecting' && state.question) {
      if (visibleState !== state.stateId) {
        this.renderer.showState(state.stateId);
        visibleState = state.stateId;
      }
      if (state.validation) this.renderer.showValidation(state.validation);
      const question = state.question;
      const prompt = this.renderer.renderPrompt(question, setupQuestionnaireProgress(state, currentContext));
      const selectable = question.kind === 'multi-select' || question.kind === 'project-select';
      const choices = selectable ? choicesForQuestion(question) : [];
      const selected = question.kind === 'project-select' && pendingProjectSelection
        ? pendingProjectSelection : parseSelectedDefaults(question.defaultValue);
      let input = selectable && this.terminal.readMultiSelect
        ? await this.terminal.readMultiSelect(prompt, choices, selected, this.renderer.renderHelp(question))
        : await this.terminal.readText(selectable ? textChoicePrompt(prompt, choices, selected) : prompt);
      if (selectable && input.kind === 'value' && !input.value.trim()) {
        input = { kind: 'value', value: selected.join(',') || 'none' };
      }
      const selectionTokens = selectable && input.kind === 'value'
        ? input.value.split(',').map(value => value.trim()).filter(Boolean) : [];
      const hasRetry = selectionTokens.some(value => value.toLowerCase() === 'retry');
      if (state.question.kind === 'project-select' && input.kind === 'value'
        && selectionTokens.some(value => value.toLowerCase() === 'manual') && !hasRetry) {
        const manual = await this.terminal.readText('Enter additional Project numbers or GitHub URLs, comma-separated (empty adds none): ');
        input = manual.kind === 'value'
          ? { kind: 'value', value: [selectionTokens.filter(value => value.toLowerCase() !== 'manual').join(','), manual.value]
            .filter(value => value && value !== 'none').join(',') || 'none' } : manual;
      }
      if (input.kind === 'value' && input.value.trim() === '?') {
        this.renderer.showHelp(state.question);
        continue;
      }
      if (input.kind === 'value' && input.value.trim().toLowerCase() === ':back') {
        pendingProjectSelection = undefined;
        state = transitionSetupQuestionnaire(state, { kind: 'back' }, currentContext);
        continue;
      }
      const kind = state.question.id === 'projects.ids' ? 'projects'
        : state.question.id === 'pullRequestApproval.testChecks' ? 'checks' : undefined;
      if (kind && input.kind === 'value' && (input.value.trim().toLowerCase() === 'r'
        || hasRetry)) {
        if (kind === 'projects') pendingProjectSelection = selectionTokens.filter(value => !['retry', 'r'].includes(value.toLowerCase()));
        if (!state.question.discoveryRetryRemaining || !discoveryRefresh) {
          this.renderer.showValidation('No discovery retries remain. Use the manual option or continue.');
          continue;
        }
        const refreshed = await discoveryRefresh.refresh(kind);
        if (refreshed) {
          currentContext = refreshed;
          state = refreshSetupQuestionnaireQuestion(state, currentContext);
        }
        continue;
      }
      pendingProjectSelection = undefined;
      state = transitionSetupQuestionnaire(state, toEvent(input), currentContext);
    }
    if (state.terminal === 'cancelled') this.renderer.showCancelled();
    return state;
  }
}

function choicesForQuestion(question: SetupQuestion): readonly string[] {
  return question.kind === 'project-select'
    ? [...(question.projectCandidates ?? []).map(candidate => `${candidate.number} — ${safeTerminalChoiceText(candidate.title)} (${safeTerminalChoiceText(candidate.url)})`),
      'manual — Enter Project number or URL',
      ...(question.discoveryRetryRemaining ? ['retry — Retry GitHub Project discovery'] : [])]
    : question.choices ?? [];
}

function textChoicePrompt(prompt: string, choices: readonly string[], selected: readonly string[]): string {
  return [prompt, 'Available IDs:', ...choices.map(choice => `  ${safeTerminalChoiceText(choice)}`),
    `Current selection: ${safeTerminalChoiceText(selected.join(', ') || 'none')}`,
    'Enter IDs shown before “—”, separated by commas; use manual or retry when offered, none to clear, or Enter to keep the default: ',
  ].join('\n');
}

function parseSelectedDefaults(value: string | number | boolean): readonly string[] {
  return typeof value === 'string' ? value.split(',').map(item => item.trim()).filter(Boolean) : [];
}

function toEvent(input: Awaited<ReturnType<TerminalDriver['readText']>>): SetupQuestionnaireEvent {
  return input.kind === 'value' ? { kind: 'answer', value: input.value } : input;
}
