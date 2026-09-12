import type { ExecutionConfigurationQuery } from '../../../../application/ports/execution_configuration_ports';
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

function configurationQuery(overrides: Partial<ExecutionConfigurationQuery> = {}): ExecutionConfigurationQuery {
  return {
    owner: 'o',
    repository: 'r',
    token: 't',
    issueNumber: 42,
    ...overrides,
  };
}

describe('IssueContentInterface', () => {
  let handler: TestIssueContent;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new TestIssueContent({ getDescription: mockGetDescription, updateDescription: mockUpdateDescription });
  });

  describe('internalGetter', () => {
    it('reads the issue selected by the explicit query', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithBlock('data'));
      const query = configurationQuery();

      const result = await handler.internalGetter(query);

      expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 42, 't');
      expect(result).toBe('\ndata\n');
    });

    it('does not infer a target type from the selected issue number', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithBlock('pr-data'));
      const query = configurationQuery({ issueNumber: 99 });

      const result = await handler.internalGetter(query);

      expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 99, 't');
      expect(result).toBe('\npr-data\n');
    });

    it('uses issueNumber when isPush', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithBlock('push-data'));
      const query = configurationQuery({ issueNumber: 7 });

      const result = await handler.internalGetter(query);

      expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 7, 't');
      expect(result).toBe('\npush-data\n');
    });

    it('uses issueNumber when isSingleAction', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithBlock('single'));
      const query = configurationQuery({ issueNumber: 5 });

      const result = await handler.internalGetter(query);

      expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 5, 't');
      expect(result).toBe('\nsingle\n');
    });

    it('returns undefined when getContent finds no block', async () => {
      mockGetDescription.mockResolvedValue('no block here');
      const query = configurationQuery();

      const result = await handler.internalGetter(query);

      expect(result).toBeUndefined();
    });

    it('throws when getDescription rejects', async () => {
      mockGetDescription.mockRejectedValue(new Error('api error'));
      const query = configurationQuery();

      await expect(handler.internalGetter(query)).rejects.toThrow('api error');
    });
  });

  describe('internalUpdate', () => {
    it('fetches description, updates content and calls updateDescription when isIssue', async () => {
      const desc = descriptionWithBlock('old');
      mockGetDescription.mockResolvedValue(desc);
      mockUpdateDescription.mockResolvedValue(undefined);
      const query = configurationQuery();

      const result = await handler.internalUpdate(query, 'new');

      expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 42, 't');
      expect(result).toContain('\nnew\n');
      expect(mockUpdateDescription).toHaveBeenCalledWith('o', 'r', 42, expect.any(String), 't');
    });

    it('updates the issue selected by the explicit query', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithBlock('x'));
      mockUpdateDescription.mockResolvedValue(undefined);
      const query = configurationQuery({ issueNumber: 99 });

      await handler.internalUpdate(query, 'y');

      expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 99, 't');
      expect(mockUpdateDescription).toHaveBeenCalledWith('o', 'r', 99, expect.any(String), 't');
    });

    it('uses issueNumber when isPush', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithBlock('a'));
      mockUpdateDescription.mockResolvedValue(undefined);
      const query = configurationQuery({ issueNumber: 11 });

      await handler.internalUpdate(query, 'b');

      expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 11, 't');
      expect(mockUpdateDescription).toHaveBeenCalledWith('o', 'r', 11, expect.any(String), 't');
    });

    it('uses any positive target selected by the composition root', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithBlock('c'));
      mockUpdateDescription.mockResolvedValue(undefined);
      const query = configurationQuery({ issueNumber: 88 });

      await handler.internalUpdate(query, 'd');

      expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 88, 't');
    });

    it('does not require route flags to update a PR-backed issue description', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithBlock('e'));
      mockUpdateDescription.mockResolvedValue(undefined);
      const query = configurationQuery({ issueNumber: 77 });

      await handler.internalUpdate(query, 'f');

      expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 77, 't');
    });

    it('when isSingleAction and isPush uses issueNumber', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithBlock('g'));
      mockUpdateDescription.mockResolvedValue(undefined);
      const query = configurationQuery({ issueNumber: 33 });

      await handler.internalUpdate(query, 'h');

      expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 33, 't');
    });

    it('uses a standalone single-action target resolved before the handler', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithBlock('i'));
      mockUpdateDescription.mockResolvedValue(undefined);
      const query = configurationQuery({ issueNumber: 999 });

      await handler.internalUpdate(query, 'j');

      expect(mockGetDescription).toHaveBeenCalledWith('o', 'r', 999, 't');
    });

    it('fails when updateContent cannot safely update an existing block', async () => {
      mockGetDescription.mockResolvedValue('only start<!-- copilot-test-block-start');
      const query = configurationQuery();

      await expect(handler.internalUpdate(query, 'content'))
        .rejects.toThrow('Issue content markers are missing or inconsistent.');
      expect(mockUpdateDescription).not.toHaveBeenCalled();
    });

    it('throws when getDescription rejects', async () => {
      mockGetDescription.mockRejectedValue(new Error('network error'));
      const query = configurationQuery();

      await expect(handler.internalUpdate(query, 'x')).rejects.toThrow('network error');
    });
  });
});
