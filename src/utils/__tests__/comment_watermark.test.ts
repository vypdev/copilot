import { stripTrailingCommentWatermarks } from '../comment_watermark';

describe('legacy comment watermark migration', () => {
  it.each([
    '<sup>Made with ❤️ by [vypdev/copilot](https://github.com/marketplace/actions/copilot-github-with-super-powers)</sup>',
    '<sup>Written by [vypdev/copilot](https://github.com/marketplace/actions/copilot-github-with-super-powers) for commit [abc123](https://github.com/o/r/commit/abc123). This will update automatically on new commits.</sup>',
  ])('strips a legacy trailing watermark without changing visible content', (watermark) => {
    expect(stripTrailingCommentWatermarks(`Useful status\n\n${watermark}`)).toBe('Useful status');
  });

  it('leaves ordinary content and non-trailing legacy text intact', () => {
    expect(stripTrailingCommentWatermarks('Useful status')).toBe('Useful status');
    expect(stripTrailingCommentWatermarks('<sup>Made with ❤️ by someone else</sup>')).toContain('someone else');
  });
});
