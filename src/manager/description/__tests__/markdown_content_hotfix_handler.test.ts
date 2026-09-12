import { MarkdownContentHotfixHandler } from '../markdown_content_hotfix_handler';
import type { ExecutionConfigurationQuery } from '../../../application/ports/execution_configuration_ports';

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

function configurationQuery(overrides: Partial<ExecutionConfigurationQuery> = {}): ExecutionConfigurationQuery {
  return {
    owner: 'o',
    repository: 'r',
    token: 't',
    issueNumber: 1,
    ...overrides,
  };
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
      const query = configurationQuery();

      const result = await handler.get(query);

      expect(result).toBeUndefined();
    });

    it('returns extracted content when description has block', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithContent('## Changelog\n- fix'));
      const query = configurationQuery();

      const result = await handler.get(query);

      expect(result?.trim()).toBe('## Changelog\n- fix');
    });

    it('throws when getDescription throws', async () => {
      mockGetDescription.mockRejectedValue(new Error('api error'));
      const query = configurationQuery();

      await expect(handler.get(query)).rejects.toThrow('api error');
    });
  });

  describe('update', () => {
    it('calls internalUpdate with content and returns result', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithContent('old'));
      mockUpdateDescription.mockResolvedValue('newDesc');

      const query = configurationQuery();
      const result = await handler.update(query, '## New content');

      expect(mockUpdateDescription).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('returns undefined when internalUpdate throws', async () => {
      mockGetDescription.mockResolvedValue(descriptionWithContent('old'));
      mockUpdateDescription.mockRejectedValue(new Error('update failed'));

      const query = configurationQuery();
      const result = await handler.update(query, 'content');

      expect(result).toBeUndefined();
    });
  });
});
