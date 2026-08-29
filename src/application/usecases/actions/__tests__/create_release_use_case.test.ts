import { CreateReleaseUseCase } from '../create_release_use_case';
import { Result } from '../../../../data/model/result';
import { INPUT_KEYS } from '../../../../utils/constants';
import type { Execution } from '../../../../data/model/execution';

jest.mock('../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
}));

jest.mock('../../../../utils/task_emoji', () => ({
  getTaskEmoji: jest.fn(() => '🚀'),
}));

const mockCreateRelease = jest.fn();
jest.mock('../../../../data/repository/release/repository_release_publication_repository', () => ({
  RepositoryReleaseRepository: jest.fn().mockImplementation(() => ({
    createRelease: mockCreateRelease,
  })),
}));

function baseParam(overrides: Record<string, unknown> = {}): Execution {
  return {
    owner: 'owner',
    repo: 'repo',
    tokens: { token: 'token' },
    singleAction: {
      version: '1.0.0',
      title: 'Release title',
      changelog: '- Fix bug',
    },
    currentConfiguration: {},
    ...overrides,
  } as unknown as Execution;
}

describe('CreateReleaseUseCase', () => {
  let useCase: CreateReleaseUseCase;

  beforeEach(() => {
    useCase = new CreateReleaseUseCase({ createRelease: mockCreateRelease } as any);
    mockCreateRelease.mockReset();
  });

  it('returns failure when version is empty', async () => {
    const param = baseParam({ singleAction: { version: '', title: 't', changelog: 'c' } });
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.some((e) => String(e).includes(INPUT_KEYS.SINGLE_ACTION_VERSION))).toBe(true);
  });

  it('returns failure when title is empty', async () => {
    const param = baseParam({ singleAction: { version: '1.0.0', title: '', changelog: 'c' } });
    const results = await useCase.invoke(param);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.errors?.some((e) => String(e).includes(`${INPUT_KEYS.SINGLE_ACTION_TITLE} is not set.`)))).toBe(true);
  });

  it('returns failure when changelog is empty', async () => {
    const param = baseParam({ singleAction: { version: '1.0.0', title: 't', changelog: '' } });
    const results = await useCase.invoke(param);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.errors?.some((e) => String(e).includes(`${INPUT_KEYS.SINGLE_ACTION_CHANGELOG} is not set.`)))).toBe(true);
  });

  it('returns failure when version format is invalid', async () => {
    const param = baseParam({
      singleAction: { version: 'abc', title: 'Release', changelog: '- Fix' },
    });
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.some((e) => String(e).includes(INPUT_KEYS.SINGLE_ACTION_VERSION))).toBe(true);
    expect(mockCreateRelease).not.toHaveBeenCalled();
  });

  it('accepts version with leading v and produces tag v1.0.0 (no double v)', async () => {
    mockCreateRelease.mockResolvedValue('https://github.com/owner/repo/releases/tag/v1.0.0');
    const param = baseParam({ singleAction: { version: 'v1.0.0', title: 'Release', changelog: '- Fix' } });
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(true);
    expect(mockCreateRelease).toHaveBeenCalledWith(
      'owner',
      'repo',
      'v1.0.0',
      'Release',
      '- Fix',
      'token'
    );
  });

  it('returns success with release URL when createRelease succeeds', async () => {
    mockCreateRelease.mockResolvedValue('https://github.com/owner/repo/releases/tag/v1.0.0');
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0]).toBeInstanceOf(Result);
    expect(results[0].success).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('Created release'))).toBe(true);
    expect(mockCreateRelease).toHaveBeenCalledWith(
      'owner',
      'repo',
      'v1.0.0',
      'Release title',
      '- Fix bug',
      'token'
    );
  });

  it('returns failure when createRelease returns null', async () => {
    mockCreateRelease.mockResolvedValue(null);
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain('Failed to create release.');
  });

  it('returns failure and catches error when createRelease throws', async () => {
    mockCreateRelease.mockRejectedValue(new Error('API error'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.length).toBeGreaterThan(0);
  });
});
