import {
  classifyBugbotFindingState,
  countBugbotFindingStates,
  countActionableBugbotFindings,
  isBugbotActionableState,
  isBugbotCleanState,
  isHumanResolver,
  type BugbotFindingEvidence,
  type BugbotFindingState,
} from '../review_state';

describe('Bugbot review state', () => {
  it.each<readonly [string, BugbotFindingEvidence, BugbotFindingState]>([
    ['open marker and open thread', { markerResolved: false, thread: { resolved: false } }, 'open'],
    ['reopened evidence', { markerResolved: false, thread: { resolved: false }, wasResolvedBeforeCurrentAnalysis: true }, 'reopened'],
    ['fixed marker and thread', { markerResolved: true, markerResolution: 'fixed', thread: { resolved: true } }, 'fixed'],
    ['obsolete marker and thread', { markerResolved: true, markerResolution: 'obsolete', thread: { resolved: true } }, 'obsolete'],
    ['dismissed marker and thread', { markerResolved: true, markerResolution: 'dismissed', thread: { resolved: true } }, 'dismissed'],
    ['resolved marker without an inline thread', { markerResolved: true, markerResolution: 'fixed' }, 'fixed'],
    ['resolved marker with no explicit reason', { markerResolved: true }, 'fixed'],
    ['human-resolved open marker', { markerResolved: false, botLogin: 'bugbot', thread: { resolved: true, resolvedByLogin: 'maintainer' } }, 'dismissed'],
    ['bot-resolved open marker', { markerResolved: false, botLogin: 'bugbot', thread: { resolved: true, resolvedByLogin: 'bugbot' } }, 'verification-required'],
    ['unattributed resolved thread', { markerResolved: false, botLogin: 'bugbot', thread: { resolved: true } }, 'verification-required'],
    ['human-unresolved resolved marker', { markerResolved: true, markerResolution: 'fixed', thread: { resolved: false } }, 'verification-required'],
    ['current analysis contradicts resolved marker', { markerResolved: true, markerResolution: 'fixed', thread: { resolved: true }, currentAnalysisReportsFinding: true }, 'verification-required'],
    ['current analysis cannot reverse human dismissal', { markerResolved: true, markerResolution: 'dismissed', thread: { resolved: true }, currentAnalysisReportsFinding: true }, 'dismissed'],
    ['untrusted evidence', { markerResolved: false, trusted: false }, 'unknown'],
    ['malformed owned evidence', { markerResolved: false, malformed: true }, 'unknown'],
  ])('classifies %s', (_label, evidence, expected) => {
    expect(classifyBugbotFindingState(evidence)).toBe(expected);
  });

  it.each([
    ['open', true, false],
    ['reopened', true, false],
    ['verification-required', true, false],
    ['fixed', false, true],
    ['obsolete', false, true],
    ['dismissed', false, true],
    ['unknown', false, false],
  ] as const)('projects action and clean policy for %s', (state, actionable, clean) => {
    expect(isBugbotActionableState(state)).toBe(actionable);
    expect(isBugbotCleanState(state)).toBe(clean);
  });

  it('counts every state with stable zero values', () => {
    const counts = countBugbotFindingStates(['open', 'fixed', 'open', 'reopened', 'verification-required']);
    expect(counts).toEqual({
      open: 2,
      reopened: 1,
      fixed: 1,
      obsolete: 0,
      dismissed: 0,
      'verification-required': 1,
      unknown: 0,
    });
    expect(countActionableBugbotFindings(counts)).toBe(4);
  });

  it.each([
    ['Maintainer', 'bugbot', true],
    ['BUGBOT', 'bugbot[bot]', false],
    [undefined, 'bugbot', false],
    ['maintainer', undefined, false],
  ] as const)('attributes resolver %s against %s', (resolver, bot, expected) => {
    expect(isHumanResolver(resolver, bot)).toBe(expected);
  });
});
