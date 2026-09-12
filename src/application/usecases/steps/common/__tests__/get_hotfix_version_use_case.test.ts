import { GetHotfixVersionUseCase } from '../get_hotfix_version_use_case';
import { getResultPayload } from '../../../../../data/model/result';

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
    const param = { issueNumber: 42 };

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(getResultPayload(results[0].payload)?.baseVersion).toBe('1.2.0');
    expect(getResultPayload(results[0].payload)?.hotfixVersion).toBe('1.2.1');
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

  it('returns failure when Base Version is missing in description', async () => {
    mockGetDescription.mockResolvedValue('Only ### Hotfix Version 1.0.1 here');
    const param = { issueNumber: 1 };

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].steps?.some((s) => s.includes('base version'))).toBe(true);
  });

  it('returns failure when Hotfix Version is missing in description', async () => {
    mockGetDescription.mockResolvedValue('Only ### Base Version 1.0.0 here');
    const param = { issueNumber: 1 };

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].steps?.some((s) => s.includes('hotfix version'))).toBe(true);
  });

  it('queries the explicit issue number', async () => {
    mockGetDescription.mockResolvedValue('### Base Version 1.0.0\n### Hotfix Version 1.0.1');
    const param = { issueNumber: 100 };

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(mockGetDescription).toHaveBeenCalledWith(100);
  });

  it('does not need event-type dispatch to query another issue', async () => {
    mockGetDescription.mockResolvedValue('### Base Version 2.0.0\n### Hotfix Version 2.0.1');
    const param = { issueNumber: 50 };

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(mockGetDescription).toHaveBeenCalledWith(50);
  });

  it('returns failure on catch when getDescription throws', async () => {
    mockGetDescription.mockRejectedValue(new Error('Network error'));
    const param = { issueNumber: 1 };

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(false);
    expect(results[0].steps).toContain('Tried to check action permissions.');
  });
});
