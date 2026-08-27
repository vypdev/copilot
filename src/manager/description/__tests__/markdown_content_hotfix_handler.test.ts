import { MarkdownContentHotfixHandler } from '../markdown_content_hotfix_handler';
import type { Execution } from '../../../data/model/execution';

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
}));

const mockGetDescription = jest.fn();
const mockUpdateDescription = jest.fn();


const HANDLER_START = '<!-- copilot-markdown_content_hotfix_handler-start -->';
const HANDLER_END = '<!-- copilot-markdown_content_hotfix_handler-end -->';

function descriptionWithContent(content: string): string {
  return `intro\n${HANDLER_START}\n${content}\n${HANDLER_END}\noutro`;
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
    issue: { number: 1 },
    pullRequest: { number: 0 },
    issueNumber: 1,
    ...overrides,
  } as unknown as Execution;
}

describe('MarkdownContentHotfixHandler', () => {
  let handler: MarkdownContentHotfixHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    handler = new MarkdownContentHotfixHandler({ getDescription: mockGetDescription, updateDescription: mockUpdateDescription });
  });

  describe('id and visibleContent', () => {
    it('returns markdown_content_hotfix_handler id and visibleContent true', () => {
      expect(handler.id).toBe('markdown_content_hotfix_handler');
      expect(handler.visibleContent).toBe(true);
    });
  });

  describe('get', () => {
    it('returns undefined when description has no block', async () => {
      mockGetDescription.mockResolvedValue('no block');
      const execution = minimalExecution();

      const result = await handler.get(execution);

      expect(result).toBeUndefined();
    });

    it('returns extracted content when description has block', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithContent('## Changelog\n- fix'));
      const execution = minimalExecution();

      const result = await handler.get(execution);

      expect(result?.trim()).toBe('## Changelog\n- fix');
    });

    it('throws when getDescription throws', async () => {
      mockGetDescription.mockRejectedValue(new Error('api error'));
      const execution = minimalExecution();

      await expect(handler.get(execution)).rejects.toThrow('api error');
    });
  });

  describe('update', () => {
    it('calls internalUpdate with content and returns result', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithContent('old'));
      mockUpdateDescription.mockResolvedValue('newDesc');

      const execution = minimalExecution();
      const result = await handler.update(execution, '## New content');

      expect(mockUpdateDescription).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('returns undefined when internalUpdate throws', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithContent('old'));
      mockUpdateDescription.mockRejectedValue(new Error('update failed'));

      const execution = minimalExecution();
      const result = await handler.update(execution, 'content');

      expect(result).toBeUndefined();
    });
  });
});
