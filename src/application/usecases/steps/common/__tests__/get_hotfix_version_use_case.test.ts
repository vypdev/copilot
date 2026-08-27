import { GetHotfixVersionUseCase } from '../get_hotfix_version_use_case';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
}));

const mockGetDescription = jest.fn();


describe('GetHotfixVersionUseCase', () => {
  let useCase: GetHotfixVersionUseCase;

  beforeEach(() => {
    useCase = new GetHotfixVersionUseCase({ getDescription: mockGetDescription });
    mockGetDescription.mockReset();
  });

  it('returns success with baseVersion and hotfixVersion when description contains both', async () => {
    mockGetDescription.mockResolvedValue(
      'Issue body\n### Base Version 1.2.0\n### Hotfix Version 1.2.1\nMore text'
    );
    const param = {
      isSingleAction: true,
      isIssue: false,
      isPullRequest: false,
      singleAction: { issue: 42 },
      issue: { number: 0 },
      pullRequest: { number: 0 },
      owner: 'owner',
      repo: 'repo',
      tokens: { token: 'token' },
    } as unknown as Parameters<GetHotfixVersionUseCase['invoke']>[0];

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].payload?.baseVersion).toBe('1.2.0');
    expect(results[0].payload?.hotfixVersion).toBe('1.2.1');
    expect(mockGetDescription).toHaveBeenCalledWith('owner', 'repo', 42, 'token');
  });

  it('returns failure when description is undefined', async () => {
    mockGetDescription.mockResolvedValue(undefined);
    const param = {
      isSingleAction: true,
      isIssue: false,
      isPullRequest: false,
      singleAction: { issue: 1 },
      owner: 'o',
      repo: 'r',
      tokens: { token: 't' },
    } as unknown as Parameters<GetHotfixVersionUseCase['invoke']>[0];

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].steps?.some((s) => s.includes('description'))).toBe(true);
  });

  it('returns failure when issue number cannot be determined', async () => {
    const param = {
      isSingleAction: false,
      isIssue: false,
      isPullRequest: false,
      singleAction: { issue: 0 },
      issue: { number: -1 },
      pullRequest: { number: 0 },
      owner: 'o',
      repo: 'r',
      tokens: { token: 't' },
    } as unknown as Parameters<GetHotfixVersionUseCase['invoke']>[0];

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].steps?.some((s) => s.includes('identifying the issue'))).toBe(true);
    expect(mockGetDescription).not.toHaveBeenCalled();
  });

  it('returns failure when Base Version is missing in description', async () => {
    mockGetDescription.mockResolvedValue('Only ### Hotfix Version 1.0.1 here');
    const param = {
      isSingleAction: true,
      singleAction: { issue: 1 },
      owner: 'o',
      repo: 'r',
      tokens: { token: 't' },
    } as unknown as Parameters<GetHotfixVersionUseCase['invoke']>[0];

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].steps?.some((s) => s.includes('base version'))).toBe(true);
  });

  it('returns failure when Hotfix Version is missing in description', async () => {
    mockGetDescription.mockResolvedValue('Only ### Base Version 1.0.0 here');
    const param = {
      isSingleAction: true,
      singleAction: { issue: 1 },
      owner: 'o',
      repo: 'r',
      tokens: { token: 't' },
    } as unknown as Parameters<GetHotfixVersionUseCase['invoke']>[0];

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].steps?.some((s) => s.includes('hotfix version'))).toBe(true);
  });

  it('uses issue.number when isIssue true', async () => {
    mockGetDescription.mockResolvedValue('### Base Version 1.0.0\n### Hotfix Version 1.0.1');
    const param = {
      isSingleAction: false,
      isIssue: true,
      isPullRequest: false,
      issue: { number: 100 },
      pullRequest: { number: 0 },
      owner: 'o',
      repo: 'r',
      tokens: { token: 't' },
    } as unknown as Parameters<GetHotfixVersionUseCase['invoke']>[0];

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 100, 't');
  });

  it('uses pullRequest.number when isPullRequest true', async () => {
    mockGetDescription.mockResolvedValue('### Base Version 2.0.0\n### Hotfix Version 2.0.1');
    const param = {
      isSingleAction: false,
      isIssue: false,
      isPullRequest: true,
      issue: { number: 0 },
      pullRequest: { number: 50 },
      owner: 'o',
      repo: 'r',
      tokens: { token: 't' },
    } as unknown as Parameters<GetHotfixVersionUseCase['invoke']>[0];

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 50, 't');
  });

  it('returns failure on catch when getDescription throws', async () => {
    mockGetDescription.mockRejectedValue(new Error('Network error'));
    const param = {
      isSingleAction: true,
      singleAction: { issue: 1 },
      owner: 'o',
      repo: 'r',
      tokens: { token: 't' },
    } as unknown as Parameters<GetHotfixVersionUseCase['invoke']>[0];

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].steps).toContain('Tried to check action permissions.');
  });
});
