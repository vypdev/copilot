import { Commit } from '../commit';

describe('Commit', () => {
  it('uses inputs when provided for branchReference and branch', () => {
    const inputs = { commits: { ref: 'refs/heads/feature/123-x' } };
    const c = new Commit(inputs);
    expect(c.branchReference).toBe('refs/heads/feature/123-x');
    expect(c.branch).toBe('feature/123-x');
  });

  it('uses inputs.ref when commits.ref is not available', () => {
    const c = new Commit({ ref: 'refs/heads/main' });
    expect(c.branchReference).toBe('refs/heads/main');
    expect(c.branch).toBe('main');
  });

  it('returns empty string for branchReference when inputs have no ref', () => {
    const c = new Commit(undefined);
    expect(c.branchReference).toBe('');
    expect(c.branch).toBe('');
  });

  it('returns commits from inputs', () => {
    const payloadCommits = [{ id: '1', message: 'fix' }];
    const c = new Commit({ commits: payloadCommits });
    expect(c.commits).toEqual(payloadCommits);
  });

  it('returns empty array when context has no commits', () => {
    const c = new Commit(undefined);
    expect(c.commits).toEqual([]);
  });
});
