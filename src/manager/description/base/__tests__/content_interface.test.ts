import { ContentInterface } from '../content_interface';

jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn(),
}));

/** Concrete implementation for testing the abstract ContentInterface. */
class TestContent extends ContentInterface {
  constructor(
    public readonly testId: string,
    public readonly testVisible: boolean,
  ) {
    super();
  }
  get id(): string {
    return this.testId;
  }
  get visibleContent(): boolean {
    return this.testVisible;
  }
}

describe('ContentInterface', () => {
  describe('visibleContent: true (HTML comment style)', () => {
    const handler = new TestContent('foo', true);
    const start = '<!-- copilot-foo-start -->';
    const end = '<!-- copilot-foo-end -->';

    describe('getContent', () => {
      it('returns undefined when description is undefined', () => {
        expect(handler.getContent(undefined)).toBeUndefined();
      });

      it('returns undefined when start pattern is missing', () => {
        const desc = `pre\n${end}\npost`;
        expect(handler.getContent(desc)).toBeUndefined();
      });

      it('returns undefined when end pattern is missing', () => {
        const desc = `pre\n${start}\nmid`;
        expect(handler.getContent(desc)).toBeUndefined();
      });

      it('returns content between start and end patterns', () => {
        const desc = `pre\n${start}\ninner\n${end}\npost`;
        expect(handler.getContent(desc)).toBe('\ninner\n');
      });

      it('returns first block when multiple blocks exist', () => {
        const desc = `${start}\nfirst\n${end}\n${start}\nsecond\n${end}`;
        expect(handler.getContent(desc)).toBe('\nfirst\n');
      });

      it('returns undefined when only start tag is present', () => {
        const desc = `pre\n${start}\norphan`;
        expect(handler.getContent(desc)).toBeUndefined();
      });

      it('logs and rethrows when extraction throws', () => {
        const desc = `pre\n${start}\ninner\n${end}\npost`;
        const originalIndexOf = String.prototype.indexOf;
        (jest.spyOn(String.prototype, 'indexOf') as jest.Mock).mockImplementation(
          function (this: string, searchString: string, position?: number) {
            if (searchString === start) {
              throw new Error('indexOf failed');
            }
            return (originalIndexOf as (searchString: string, position?: number) => number).call(
              this,
              searchString,
              position,
            );
          },
        );
        const { logError } = require('../../../../utils/logger');

        expect(() => handler.getContent(desc)).toThrow('indexOf failed');
        expect(logError).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'configuration.invalid',
            message: 'Unable to read issue configuration.',
          }),
        );

        (String.prototype.indexOf as jest.Mock).mockRestore();
      });
    });

    describe('updateContent', () => {
      it('returns undefined when description is undefined', () => {
        expect(handler.updateContent(undefined, 'x')).toBeUndefined();
      });

      it('returns undefined when content is undefined', () => {
        expect(handler.updateContent('body', undefined)).toBeUndefined();
      });

      it('appends new block when no existing block', () => {
        const desc = 'some body';
        const result = handler.updateContent(desc, 'new');
        expect(result).toBe(`some body\n\n${start}\nnew\n${end}`);
      });

      it('replaces existing block when block exists', () => {
        const desc = `pre\n${start}\nold\n${end}\npost`;
        const result = handler.updateContent(desc, 'new');
        expect(result).toBe(`pre\n${start}\nnew\n${end}\npost`);
      });

      it('returns undefined when only start tag exists (cannot add, update fails)', () => {
        const desc = `pre\n${start}\norphan`;
        const result = handler.updateContent(desc, 'new');
        expect(result).toBeUndefined();
      });

      it('logs and returns undefined when update throws', () => {
        const desc = `pre\n${start}\nold\n${end}\npost`;
        const originalIndexOf = String.prototype.indexOf;
        (jest.spyOn(String.prototype, 'indexOf') as jest.Mock).mockImplementation(
          function (this: string, searchString: string, position?: number) {
            if (searchString === start) {
              throw new Error('indexOf failed');
            }
            return (originalIndexOf as (searchString: string, position?: number) => number).call(
              this,
              searchString,
              position,
            );
          },
        );
        const { logError } = require('../../../../utils/logger');

        const result = handler.updateContent(desc, 'new');

        expect(result).toBeUndefined();
        expect(logError).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'provider.unavailable',
            message: 'Unable to update the issue description.',
          }),
        );

        (String.prototype.indexOf as jest.Mock).mockRestore();
      });
    });
  });

  describe('visibleContent: false (hidden comment style)', () => {
    const handler = new TestContent('config', false);
    const start = '<!-- copilot-config-start';
    const end = 'copilot-config-end -->';

    describe('getContent', () => {
      it('returns undefined when description is undefined', () => {
        expect(handler.getContent(undefined)).toBeUndefined();
      });

      it('returns undefined when start pattern is missing', () => {
        expect(handler.getContent(`pre\n${end}\npost`)).toBeUndefined();
      });

      it('returns undefined when end pattern is missing', () => {
        expect(handler.getContent(`pre\n${start}\nmid`)).toBeUndefined();
      });

      it('returns content between start and end patterns', () => {
        const desc = `pre\n${start}\n{"x":1}\n${end}\npost`;
        expect(handler.getContent(desc)).toBe('\n{"x":1}\n');
      });

      it('returns content cleanly when there is noisy HTML before and after', () => {
        const desc = `Some text\n<div>\n${start}\n{"valid":"true"}\n${end}\n</div>\nMore text`;
        expect(handler.getContent(desc)).toBe('\n{"valid":"true"}\n');
      });

      it('returns empty string when there is no content between tags', () => {
        const desc = `pre\n${start}${end}\npost`;
        expect(handler.getContent(desc)).toBe('');
      });

      it('returns undefined when tags are inverted (end appears before start)', () => {
        const desc = `pre\n${end}\nsome content\n${start}\npost`;
        expect(handler.getContent(desc)).toBeUndefined();
      });

      it('returns undefined for an empty description string', () => {
        expect(handler.getContent('')).toBeUndefined();
      });
    });

    describe('updateContent', () => {
      it('appends new block when no existing block', () => {
        const desc = 'body';
        const result = handler.updateContent(desc, 'data');
        expect(result).toBe(`body\n\n${start}\ndata\n${end}`);
      });

      it('replaces existing block when block exists', () => {
        const desc = `pre\n${start}\nold\n${end}\npost`;
        const result = handler.updateContent(desc, 'new');
        expect(result).toBe(`pre\n${start}\nnew\n${end}\npost`);
      });

      it('safely handles multiple start tags', () => {
        const desc = `pre\n${start}\n${start}\nold\n${end}\npost`;
        const result = handler.updateContent(desc, 'new');
        expect(result).toBe(`pre\n${start}\nnew\n${end}\npost`);
      });

      it('replaces only the first block when multiple blocks exist', () => {
        const desc = `pre\n${start}\nold1\n${end}\npost\n${start}\nold2\n${end}`;
        const result = handler.updateContent(desc, 'new');
        expect(result).toBe(`pre\n${start}\nnew\n${end}\npost\n${start}\nold2\n${end}`);
      });

      it('maintains HTML formatting around the block when updated', () => {
        const desc = `<h1>Summary</h1>\n<p>description</p>\n${start}\n{"old":true}\n${end}\n<footer>bye</footer>`;
        const result = handler.updateContent(desc, '{"new":true}');
        expect(result).toBe(`<h1>Summary</h1>\n<p>description</p>\n${start}\n{"new":true}\n${end}\n<footer>bye</footer>`);
      });

      it('handles descriptions with Windows CRLF line endings', () => {
        const desc = `pre\r\n${start}\r\nold\r\n${end}\r\npost`;
        const result = handler.updateContent(desc, 'new');
        expect(result).toBe(`pre\r\n${start}\nnew\n${end}\r\npost`);
      });

      it('returns undefined when description is empty string (should append)', () => {
        const desc = '';
        const result = handler.updateContent(desc, 'new');
        expect(result).toBe(`\n\n${start}\nnew\n${end}`);
      });

      it('correctly updates even when substituting with empty content', () => {
        const desc = `pre\n${start}\nold\n${end}\npost`;
        const result = handler.updateContent(desc, '');
        expect(result).toBe(`pre\n${start}\n\n${end}\npost`);
      });

      it('correctly updates when new content contains tag-like strings', () => {
        const desc = `pre\n${start}\nold\n${end}\npost`;
        const tagLikeContent = `{"fakeStart": "${start}"}`;
        const result = handler.updateContent(desc, tagLikeContent);
        expect(result).toBe(`pre\n${start}\n${tagLikeContent}\n${end}\npost`);
      });
    });
  });
});
