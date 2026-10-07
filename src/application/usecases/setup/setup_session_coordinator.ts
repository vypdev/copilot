import type { SetupOperationEffect } from '../../../domain/setup';
import type { SetupJourneyOutcome, SetupJourneyStage } from '../../policies/setup_journey_policy';

export type SetupSessionDecision = 'continue' | 'cancelled' | 'blocked' | 'dry-run';
export type SetupSessionLiveness = 'active' | 'cancelled' | 'expired';

export interface SetupSessionReceipt {
  readonly success: boolean;
  readonly effects: readonly SetupOperationEffect[];
}

/** Semantic work only. Entrypoints adapt prompts, providers and process exit codes. */
export interface SetupSessionPorts {
  readonly manage?: (possibleMutation: () => void, record: (effect: SetupOperationEffect) => void) => Promise<'continue' | 'complete' | 'partial' | 'blocked' | 'cancelled'>;
  readonly repository: () => Promise<SetupSessionDecision>;
  readonly choices: () => Promise<SetupSessionDecision>;
  readonly setupPat: (cleanupPending: () => void) => Promise<SetupSessionDecision>;
  readonly plan: (cleanupPending: () => void) => Promise<SetupSessionDecision>;
  readonly credentials: (possibleMutation: () => void) => Promise<SetupSessionDecision>;
  readonly authorizeApply: (cleanupPending: () => void) => Promise<SetupSessionDecision>;
  readonly apply: (effect: (effect: SetupOperationEffect) => void) => Promise<SetupSessionReceipt>;
  readonly liveness: () => SetupSessionLiveness;
  readonly present: (stage: SetupJourneyStage, mutationStarted: boolean, outcome?: SetupJourneyOutcome) => void;
  readonly isCancellationError: (error: unknown) => boolean;
}

export interface SetupSessionRunResult {
  readonly outcome: SetupJourneyOutcome;
  readonly mutationStarted: boolean;
  readonly effects: readonly SetupOperationEffect[];
  readonly error?: unknown;
}

/** Owns cross-frontend stage order, the write boundary and conservative outcomes. */
export class SetupSessionCoordinator {
  private running = false;
  private finished = false;
  private mutationStarted = false;
  private stage: SetupJourneyStage = 'repository';
  private readonly effects = new Map<SetupOperationEffect['id'], SetupOperationEffect>();

  constructor(private readonly ports: SetupSessionPorts) {}

  async execute(): Promise<SetupSessionRunResult> {
    if (this.running || this.finished) throw new Error('Setup session can run only once.');
    this.running = true;
    try {
      const stages: readonly [SetupJourneyStage, () => Promise<SetupSessionDecision>][] = [
        ['repository', this.ports.repository],
        ['choices', this.ports.choices],
        ['setup-pat', () => this.ports.setupPat(() => this.markPossibleMutation())],
        ['plan', () => this.ports.plan(() => this.markPossibleMutation())],
        ['credentials', () => this.ports.credentials(() => this.markPossibleMutation())],
        ['apply', () => this.ports.authorizeApply(() => this.markPossibleMutation())],
      ];
      for (const [stage, operation] of stages) {
        this.stage = stage;
        this.ports.present(stage, this.mutationStarted);
        const before = this.liveOutcome();
        if (before) return this.finish(before);
        const decision = await operation();
        const after = this.liveOutcome();
        if (after) return this.finish(after);
        if (decision !== 'continue') return this.finish(decision === 'dry-run' ? 'dry-run' : decision);
        if (stage === 'repository' && this.ports.manage) {
          const managed = await this.ports.manage(() => { this.stage = 'apply'; this.markPossibleMutation(); },
            effect => this.effects.set(effect.id, Object.freeze({ ...effect })));
          if (managed !== 'continue') return this.finish(managed);
        }
      }

      // The authorization operation must finish while the live session is active.
      // The mutation marker is set before entering the provider boundary: a
      // rejected/unknown request can already have reached GitHub.
      this.markPossibleMutation();
      const receipt = await this.ports.apply(effect => this.record(effect));
      for (const effect of receipt.effects) this.record(effect);
      return this.finish(receipt.success && !this.hasUncertainEffect() ? 'complete' : 'partial');
    } catch (error) {
      const cancelled = this.ports.isCancellationError(error) || this.ports.liveness() === 'cancelled';
      return this.finish(this.mutationStarted ? 'partial' : cancelled ? 'cancelled' : 'blocked', error);
    } finally {
      this.running = false;
      this.finished = true;
    }
  }

  private liveOutcome(): SetupJourneyOutcome | undefined {
    const state = this.ports.liveness();
    if (state === 'active') return undefined;
    return this.mutationStarted ? 'partial' : state === 'cancelled' ? 'cancelled' : 'blocked';
  }

  private markPossibleMutation(): void {
    if (this.mutationStarted) return;
    this.mutationStarted = true;
    this.ports.present(this.stage, true);
  }

  private record(effect: SetupOperationEffect): void {
    const previous = this.effects.get(effect.id);
    if (previous?.state === 'completed' && effect.state !== 'completed') return;
    this.effects.set(effect.id, Object.freeze({ ...effect }));
  }

  private hasUncertainEffect(): boolean {
    return [...this.effects.values()].some(effect => effect.state === 'needs-inspection' || effect.state === 'in-progress');
  }

  private finish(outcome: SetupJourneyOutcome, error?: unknown): SetupSessionRunResult {
    // An interrupted in-flight write must not be reported as no change.
    const finalOutcome = this.mutationStarted && (outcome === 'cancelled' || outcome === 'blocked'
      || (outcome === 'complete' && this.hasUncertainEffect())) ? 'partial' : outcome;
    for (const [id, effect] of this.effects) {
      if (effect.state === 'in-progress') this.effects.set(id, Object.freeze({ ...effect, state: 'needs-inspection' }));
    }
    this.ports.present(this.stage, this.mutationStarted, finalOutcome);
    return { outcome: finalOutcome, mutationStarted: this.mutationStarted,
      effects: [...this.effects.values()], ...(error === undefined ? {} : { error }) };
  }
}
