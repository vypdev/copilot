import { GetReleaseVersionUseCase } from '../get_release_version_use_case';
import { getResultPayload, Result } from '../../../../../data/model/result';

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
    const param = { issueNumber: 42 };

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(getResultPayload(results[0].payload)?.releaseVersion).toBe('2.0.0');
    expect(mockGetDescription).toHaveBeenCalledWith(42);
  });

  it('returns failure when description is undefined', async () => {
    mockGetDescription.mockResolvedValue(undefined);
    const param = { issueNumber: 1 };

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].steps?.some((s) => s.includes('description'))).toBe(true);
  });

  it('returns failure when issue number cannot be determined', async () => {
    const param = { issueNumber: -1 };

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].steps?.some((s) => s.includes('identifying the issue'))).toBe(true);
    expect(mockGetDescription).not.toHaveBeenCalled();
  });

  it('queries the explicit issue number', async () => {
    mockGetDescription.mockResolvedValue('### Release Version 3.1.0\n');
    const param = { issueNumber: 10 };

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(mockGetDescription).toHaveBeenCalledWith(10);
  });

  it('does not need event-type dispatch to query another issue', async () => {
    mockGetDescription.mockResolvedValue('### Release Version 4.0.0\n');
    const param = { issueNumber: 77 };

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(mockGetDescription).toHaveBeenCalledWith(77);
  });

  it('returns failure when Release Version not in description', async () => {
    mockGetDescription.mockResolvedValue('No version here');
    const param = { issueNumber: 1 };

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps ?? []).toHaveLength(0);
  });

  it('returns failure on catch when getDescription throws', async () => {
    mockGetDescription.mockRejectedValue(new Error('API error'));
    const param = { issueNumber: 1 };

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].steps).toContain('Tried to get the release version but there was a problem.');
  });
});
