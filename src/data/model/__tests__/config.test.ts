import { Config } from '../config';

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
  });

  it('ignores malformed recommendation state', () => {
    const c = new Config({ recommendationState: { recommendation: 'incomplete' } });

    expect(c.recommendationState).toBeUndefined();
  });
});
