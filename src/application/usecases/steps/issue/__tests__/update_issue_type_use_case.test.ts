import { UpdateIssueTypeUseCase } from '../update_issue_type_use_case';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
}));

const mockSetIssueType = jest.fn();

function baseParam() {
  return {
    issueNumber: 42,
    issueType: { name: 'Task', description: 'Work item', color: 'BLUE' },
  } as unknown as Parameters<UpdateIssueTypeUseCase['invoke']>[0];
}

describe('UpdateIssueTypeUseCase', () => {
  let useCase: UpdateIssueTypeUseCase;

  beforeEach(() => {
    useCase = new UpdateIssueTypeUseCase({ setIssueType: mockSetIssueType });
    mockSetIssueType.mockReset();
  });

  it('returns empty result when setIssueType succeeds', async () => {
    mockSetIssueType.mockResolvedValue(undefined);
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(0);
    expect(mockSetIssueType).toHaveBeenCalledWith(
      42,
      param.issueType,
    );
  });

  it('returns failure result when setIssueType throws', async () => {
    mockSetIssueType.mockRejectedValue(new Error('API error'));
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps).toContain(
      'Tried to update issue type, but there was a problem.'
    );
    expect(results[0].errors).toBeDefined();
  });
});
