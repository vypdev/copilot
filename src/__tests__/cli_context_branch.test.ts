import { execSync } from 'child_process';
import { getCurrentAttachedBranch } from '../cli_context';

jest.mock('child_process', () => ({ execSync: jest.fn() }));

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
});
