import { CloseIssueAfterMergingUseCase } from '../close_issue_after_merging_use_case';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebugInfo: jest.fn(),
}));

const mockCloseIssue = jest.fn();

function baseParam() {
  return {
    issueNumber: 42,
    pullRequestNumber: 10,
  } as unknown as Parameters<CloseIssueAfterMergingUseCase['invoke']>[0];
}

describe('CloseIssueAfterMergingUseCase', () => {
  let useCase: CloseIssueAfterMergingUseCase;

  beforeEach(() => {
    useCase = new CloseIssueAfterMergingUseCase({ closeIssue: mockCloseIssue });
    mockCloseIssue.mockReset();
  });

  it('closes the issue using native state without adding a timeline comment', async () => {
    mockCloseIssue.mockResolvedValue(true);
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('42') && s.includes('closed'))).toBe(true);
    expect(mockCloseIssue).toHaveBeenCalledWith(42);
  });

  it('returns success executed false when closeIssue returns false', async () => {
    mockCloseIssue.mockResolvedValue(false);
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
  });

  it.each([-1, 10, Number.MAX_SAFE_INTEGER + 1, Number.NaN])('does not call GitHub when a pull request has no separate safe linked issue: %s', async (issueNumber) => {
    const results = await useCase.invoke({ ...baseParam(), issueNumber } as unknown as Parameters<CloseIssueAfterMergingUseCase['invoke']>[0]);

    expect(results[0]).toMatchObject({ success: true, executed: false });
    expect(mockCloseIssue).not.toHaveBeenCalled();
  });

  it('returns failure when closeIssue throws', async () => {
    mockCloseIssue.mockRejectedValue(new Error('API error'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
    expect(results[0].steps?.some((s) => s.includes('42'))).toBe(true);
  });
});
