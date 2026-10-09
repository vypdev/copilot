import { execFileSync, execSync } from 'child_process';
import { getCurrentAttachedBranch, hasLocalOrTrackedGitBranch } from '../cli_context';

jest.mock('child_process', () => ({ execSync: jest.fn(), execFileSync: jest.fn() }));

describe('verified branch for web setup', () => {
  afterEach(() => jest.clearAllMocks());

  test('returns the attached branch from the requested checkout', () => {
    (execSync as jest.Mock).mockReturnValue(Buffer.from('develop\n'));
    expect(getCurrentAttachedBranch('/a/checkout')).toBe('develop');
    expect(execSync).toHaveBeenCalledWith('git symbolic-ref --quiet --short HEAD', { cwd: '/a/checkout' });
  });

  test.each([['', undefined], ['HEAD', undefined]])('rejects an unusable branch value %j', (output, expected) => {
    (execSync as jest.Mock).mockReturnValue(Buffer.from(output));
    expect(getCurrentAttachedBranch('/a/checkout')).toBe(expected);
  });

  test('returns no branch for a detached HEAD or failed git read', () => {
    (execSync as jest.Mock).mockImplementation(() => { throw new Error('detached'); });
    expect(getCurrentAttachedBranch('/a/checkout')).toBeUndefined();
  });

  test('labels a branch observed in a local or origin-tracking ref only', () => {
    (execFileSync as jest.Mock).mockImplementation((_command, args: string[]) => {
      if (args[3] === 'refs/heads/develop') throw new Error('missing');
      return Buffer.alloc(0);
    });
    expect(hasLocalOrTrackedGitBranch('/a/checkout', 'develop')).toBe(true);
    expect(execFileSync).toHaveBeenCalledWith('git', ['show-ref', '--verify', '--quiet', 'refs/remotes/origin/develop'],
      { cwd: '/a/checkout', stdio: 'pipe' });
  });

  test('never treats unsafe input or a missing branch as observed', () => {
    expect(hasLocalOrTrackedGitBranch('/a/checkout', 'bad..branch')).toBe(false);
    expect(execFileSync).not.toHaveBeenCalled();
    (execFileSync as jest.Mock).mockImplementation(() => { throw new Error('missing'); });
    expect(hasLocalOrTrackedGitBranch('/a/checkout', 'develop')).toBe(false);
  });
});
