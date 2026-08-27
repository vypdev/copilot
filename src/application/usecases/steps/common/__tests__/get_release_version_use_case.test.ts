import { GetReleaseVersionUseCase } from '../get_release_version_use_case';
import { Result } from '../../../../../data/model/result';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebugInfo: jest.fn(),
}));

const mockGetDescription = jest.fn();


describe('GetReleaseVersionUseCase', () => {
  let useCase: GetReleaseVersionUseCase;

  beforeEach(() => {
    useCase = new GetReleaseVersionUseCase({ getDescription: mockGetDescription });
    mockGetDescription.mockReset();
  });

  it('returns success with releaseVersion when description contains Release Version', async () => {
    mockGetDescription.mockResolvedValue('Issue body\n### Release Version 2.0.0\nMore text');
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
    } as unknown as Parameters<GetReleaseVersionUseCase['invoke']>[0];

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].payload?.releaseVersion).toBe('2.0.0');
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
    } as unknown as Parameters<GetReleaseVersionUseCase['invoke']>[0];

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
    } as unknown as Parameters<GetReleaseVersionUseCase['invoke']>[0];

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].steps?.some((s) => s.includes('identifying the issue'))).toBe(true);
    expect(mockGetDescription).not.toHaveBeenCalled();
  });

  it('uses issue.number when isIssue true', async () => {
    mockGetDescription.mockResolvedValue('### Release Version 3.1.0\n');
    const param = {
      isSingleAction: false,
      isIssue: true,
      isPullRequest: false,
      issue: { number: 10 },
      pullRequest: { number: 0 },
      owner: 'o',
      repo: 'r',
      tokens: { token: 't' },
    } as unknown as Parameters<GetReleaseVersionUseCase['invoke']>[0];

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 10, 't');
  });

  it('uses pullRequest.number when isPullRequest true', async () => {
    mockGetDescription.mockResolvedValue('### Release Version 4.0.0\n');
    const param = {
      isSingleAction: false,
      isIssue: false,
      isPullRequest: true,
      issue: { number: 0 },
      pullRequest: { number: 77 },
      owner: 'o',
      repo: 'r',
      tokens: { token: 't' },
    } as unknown as Parameters<GetReleaseVersionUseCase['invoke']>[0];

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 77, 't');
  });

  it('returns failure when Release Version not in description', async () => {
    mockGetDescription.mockResolvedValue('No version here');
    const param = {
      isSingleAction: true,
      singleAction: { issue: 1 },
      owner: 'o',
      repo: 'r',
      tokens: { token: 't' },
    } as unknown as Parameters<GetReleaseVersionUseCase['invoke']>[0];

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps ?? []).toHaveLength(0);
  });

  it('returns failure on catch when getDescription throws', async () => {
    mockGetDescription.mockRejectedValue(new Error('API error'));
    const param = {
      isSingleAction: true,
      singleAction: { issue: 1 },
      owner: 'o',
      repo: 'r',
      tokens: { token: 't' },
    } as unknown as Parameters<GetReleaseVersionUseCase['invoke']>[0];

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].steps).toContain('Tried to get the release version but there was a problem.');
  });
});
