import type { SetupJourneyPresenterPort } from '../application/usecases/setup/setup_journey_use_case';
import type { SetupJourneyView } from '../application/policies/setup_journey_policy';
import { renderBox } from './setup_prompt_rendering';

export class ConsoleSetupJourneyPresenter implements SetupJourneyPresenterPort {
  present(view: SetupJourneyView): void {
    console.log(renderSetupJourney(view));
  }
}

export function renderSetupJourney(view: SetupJourneyView, maximumWidth?: number): string {
  const revisitingChoices = view.current === 'Setup choices' && view.choiceReviewPass > 1;
  const state = view.outcome === 'complete' ? 'Complete: setup applied successfully.'
    : view.outcome === 'dry-run' ? 'Complete: dry run only; no changes were applied.'
      : view.outcome === 'partial' ? 'Partial: changes may exist; inspect the branch and GitHub resources before retrying.'
        : view.outcome === 'blocked' ? 'Blocked: setup cannot continue.'
          : view.outcome === 'cancelled' ? 'Cancelled: setup stopped.'
            : view.mutationStarted ? view.current === 'Bot PAT & credentials'
              ? 'Checking credentials; a temporary GitHub workflow change may exist.'
              : 'Applying the approved plan; changes may already exist.'
              : 'No changes have been applied.';
  return renderBox([
    `Repository: ${view.repository}`,
    `Stage ${view.position}/${view.total} · ${view.current}${revisitingChoices ? ` · review pass ${view.choiceReviewPass}` : ''}`,
    `Complete: ${view.complete.join(' → ') || 'none'}`,
    `Now: ${revisitingChoices ? 'reviewing saved setup choices' : view.current}`,
    `Next: ${view.pending.join(' → ') || 'none'}`,
    state,
  ].join('\n'), 'Copilot setup', 36, maximumWidth);
}
