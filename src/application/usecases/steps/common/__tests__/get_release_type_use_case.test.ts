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
    const param = { issueNumber: 1 };

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(getResultPayload(results[0].payload)?.releaseType).toBe('Minor');
  });

  it('returns failure when release type not found in description', async () => {
    mockGetDescription.mockResolvedValue('No release type here');
    const param = { issueNumber: 1 };

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
  });

  it('returns failure when not single action, issue or pull request', async () => {
    const param = { issueNumber: -1 };

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].steps?.[0]).toContain('problem identifying the issue');
  });

  it('returns failure when getDescription returns undefined', async () => {
    mockGetDescription.mockResolvedValue(undefined);
    const param = { issueNumber: 1 };

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].steps?.[0]).toContain('problem getting the description');
  });

  it('returns failure and pushes result on catch', async () => {
    mockGetDescription.mockRejectedValue(new Error('API error'));
    const param = { issueNumber: 1 };

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].steps).toContain('Tried to check action permissions.');
  });

  it('queries the explicit issue number', async () => {
    mockGetDescription.mockResolvedValue('### Release Type Major\n');
    const param = { issueNumber: 200 };

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(mockGetDescription).toHaveBeenCalledWith(200);
  });

  it('does not need event-type dispatch to query another issue', async () => {
    mockGetDescription.mockResolvedValue('### Release Type Patch\n');
    const param = { issueNumber: 88 };

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(mockGetDescription).toHaveBeenCalledWith(88);
  });
});
