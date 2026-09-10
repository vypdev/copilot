import { CreateTagUseCase } from '../create_tag_use_case';
import { Result } from '../../../../data/model/result';
import type { Execution } from '../../../../data/model/execution';

jest.mock('../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
}));

jest.mock('../../../../utils/task_emoji', () => ({
  getTaskEmoji: jest.fn(() => '🏷️'),
}));

const mockCreateOrVerifyTagAtSha = jest.fn();
jest.mock('../../../../data/repository/release/repository_tag_repository', () => ({
  RepositoryReleaseRepository: jest.fn().mockImplementation(() => ({
    createOrVerifyTagAtSha: mockCreateOrVerifyTagAtSha,
  })),
}));

function baseParam(overrides: Record<string, unknown> = {}): Execution {
  return {
    owner: 'owner',
    repo: 'repo',
    tokens: { token: 'token' },
    singleAction: { version: '1.0.0', operationId: 'operation-12345678' },
    currentConfiguration: {
      deploymentOrchestration: {
        operationId: 'operation-12345678',
        version: '1.0.0',
        phase: 'publishing',
        productionSha: 'a'.repeat(40),
      },
    },
    ...overrides,
  } as unknown as Execution;
}

describe('CreateTagUseCase', () => {
  let useCase: CreateTagUseCase;

  beforeEach(() => {
    useCase = new CreateTagUseCase({ createOrVerifyTagAtSha: mockCreateOrVerifyTagAtSha } as any);
    mockCreateOrVerifyTagAtSha.mockReset();
  });

  it('returns failure without a durable deployment operation', async () => {
    const param = baseParam({ currentConfiguration: {} });
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain('create_tag requires a durable deployment operation.');
  });

  it('returns failure when production has no accepted SHA', async () => {
    const param = baseParam({
      currentConfiguration: {
        deploymentOrchestration: { operationId: 'operation-12345678', version: '1.0.0', phase: 'publishing' },
      },
    });
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors.map((error) => error.message)).toContain('The deployment operation has no accepted production SHA.');
  });

  it('creates the tag at the accepted production SHA', async () => {
    mockCreateOrVerifyTagAtSha.mockResolvedValue('abc123');
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results).toHaveLength(1);
    expect(results[0]).toBeInstanceOf(Result);
    expect(results[0].success).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('v1.0.0') && s.includes('abc123'))).toBe(true);
    expect(mockCreateOrVerifyTagAtSha).toHaveBeenCalledWith(
      'owner',
      'repo',
      'a'.repeat(40),
      'v1.0.0',
      'token'
    );
  });

  it('returns failure when tag creation returns no SHA', async () => {
    mockCreateOrVerifyTagAtSha.mockResolvedValue(undefined);
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.some((e) => String(e).includes('Failed to create tag'))).toBe(true);
  });

  it('returns failure when tag creation throws', async () => {
    mockCreateOrVerifyTagAtSha.mockRejectedValue(new Error('API error'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
  });
});
