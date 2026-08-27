import { CreateTagUseCase } from '../create_tag_use_case';
import { Result } from '../../../../data/model/result';
import { INPUT_KEYS } from '../../../../utils/constants';
import type { Execution } from '../../../../data/model/execution';

jest.mock('../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
}));

jest.mock('../../../../utils/task_emoji', () => ({
  getTaskEmoji: jest.fn(() => '🏷️'),
}));

const mockCreateTag = jest.fn();
jest.mock('../../../../data/repository/release/repository_tag_repository', () => ({
  RepositoryReleaseRepository: jest.fn().mockImplementation(() => ({
    createTag: mockCreateTag,
  })),
}));

function baseParam(overrides: Record<string, unknown> = {}): Execution {
  return {
    owner: 'owner',
    repo: 'repo',
    tokens: { token: 'token' },
    singleAction: { version: '1.0.0' },
    currentConfiguration: { releaseBranch: 'release/1.0.0' },
    ...overrides,
  } as unknown as Execution;
}

describe('CreateTagUseCase', () => {
  let useCase: CreateTagUseCase;

  beforeEach(() => {
    useCase = new CreateTagUseCase({ createTag: mockCreateTag } as any);
    mockCreateTag.mockReset();
  });

  it('returns failure when version is empty', async () => {
    const param = baseParam({ singleAction: { version: '' } });
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors).toContain(`${INPUT_KEYS.SINGLE_ACTION_VERSION} is not set.`);
  });

  it('returns failure when releaseBranch is undefined', async () => {
    const param = baseParam({ currentConfiguration: { releaseBranch: undefined } });
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors).toContain('Release branch not found in issue configuration.');
  });

  it('returns success with step when createTag succeeds', async () => {
    mockCreateTag.mockResolvedValue('abc123');
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0]).toBeInstanceOf(Result);
    expect(results[0].success).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('v1.0.0') && s.includes('abc123'))).toBe(true);
    expect(mockCreateTag).toHaveBeenCalledWith(
      'owner',
      'repo',
      'release/1.0.0',
      'v1.0.0',
      'token'
    );
  });

  it('returns failure when createTag returns null', async () => {
    mockCreateTag.mockResolvedValue(null);
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.some((e) => String(e).includes('Failed to create tag'))).toBe(true);
  });

  it('returns failure when createTag throws', async () => {
    mockCreateTag.mockRejectedValue(new Error('API error'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
  });
});
