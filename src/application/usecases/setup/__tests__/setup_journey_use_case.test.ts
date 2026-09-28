import { SetupJourneyUseCase } from '../setup_journey_use_case';

describe('setup journey', () => {
  it('keeps ordered milestones and does not imply changes before apply', () => {
    const present = jest.fn();
    const journey = new SetupJourneyUseCase('owner/repo', { present });
    journey.advance('choices');
    journey.advance('setup-pat');
    journey.advance('plan');
    expect(present.mock.calls.map(([view]) => view.current)).toEqual(['Setup choices', 'Setup PAT', 'Plan']);
    expect(present.mock.lastCall?.[0]).toMatchObject({
      complete: ['Repository', 'Setup choices', 'Setup PAT'],
      pending: ['Bot PAT & credentials', 'Apply'], mutationStarted: false,
    });
  });

  it('rejects backwards progress and false completion', () => {
    const journey = new SetupJourneyUseCase('owner/repo', { present: jest.fn() });
    journey.advance('plan');
    expect(() => journey.advance('choices')).toThrow('backwards');
    expect(() => journey.finish('complete')).toThrow('before applying');
    expect(() => journey.finish('partial')).toThrow('before mutation');
    expect(() => journey.markMutationStarted()).toThrow('credential validation or apply');
  });

  it('distinguishes dry-run, blocked, cancelled, and post-mutation partial state', () => {
    for (const outcome of ['dry-run', 'blocked', 'cancelled'] as const) {
      const present = jest.fn();
      const journey = new SetupJourneyUseCase('owner/repo', { present });
      journey.advance('plan');
      journey.finish(outcome);
      expect(present.mock.lastCall?.[0]).toMatchObject({ outcome, mutationStarted: false });
      expect(() => journey.advance('apply')).toThrow('finished');
    }
    const present = jest.fn();
    const journey = new SetupJourneyUseCase('owner/repo', { present });
    journey.advance('apply');
    journey.markMutationStarted();
    journey.finish('partial');
    expect(present.mock.lastCall?.[0]).toMatchObject({ outcome: 'partial', mutationStarted: true });
  });

  it('records a possible temporary workflow mutation during credential validation and allows a partial result', () => {
    const present = jest.fn();
    const journey = new SetupJourneyUseCase('owner/repo', { present });
    journey.advance('credentials');
    journey.markMutationStarted();
    journey.markMutationStarted();
    expect(present.mock.lastCall?.[0]).toMatchObject({ current: 'Bot PAT & credentials', mutationStarted: true });
    journey.finish('partial');
    expect(present.mock.lastCall?.[0]).toMatchObject({ outcome: 'partial', mutationStarted: true });
    expect(() => journey.advance('apply')).toThrow('finished');
  });

  it('reports completion only after mutation starts and ignores duplicate finish', () => {
    const present = jest.fn();
    const journey = new SetupJourneyUseCase('owner/repo', { present });
    journey.advance('apply');
    journey.markMutationStarted();
    expect(present.mock.lastCall?.[0].mutationStarted).toBe(true);
    expect(present.mock.lastCall?.[0].outcome).toBeUndefined();
    journey.finish('complete');
    journey.finish('blocked');
    expect(present.mock.lastCall?.[0].outcome).toBe('complete');
  });

  it('ignores repeated advances', () => {
    const present = jest.fn();
    const journey = new SetupJourneyUseCase('owner/repo', { present });
    journey.advance('choices');
    journey.advance('choices');
    expect(present).toHaveBeenCalledTimes(1);
    expect(present.mock.lastCall?.[0]).toMatchObject({ current: 'Setup choices', complete: ['Repository'] });
  });

  it('reopens only pre-PAT choices and returns to PAT review without resetting the run', () => {
    const present = jest.fn();
    const journey = new SetupJourneyUseCase('owner/repo', { present });
    journey.advance('choices');
    journey.advance('setup-pat');
    expect(journey.revisitChoices()).toBe(2);
    expect(present.mock.lastCall?.[0]).toMatchObject({
      current: 'Setup choices', choiceReviewPass: 2, complete: ['Repository'],
      pending: ['Setup PAT', 'Plan', 'Bot PAT & credentials', 'Apply'], mutationStarted: false,
    });
    journey.advance('setup-pat');
    expect(present.mock.lastCall?.[0]).toMatchObject({ current: 'Setup PAT', choiceReviewPass: 2 });
    expect(journey.revisitChoices()).toBe(3);
  });

  it('rejects a review loop outside pre-PAT review or after cancellation', () => {
    const journey = new SetupJourneyUseCase('owner/repo', { present: jest.fn() });
    expect(() => journey.revisitChoices()).toThrow('pre-PAT');
    journey.advance('setup-pat');
    journey.finish('cancelled');
    expect(() => journey.revisitChoices()).toThrow('pre-PAT');
    const later = new SetupJourneyUseCase('owner/repo', { present: jest.fn() });
    later.advance('plan');
    expect(() => later.revisitChoices()).toThrow('pre-PAT');
  });

  it('cannot reopen choices once application has begun', () => {
    const journey = new SetupJourneyUseCase('owner/repo', { present: jest.fn() });
    journey.advance('apply');
    journey.markMutationStarted();
    expect(() => journey.revisitChoices()).toThrow('pre-PAT');
  });
});
