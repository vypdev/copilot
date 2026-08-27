import type { Execution } from '../../../../data/model/execution';
import { IssueContentInterface } from '../issue_content_interface';

jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn(),
}));

const mockGetDescription = jest.fn();
const mockUpdateDescription = jest.fn();


/** Concrete implementation for testing IssueContentInterface. */
class TestIssueContent extends IssueContentInterface {
  get id(): string {
    return 'test-block';
  }
  get visibleContent(): boolean {
    return false;
  }
}

const START = '<!-- copilot-test-block-start';
const END = 'copilot-test-block-end -->';

function descriptionWithBlock(body: string): string {
  return `pre\n${START}\n${body}\n${END}\npost`;
}

function minimalExecution(overrides: Record<string, unknown> = {}): Execution {
  return {
    owner: 'o',
    repo: 'r',
    tokens: { token: 't' },
    isIssue: true,
    isPullRequest: false,
    isPush: false,
    isSingleAction: false,
    issue: { number: 42 },
    pullRequest: { number: 99 },
    issueNumber: 42,
    singleAction: { issue: 123, isIssue: false, isPullRequest: false, isPush: false },
    ...overrides,
  } as unknown as Execution;
}

describe('IssueContentInterface', () => {
  let handler: TestIssueContent;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new TestIssueContent({ getDescription: mockGetDescription, updateDescription: mockUpdateDescription });
  });

  describe('internalGetter', () => {
    it('uses issue.number when isIssue and not single action', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithBlock('data'));
      const execution = minimalExecution({ isIssue: true, isSingleAction: false });

      const result = await handler.internalGetter(execution);

      expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 42, 't');
      expect(result).toBe('\ndata\n');
    });

    it('uses pullRequest.number when isPullRequest and not single action', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithBlock('pr-data'));
      const execution = minimalExecution({
        isIssue: false,
        isPullRequest: true,
        isSingleAction: false,
      });

      const result = await handler.internalGetter(execution);

      expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 99, 't');
      expect(result).toBe('\npr-data\n');
    });

    it('uses issueNumber when isPush', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithBlock('push-data'));
      const execution = minimalExecution({
        isIssue: false,
        isPullRequest: false,
        isPush: true,
        issueNumber: 7,
      });

      const result = await handler.internalGetter(execution);

      expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 7, 't');
      expect(result).toBe('\npush-data\n');
    });

    it('uses issueNumber when isSingleAction', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithBlock('single'));
      const execution = minimalExecution({
        isSingleAction: true,
        issueNumber: 5,
      });

      const result = await handler.internalGetter(execution);

      expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 5, 't');
      expect(result).toBe('\nsingle\n');
    });

    it('returns undefined when execution is not issue, PR, push or single action', async () => {
      const execution = minimalExecution({
        isIssue: false,
        isPullRequest: false,
        isPush: false,
        isSingleAction: false,
      });

      const result = await handler.internalGetter(execution);

      expect(mockGetDescription).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('returns undefined when getContent finds no block', async () => {
      mockGetDescription.mockResolvedValue('no block here');
      const execution = minimalExecution();

      const result = await handler.internalGetter(execution);

      expect(result).toBeUndefined();
    });

    it('throws when getDescription rejects', async () => {
      mockGetDescription.mockRejectedValue(new Error('api error'));
      const execution = minimalExecution();

      await expect(handler.internalGetter(execution)).rejects.toThrow('api error');
    });
  });

  describe('internalUpdate', () => {
    it('fetches description, updates content and calls updateDescription when isIssue', async () => {
      const desc = descriptionWithBlock('old');
      mockGetDescription.mockResolvedValue(desc);
      mockUpdateDescription.mockResolvedValue(undefined);
      const execution = minimalExecution({ isIssue: true, isSingleAction: false });

      const result = await handler.internalUpdate(execution, 'new');

      expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 42, 't');
      expect(result).toContain('\nnew\n');
      expect(mockUpdateDescription).toHaveBeenCalledWith('o', 'r', 42, expect.any(String), 't');
    });

    it('uses pullRequest.number when isPullRequest', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithBlock('x'));
      mockUpdateDescription.mockResolvedValue(undefined);
      const execution = minimalExecution({
        isIssue: false,
        isPullRequest: true,
        isSingleAction: false,
      });

      await handler.internalUpdate(execution, 'y');

      expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 99, 't');
      expect(mockUpdateDescription).toHaveBeenCalledWith('o', 'r', 99, expect.any(String), 't');
    });

    it('uses issueNumber when isPush', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithBlock('a'));
      mockUpdateDescription.mockResolvedValue(undefined);
      const execution = minimalExecution({
        isIssue: false,
        isPullRequest: false,
        isPush: true,
        issueNumber: 11,
      });

      await handler.internalUpdate(execution, 'b');

      expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 11, 't');
      expect(mockUpdateDescription).toHaveBeenCalledWith('o', 'r', 11, expect.any(String), 't');
    });

    it('when isSingleAction and isIssue uses issue.number', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithBlock('c'));
      mockUpdateDescription.mockResolvedValue(undefined);
      const execution = minimalExecution({
        isSingleAction: true,
        isIssue: true,
        issue: { number: 88 },
      });

      await handler.internalUpdate(execution, 'd');

      expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 88, 't');
    });

    it('when isSingleAction and isPullRequest uses pullRequest.number', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithBlock('e'));
      mockUpdateDescription.mockResolvedValue(undefined);
      const execution = minimalExecution({
        isSingleAction: true,
        isIssue: false,
        isPullRequest: true,
        pullRequest: { number: 77 },
      });

      await handler.internalUpdate(execution, 'f');

      expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 77, 't');
    });

    it('when isSingleAction and isPush uses issueNumber', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithBlock('g'));
      mockUpdateDescription.mockResolvedValue(undefined);
      const execution = minimalExecution({
        isSingleAction: true,
        isIssue: false,
        isPullRequest: false,
        isPush: true,
        issueNumber: 33,
      });

      await handler.internalUpdate(execution, 'h');

      expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 33, 't');
    });

    it('when isSingleAction and not issue/PR/push uses singleAction.issue', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithBlock('i'));
      mockUpdateDescription.mockResolvedValue(undefined);
      const execution = minimalExecution({
        isSingleAction: true,
        isIssue: false,
        isPullRequest: false,
        isPush: false,
        singleAction: { issue: 999, isIssue: false, isPullRequest: false, isPush: false },
      });

      await handler.internalUpdate(execution, 'j');

      expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 999, 't');
    });

    it('returns undefined when execution is not issue, PR, push or single action', async () => {
      const execution = minimalExecution({
        isIssue: false,
        isPullRequest: false,
        isPush: false,
        isSingleAction: false,
      });

      const result = await handler.internalUpdate(execution, 'content');

      expect(mockGetDescription).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('returns undefined when updateContent returns undefined', async () => {
      mockGetDescription.mockResolvedValue('only start<!-- copilot-test-block-start');
      const execution = minimalExecution();

      const result = await handler.internalUpdate(execution, 'content');

      expect(mockUpdateDescription).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });

    it('throws when getDescription rejects', async () => {
      mockGetDescription.mockRejectedValue(new Error('network error'));
      const execution = minimalExecution();

      await expect(handler.internalUpdate(execution, 'x')).rejects.toThrow('network error');
    });
  });
});
