import { PublishGithubActionUseCase } from '../publish_github_action_use_case';
import { Result } from '../../../../data/model/result';
import { INPUT_KEYS } from '../../../contracts/input_keys';
import type { Execution } from '../../../../data/model/execution';

jest.mock('../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
}));

jest.mock('../../../../utils/task_emoji', () => ({
  getTaskEmoji: jest.fn(() => '📦'),
}));

const mockUpdateTag = jest.fn();
const mockUpdateRelease = jest.fn();
jest.mock('../../../../data/repository/release/repository_release_publication_repository', () => ({
  RepositoryReleaseRepository: jest.fn().mockImplementation(() => ({
    updateTag: mockUpdateTag,
    updateRelease: mockUpdateRelease,
  })),
}));

function baseParam(overrides: Record<string, unknown> = {}): Execution {
  return {
    owner: 'owner',
    repo: 'repo',
    tokens: { token: 'token' },
    singleAction: { version: '1.2.3' },
    ...overrides,
  } as unknown as Execution;
}

describe('PublishGithubActionUseCase', () => {
  let useCase: PublishGithubActionUseCase;

  beforeEach(() => {
    useCase = new PublishGithubActionUseCase({ updateTag: mockUpdateTag } as any, { updateRelease: mockUpdateRelease } as any);
    mockUpdateTag.mockResolvedValue(undefined);
    mockUpdateRelease.mockReset();
  });

  it('returns failure when version is empty', async () => {
    const param = baseParam({ singleAction: { version: '' } });
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain(`${INPUT_KEYS.SINGLE_ACTION_VERSION} is not set.`);
  });

  it('calls updateTag with v{version} and major segment, then updateRelease', async () => {
    mockUpdateRelease.mockResolvedValue(12345);
    const param = baseParam({ singleAction: { version: '1.2.3' } });
    await useCase.invoke(param);
    expect(mockUpdateTag).toHaveBeenCalledWith('owner', 'repo', 'v1.2.3', 'v1', 'token');
    expect(mockUpdateRelease).toHaveBeenCalledWith('owner', 'repo', 'v1.2.3', 'v1', 'token');
  });

  it('returns success when updateRelease returns truthy', async () => {
    mockUpdateRelease.mockResolvedValue(999);
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0]).toBeInstanceOf(Result);
    expect(results[0].success).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('v1.2.3') && s.includes('v1'))).toBe(true);
  });

  it('returns failure when updateRelease returns falsy', async () => {
    mockUpdateRelease.mockResolvedValue(null);
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.some((e) => String(e).includes('Failed to update release'))).toBe(true);
  });

  it('returns failure when updateTag or updateRelease throws', async () => {
    mockUpdateTag.mockRejectedValue(new Error('Tag error'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
  });
});
