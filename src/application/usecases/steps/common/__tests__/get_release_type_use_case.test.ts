import { GetReleaseTypeUseCase } from '../get_release_type_use_case';
import { getResultPayload } from '../../../../../data/model/result';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
}));

const mockGetDescription = jest.fn();


describe('GetReleaseTypeUseCase', () => {
  let useCase: GetReleaseTypeUseCase;

  beforeEach(() => {
    useCase = new GetReleaseTypeUseCase({ getDescription: mockGetDescription });
    mockGetDescription.mockReset();
  });

  it('returns success with releaseType when description contains Release Type', async () => {
    mockGetDescription.mockResolvedValue('Body\n### Release Type Minor\n');
    const param = {
      isSingleAction: true,
      isIssue: false,
      isPullRequest: false,
      singleAction: { issue: 1 },
      owner: 'o',
      repo: 'r',
      tokens: { token: 't' },
    } as unknown as Parameters<GetReleaseTypeUseCase['invoke']>[0];

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(getResultPayload(results[0].payload)?.releaseType).toBe('Minor');
  });

  it('returns failure when release type not found in description', async () => {
    mockGetDescription.mockResolvedValue('No release type here');
    const param = {
      isSingleAction: true,
      singleAction: { issue: 1 },
      owner: 'o',
      repo: 'r',
      tokens: { token: 't' },
    } as unknown as Parameters<GetReleaseTypeUseCase['invoke']>[0];

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
  });

  it('returns failure when not single action, issue or pull request', async () => {
    const param = {
      isSingleAction: false,
      isIssue: false,
      isPullRequest: false,
      owner: 'o',
      repo: 'r',
      tokens: { token: 't' },
    } as unknown as Parameters<GetReleaseTypeUseCase['invoke']>[0];

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].steps?.[0]).toContain('problem identifying the issue');
  });

  it('returns failure when getDescription returns undefined', async () => {
    mockGetDescription.mockResolvedValue(undefined);
    const param = {
      isSingleAction: true,
      singleAction: { issue: 1 },
      owner: 'o',
      repo: 'r',
      tokens: { token: 't' },
    } as unknown as Parameters<GetReleaseTypeUseCase['invoke']>[0];

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].steps?.[0]).toContain('problem getting the description');
  });

  it('returns failure and pushes result on catch', async () => {
    mockGetDescription.mockRejectedValue(new Error('API error'));
    const param = {
      isSingleAction: true,
      singleAction: { issue: 1 },
      owner: 'o',
      repo: 'r',
      tokens: { token: 't' },
    } as unknown as Parameters<GetReleaseTypeUseCase['invoke']>[0];

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].steps).toContain('Tried to check action permissions.');
  });

  it('uses issue.number when isIssue true', async () => {
    mockGetDescription.mockResolvedValue('### Release Type Major\n');
    const param = {
      isSingleAction: false,
      isIssue: true,
      isPullRequest: false,
      issue: { number: 200 },
      pullRequest: { number: 0 },
      owner: 'o',
      repo: 'r',
      tokens: { token: 't' },
    } as unknown as Parameters<GetReleaseTypeUseCase['invoke']>[0];

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 200, 't');
  });

  it('uses pullRequest.number when isPullRequest true', async () => {
    mockGetDescription.mockResolvedValue('### Release Type Patch\n');
    const param = {
      isSingleAction: false,
      isIssue: false,
      isPullRequest: true,
      issue: { number: 0 },
      pullRequest: { number: 88 },
      owner: 'o',
      repo: 'r',
      tokens: { token: 't' },
    } as unknown as Parameters<GetReleaseTypeUseCase['invoke']>[0];

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 88, 't');
  });
});
