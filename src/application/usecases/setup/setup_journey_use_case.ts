import { buildSetupJourneyView, SETUP_JOURNEY_STAGES } from '../../policies/setup_journey_policy';
import type { SetupJourneyOutcome, SetupJourneyStage, SetupJourneyView } from '../../policies/setup_journey_policy';

export interface SetupJourneyPresenterPort {
  present(view: SetupJourneyView): void;
}

/** Tracks semantic milestones, independently of the CLI's rendering. */
export class SetupJourneyUseCase {
  private stage: SetupJourneyStage = 'repository';
  private outcome?: SetupJourneyOutcome;
  private mutationStarted = false;
  private choiceReviewPass = 1;

  constructor(private readonly repository: string, private readonly presenter: SetupJourneyPresenterPort,
    private readonly priorSessionMutation = false) {}

  advance(stage: SetupJourneyStage): void {
    if (this.outcome) throw new Error('Cannot advance a finished setup journey.');
    const next = SETUP_JOURNEY_STAGES.indexOf(stage);
    if (next < SETUP_JOURNEY_STAGES.indexOf(this.stage)) throw new Error('Setup journey cannot move backwards.');
    if (next === SETUP_JOURNEY_STAGES.indexOf(this.stage)) return;
    this.stage = stage;
    this.present();
  }

  /** The only deliberate backwards transition: revisit local choices before PAT entry. */
  revisitChoices(): number {
    if (this.stage !== 'setup-pat' || this.outcome || this.mutationStarted) {
      throw new Error('Setup choices can be revisited only from pre-PAT review.');
    }
    this.choiceReviewPass += 1;
    this.stage = 'choices';
    this.present();
    return this.choiceReviewPass;
  }

  markMutationStarted(): void {
    if ((this.stage !== 'plan' && this.stage !== 'credentials' && this.stage !== 'apply') || this.outcome) {
      throw new Error('Setup mutation can start only during a pending permission cleanup, credential validation or apply.');
    }
    if (this.mutationStarted) return;
    this.mutationStarted = true;
    this.present();
  }

  finish(outcome: SetupJourneyOutcome): void {
    if (this.outcome) return;
    if (outcome === 'complete' && (this.stage !== 'apply' || !this.mutationStarted)) {
      throw new Error('Setup cannot be complete before applying the plan.');
    }
    if (outcome === 'partial' && !this.mutationStarted && !this.priorSessionMutation) {
      throw new Error('Setup cannot be partial before mutation starts.');
    }
    this.outcome = outcome;
    this.present();
  }

  private present(): void {
    this.presenter.present(buildSetupJourneyView(
      this.repository, this.stage, this.mutationStarted || this.priorSessionMutation, this.outcome, this.choiceReviewPass,
    ));
  }
}
