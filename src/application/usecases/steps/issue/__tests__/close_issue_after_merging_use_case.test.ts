import { CloseIssueAfterMergingUseCase } from '../close_issue_after_merging_use_case';

jest.mock('../../../../../utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebugInfo: jest.fn(),
}));

const mockCloseIssue = jest.fn();
const mockAddComment = jest.fn();

function baseParam() {
  return {
    owner: 'o',
    repo: 'r',
    issueNumber: 42,
    pullRequest: { number: 10 },
    tokens: { token: 't' },
  } as unknown as Parameters<CloseIssueAfterMergingUseCase['invoke']>[0];
}

describe('CloseIssueAfterMergingUseCase', () => {
  let useCase: CloseIssueAfterMergingUseCase;

  beforeEach(() => {
    useCase = new CloseIssueAfterMergingUseCase({ closeIssue: mockCloseIssue, addComment: mockAddComment });
    mockCloseIssue.mockReset();
    mockAddComment.mockReset();
  });

  it('closes issue and adds comment when closeIssue returns true', async () => {
    mockCloseIssue.mockResolvedValue(true);
    mockAddComment.mockResolvedValue(undefined);
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps?.some((s) => s.includes('42') && s.includes('closed'))).toBe(true);
    expect(mockCloseIssue).toHaveBeenCalledWith('o', 'r', 42, 't');
    expect(mockAddComment).toHaveBeenCalledWith(
      'o',
      'r',
      42,
      expect.stringContaining('closed after merging #10'),
      't'
    );
  });

  it('returns success executed false when closeIssue returns false', async () => {
    mockCloseIssue.mockResolvedValue(false);
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(false);
    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it('returns failure when closeIssue throws', async () => {
    mockCloseIssue.mockRejectedValue(new Error('API error'));
    const param = baseParam();
    const results = await useCase.invoke(param);
    expect(results[0].success).toBe(false);
    expect(results[0].steps?.some((s) => s.includes('42'))).toBe(true);
  });
});
