import { DeployedAddedUseCase } from '../label_deployed_added_use_case';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logDebugInfo: jest.fn(),
  logError: jest.fn(),
}));

function baseParam(overrides: Record<string, unknown> = {}) {
  return {
    owner: 'o',
    repo: 'r',
    issue: { labeled: false, labelAdded: '' },
    labels: { deployed: 'deployed' },
    release: { active: false, branch: undefined as string | undefined },
    hotfix: { active: false, branch: undefined as string | undefined },
    ...overrides,
  } as unknown as Parameters<DeployedAddedUseCase['invoke']>[0];
}

describe('DeployedAddedUseCase (label_deployed_added)', () => {
  let useCase: DeployedAddedUseCase;

  beforeEach(() => {
    useCase = new DeployedAddedUseCase();
  });

  it('returns success executed false when issue not labeled or label is not deployed', async () => {
    const param = baseParam({ issue: { labeled: false, labelAdded: '' } });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
  });

  it('returns success executed false when labeled but labelAdded is not deployed', async () => {
    const param = baseParam({ issue: { labeled: true, labelAdded: 'other' }, labels: { deployed: 'deployed' } });

    const results = await useCase.invoke(param);

    expect(results[0].executed).toBe(false);
  });

  it('returns success executed true with release step when labeled with deployed and release active', async () => {
    const param = baseParam({
      issue: { labeled: true, labelAdded: 'deployed' },
      labels: { deployed: 'deployed' },
      release: { active: true, branch: 'release/1.0.0' },
    });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('release/1.0.0') && s.includes('Deploy complete'))).toBe(true);
  });

  it('returns success executed true with hotfix step when labeled with deployed and hotfix active', async () => {
    const param = baseParam({
      issue: { labeled: true, labelAdded: 'deployed' },
      labels: { deployed: 'deployed' },
      hotfix: { active: true, branch: 'hotfix/1.0.1' },
    });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('hotfix/1.0.1') && s.includes('Deploy complete'))).toBe(true);
  });

  it('returns no step when labeled deployed but release and hotfix branch are undefined', async () => {
    const param = baseParam({
      issue: { labeled: true, labelAdded: 'deployed' },
      labels: { deployed: 'deployed' },
      release: { active: true, branch: undefined },
      hotfix: { active: false, branch: undefined },
    });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(0);
  });
});
