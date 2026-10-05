import { posix, win32 } from 'node:path';

const { relativeJestSuitePath } = require('../../../scripts/setup-acceptance-path.cjs') as {
  relativeJestSuitePath: (root: string, suite: string, pathApi: typeof posix) => string;
};

describe('setup acceptance Jest evidence paths', () => {
  test.each([
    ['POSIX', posix, '/checkout/copilot', '/checkout/copilot/src/cli/commands/setup.test.ts'],
    ['Windows', win32, 'D:\\a\\copilot\\copilot', 'D:\\a\\copilot\\copilot\\src\\cli\\commands\\setup.test.ts'],
  ] as const)('normalizes %s absolute suite names to the ledger path', (_platform, pathApi, root, suite) => {
    expect(relativeJestSuitePath(root, suite, pathApi)).toBe('src/cli/commands/setup.test.ts');
  });
});
