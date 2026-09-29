import type {
  SetupConfigurationCollectorPort,
  SetupQuestionRenderer,
  TerminalDriver,
  SetupDiscoveryRefreshPort,
} from '../../ports/setup_terminal_ports';
import type {
  SetupQuestionnaireContext,
  SetupQuestionnaireEvent,
  SetupQuestionnaireState,
  SetupQuestionnaireStateId,
} from '../../../domain/setup_questionnaire';
import { refreshSetupQuestionnaireQuestion, setupQuestionnaireProgress, transitionSetupQuestionnaire } from '../../policies/setup_questionnaire_policy';
import { ApplicationError } from '../../errors/application_error';

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
      let input = (state.question.kind === 'multi-select' || state.question.kind === 'project-select') && this.terminal.readMultiSelect
        ? await this.terminal.readMultiSelect(
          this.renderer.renderPrompt(state.question, setupQuestionnaireProgress(state, currentContext)),
          state.question.kind === 'project-select'
            ? [...(state.question.projectCandidates ?? []).map(candidate => `${candidate.number} — ${candidate.title} (${candidate.url})`), 'manual — Enter Project number or URL',
              ...(state.question.discoveryRetryRemaining ? ['retry — Retry GitHub Project discovery'] : [])]
            : state.question.choices ?? [],
          state.question.kind === 'project-select' && pendingProjectSelection
            ? pendingProjectSelection : parseSelectedDefaults(state.question.defaultValue),
          this.renderer.renderHelp(state.question),
        )
        : await this.terminal.readText(this.renderer.renderPrompt(state.question, setupQuestionnaireProgress(state, currentContext)));
      if (state.question.kind === 'project-select' && input.kind === 'value' && input.value.split(',').includes('manual')
        && !input.value.split(',').includes('retry')) {
        const manual = await this.terminal.readText('Enter additional Project numbers or GitHub URLs, comma-separated (empty adds none): ');
        input = manual.kind === 'value'
          ? { kind: 'value', value: [input.value.replace(/(?:^|,)manual(?:,|$)/gu, ',').replace(/^,|,$/gu, ''), manual.value]
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
        || input.value.split(',').includes('retry'))) {
        if (kind === 'projects') pendingProjectSelection = input.value.split(',').filter(value => value !== 'retry');
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

function parseSelectedDefaults(value: string | number | boolean): readonly string[] {
  return typeof value === 'string' ? value.split(',').map(item => item.trim()).filter(Boolean) : [];
}

function toEvent(input: Awaited<ReturnType<TerminalDriver['readText']>>): SetupQuestionnaireEvent {
  return input.kind === 'value' ? { kind: 'answer', value: input.value } : input;
}
