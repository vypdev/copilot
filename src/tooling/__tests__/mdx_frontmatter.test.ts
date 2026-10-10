const { hasValidMdxFrontmatter } = require('../../../scripts/mdx-frontmatter.cjs') as {
    hasValidMdxFrontmatter(content: string): boolean;
};

describe('MDX frontmatter validation', () => {
    it.each(['\n', '\r\n'])('accepts complete metadata with %j line endings', (lineEnding) => {
        expect(hasValidMdxFrontmatter([
            '---', 'title: Overview', 'description: Documentation', '---', '# Overview',
        ].join(lineEnding))).toBe(true);
    });

    it.each([
        '# Missing frontmatter',
        '---\ntitle: Overview\n# Missing closing delimiter',
        '---\ndescription: Missing title\n---\n# Page',
        '---\ntitle: 42\n---\n# Page',
        '---\ntitle: [unterminated\n---\n# Page',
    ])('rejects incomplete or invalid metadata', (content) => {
        expect(hasValidMdxFrontmatter(content)).toBe(false);
    });
});
