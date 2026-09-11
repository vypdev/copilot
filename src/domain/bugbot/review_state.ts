export const BUGBOT_FINDING_STATES = [
  'open',
  'reopened',
  'fixed',
  'obsolete',
  'dismissed',
  'verification-required',
  'unknown',
] as const;

export type BugbotFindingState = typeof BUGBOT_FINDING_STATES[number];
export type BugbotResolvedFindingState = 'fixed' | 'obsolete' | 'dismissed';

export interface BugbotThreadFact {
  readonly resolved: boolean;
  readonly resolvedByLogin?: string;
}

export interface BugbotFindingEvidence {
  readonly markerResolved: boolean;
  readonly markerResolution?: BugbotResolvedFindingState;
  readonly thread?: BugbotThreadFact;
  readonly botLogin?: string;
  readonly wasResolvedBeforeCurrentAnalysis?: boolean;
  readonly currentAnalysisReportsFinding?: boolean;
  readonly trusted?: boolean;
  readonly malformed?: boolean;
}

/**
 * Resolves one provider-neutral Bugbot lifecycle state from durable marker and
 * native thread facts. The model is intentionally fail-closed: disagreement
 * never projects a clean PR unless a human dismissal can be attributed.
 */
export function classifyBugbotFindingState(
  evidence: BugbotFindingEvidence,
): BugbotFindingState {
  if (evidence.trusted === false || evidence.malformed === true) return 'unknown';

  const thread = evidence.thread;
  if (evidence.markerResolved) {
    if (thread?.resolved === false) return 'verification-required';
    if (evidence.markerResolution === 'dismissed') return 'dismissed';
    if (evidence.currentAnalysisReportsFinding === true) return 'verification-required';
    return evidence.markerResolution ?? 'fixed';
  }

  if (thread?.resolved === true) {
    if (isHumanResolver(thread.resolvedByLogin, evidence.botLogin)) return 'dismissed';
    return 'verification-required';
  }

  return evidence.wasResolvedBeforeCurrentAnalysis === true ? 'reopened' : 'open';
}

export function isBugbotActionableState(state: BugbotFindingState): boolean {
  return state === 'open' || state === 'reopened' || state === 'verification-required';
}

export function isBugbotCleanState(state: BugbotFindingState): boolean {
  return state === 'fixed' || state === 'obsolete' || state === 'dismissed';
}

export function isHumanResolver(
  resolverLogin: string | undefined,
  botLogin: string | undefined,
): boolean {
  const resolver = normalizeLogin(resolverLogin);
  const bot = normalizeLogin(botLogin);
  return resolver.length > 0 && bot.length > 0 && resolver !== bot;
}

function normalizeLogin(value: string | undefined): string {
  return value?.trim().replace(/\[bot\]$/iu, '').toLowerCase() ?? '';
}

export type BugbotFindingStateCounts = Record<BugbotFindingState, number>;

export function countBugbotFindingStates(
  states: Iterable<BugbotFindingState>,
): BugbotFindingStateCounts {
  const counts = Object.fromEntries(
    BUGBOT_FINDING_STATES.map((state) => [state, 0]),
  ) as BugbotFindingStateCounts;
  for (const state of states) counts[state] += 1;
  return counts;
}

export function countActionableBugbotFindings(
  counts: Readonly<BugbotFindingStateCounts>,
): number {
  return counts.open + counts.reopened + counts['verification-required'];
}
