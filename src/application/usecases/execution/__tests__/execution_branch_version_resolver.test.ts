import {
  ExecutionBranchVersionResolver,
  type BranchVersionResolutionContext,
} from '../execution_branch_version_resolver';

const getLatestTag = jest.fn();
const getReleaseVersion = jest.fn();
const getReleaseType = jest.fn();
const getHotfixVersion = jest.fn();

function context(overrides: Partial<BranchVersionResolutionContext> = {}): BranchVersionResolutionContext {
  return {
    issueNumber: 42,
    release: { active: false },
    hotfix: { active: false },
    branches: { releaseTree: 'release', hotfixTree: 'hotfix' },
    configuration: {},
    ...overrides,
  };
}

function resolver(): ExecutionBranchVersionResolver {
  return new ExecutionBranchVersionResolver(
    { getLatestTag },
    { taskId: 'release-version', invoke: getReleaseVersion },
    { taskId: 'release-type', invoke: getReleaseType },
    { taskId: 'hotfix-version', invoke: getHotfixVersion },
  );
}

describe('ExecutionBranchVersionResolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('handles a successful release lookup with an empty semantic payload', async () => {
    getReleaseVersion.mockResolvedValue([{ executed: true, success: true }]);

    const result = await resolver().resolve(context({ release: { active: true } }));

    expect(result.completed).toBe(true);
    expect(result.release.version).toBeUndefined();
    expect(getReleaseVersion).toHaveBeenCalledWith({ issueNumber: 42 });
    expect(getReleaseType).not.toHaveBeenCalled();
  });

  it('completes without tag lookup when neither release reader produces a result', async () => {
    getReleaseVersion.mockResolvedValue([]);
    getReleaseType.mockResolvedValue([]);

    const result = await resolver().resolve(context({ release: { active: true } }));

    expect(result.completed).toBe(true);
    expect(result.release.version).toBeUndefined();
    expect(getLatestTag).not.toHaveBeenCalled();
  });

  it('handles a successful hotfix lookup with an empty semantic payload', async () => {
    getHotfixVersion.mockResolvedValue([{ executed: true, success: true }]);

    const result = await resolver().resolve(context({ hotfix: { active: true } }));

    expect(result.completed).toBe(true);
    expect(result.hotfix.baseVersion).toBeUndefined();
    expect(result.hotfix.version).toBeUndefined();
    expect(getLatestTag).not.toHaveBeenCalled();
  });
});
