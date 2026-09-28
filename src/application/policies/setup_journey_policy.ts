export const SETUP_JOURNEY_STAGES = [
  'repository', 'choices', 'setup-pat', 'plan', 'credentials', 'apply',
] as const;

export type SetupJourneyStage = typeof SETUP_JOURNEY_STAGES[number];
export type SetupJourneyOutcome = 'complete' | 'dry-run' | 'cancelled' | 'blocked' | 'partial';

const labels: Readonly<Record<SetupJourneyStage, string>> = {
  repository: 'Repository',
  choices: 'Setup choices',
  'setup-pat': 'Setup PAT',
  plan: 'Plan',
  credentials: 'Bot PAT & credentials',
  apply: 'Apply',
};

export interface SetupJourneyView {
  readonly repository: string;
  readonly position: number;
  readonly total: number;
  readonly current: string;
  readonly complete: readonly string[];
  readonly pending: readonly string[];
  readonly outcome?: SetupJourneyOutcome;
  readonly mutationStarted: boolean;
}

export function buildSetupJourneyView(
  repository: string,
  stage: SetupJourneyStage,
  mutationStarted: boolean,
  outcome?: SetupJourneyOutcome,
): SetupJourneyView {
  const position = SETUP_JOURNEY_STAGES.indexOf(stage);
  return {
    repository: [...repository].map(character => {
      const codePoint = character.codePointAt(0)!;
      return codePoint < 32 || (codePoint >= 127 && codePoint <= 159) ? '?' : character;
    }).join('').slice(0, 120),
    position: position + 1,
    total: SETUP_JOURNEY_STAGES.length,
    current: labels[stage],
    complete: SETUP_JOURNEY_STAGES.slice(0, position).map(item => labels[item]),
    pending: SETUP_JOURNEY_STAGES.slice(position + 1).map(item => labels[item]),
    ...(outcome ? { outcome } : {}),
    mutationStarted,
  };
}
