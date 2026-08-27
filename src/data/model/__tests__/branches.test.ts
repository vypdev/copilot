import { Branches } from '../branches';

describe('Branches', () => {
  it('assigns tree names and default branch from constructor', () => {
    const b = new Branches(
      'main',
      'main',
      'develop',
      'feature',
      'bugfix',
      'hotfix',
      'release',
      'docs',
      'chore'
    );
    expect(b.main).toBe('main');
    expect(b.defaultBranch).toBe('main');
    expect(b.development).toBe('develop');
    expect(b.featureTree).toBe('feature');
    expect(b.bugfixTree).toBe('bugfix');
    expect(b.hotfixTree).toBe('hotfix');
    expect(b.releaseTree).toBe('release');
    expect(b.docsTree).toBe('docs');
    expect(b.choreTree).toBe('chore');
  });
});
