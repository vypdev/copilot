import { CONFIG_SCHEMA_VERSION, Config } from '../config';
import { isRecommendationState } from '../recommendation_state';

describe('Config', () => {
  it('ignores malformed external data without throwing', () => {
    expect(() => new Config(null)).not.toThrow();
    expect(new Config(null).branchType).toBe('');
    expect(new Config({ branchConfiguration: null }).branchConfiguration).toBeUndefined();
  });
  it('uses empty string for missing branchType', () => {
    const c = new Config({});
    expect(c.branchType).toBe('');
    expect(c.releaseBranch).toBeUndefined();
    expect(c.parentBranch).toBeUndefined();
    expect(c.branchConfiguration).toBeUndefined();
  });

  it('assigns branch fields from data', () => {
    const c = new Config({
      branchType: 'feature',
      releaseBranch: 'release/1.0',
      parentBranch: 'develop',
      workingBranch: 'feature/123-x',
      hotfixOriginBranch: 'tags/v1.0',
      hotfixBranch: 'hotfix/1.0.1',
    });
    expect(c.branchType).toBe('feature');
    expect(c.releaseBranch).toBe('release/1.0');
    expect(c.parentBranch).toBe('develop');
    expect(c.workingBranch).toBe('feature/123-x');
    expect(c.hotfixOriginBranch).toBe('tags/v1.0');
    expect(c.hotfixBranch).toBe('hotfix/1.0.1');
  });

  it('builds BranchConfiguration when branchConfiguration is provided', () => {
    const c = new Config({
      branchConfiguration: {
        name: 'main',
        oid: 'abc',
        children: [{ name: 'develop', oid: 'def', children: [] }],
      },
    });
    expect(c.branchConfiguration).toBeDefined();
    expect(c.branchConfiguration!.name).toBe('main');
    expect(c.branchConfiguration!.oid).toBe('abc');
    expect(c.branchConfiguration!.children).toHaveLength(1);
    expect(c.branchConfiguration!.children[0].name).toBe('develop');
  });

  it('restores a valid recommendation state', () => {
    const c = new Config({
      recommendationState: {
        issueDescriptionFingerprint: 'description-hash',
        recommendationFingerprint: 'recommendation-hash',
        recommendation: '1. Add tests',
      },
    });

    expect(c.recommendationState).toEqual({
      issueDescriptionFingerprint: 'description-hash',
      recommendationFingerprint: 'recommendation-hash',
      recommendation: '1. Add tests',
    });
    expect(isRecommendationState(c.recommendationState)).toBe(true);
    expect(isRecommendationState({ recommendation: 'incomplete' })).toBe(false);
  });

  it('deep-restores and freezes a structured implementation plan', () => {
    const input = {
      issueDescriptionFingerprint: 'description-hash',
      recommendationFingerprint: 'recommendation-hash',
      recommendation: 'Stored compatibility text',
      implementationPlan: {
        steps: [
          { title: ' Define ', details: [' Contract '] },
          { title: 'Implement', details: [] },
          { title: 'Verify', details: ['Tests', 'Documentation'] },
        ],
        acceptance: ' All relevant checks pass. ',
      },
      implementationPlanLocale: 'es_MX',
    };

    const state = new Config({ recommendationState: input }).recommendationState;

    expect(state?.implementationPlan).toEqual({
      steps: [
        { title: 'Define', details: ['Contract'] },
        { title: 'Implement', details: [] },
        { title: 'Verify', details: ['Tests', 'Documentation'] },
      ],
      acceptance: 'All relevant checks pass.',
    });
    expect(state?.implementationPlanLocale).toBe('es-MX');
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state?.implementationPlan)).toBe(true);
    expect(Object.isFrozen(state?.implementationPlan?.steps)).toBe(true);
    expect(Object.isFrozen(state?.implementationPlan?.steps[0].details)).toBe(true);
  });

  it('ignores malformed recommendation state', () => {
    const c = new Config({ recommendationState: { recommendation: 'incomplete' } });

    expect(c.recommendationState).toBeUndefined();
  });

  it('rejects the complete recommendation state when its optional structured plan is malformed', () => {
    const c = new Config({
      recommendationState: {
        issueDescriptionFingerprint: 'description-hash',
        recommendationFingerprint: 'recommendation-hash',
        recommendation: 'Stored compatibility text',
        implementationPlan: { steps: [{ title: 'Too short', details: [] }], acceptance: 'Done.' },
      },
    });

    expect(c.recommendationState).toBeUndefined();
  });

  it.each([
    {
      implementationPlanLocale: 'not a locale',
      implementationPlan: {
        steps: [
          { title: 'Define', details: [] },
          { title: 'Implement', details: [] },
          { title: 'Verify', details: [] },
        ],
        acceptance: 'All checks pass.',
      },
    },
    { implementationPlanLocale: 'es-MX', implementationPlan: undefined },
  ])('rejects malformed structured-plan locale state %#', ({ implementationPlanLocale, implementationPlan }) => {
    const c = new Config({
      recommendationState: {
        issueDescriptionFingerprint: 'description-hash',
        recommendationFingerprint: 'recommendation-hash',
        recommendation: 'Stored compatibility text',
        implementationPlanLocale,
        ...(implementationPlan === undefined ? {} : { implementationPlan }),
      },
    });

    expect(c.recommendationState).toBeUndefined();
  });

  it('uses the current schema and ignores transient result input', () => {
    expect(new Config({ branchType: 'feature', results: [] }).schemaVersion).toBe(CONFIG_SCHEMA_VERSION);
    expect(new Config({ schemaVersion: 99 }).schemaVersion).toBe(CONFIG_SCHEMA_VERSION);
  });
});
