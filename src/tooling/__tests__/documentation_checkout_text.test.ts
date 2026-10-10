const { normalizeDocumentationPath, normalizeDocumentationText } = require('../../../scripts/documentation_checkout_text.cjs') as {
    normalizeDocumentationPath(value: string): string;
    normalizeDocumentationText(value: string): string;
};

describe('documentation checkout normalization', () => {
    it('maps Windows and Unix relative page paths to the same route key', () => {
        expect(normalizeDocumentationPath('issues\\type\\feature.mdx')).toBe('issues/type/feature.mdx');
        expect(normalizeDocumentationPath('issues/type/feature.mdx')).toBe('issues/type/feature.mdx');
    });

    it('treats only CRLF as an equivalent line ending', () => {
        expect(normalizeDocumentationText('---\r\ntitle: Setup\r\n---\r\n'))
            .toBe('---\ntitle: Setup\n---\n');
        expect(normalizeDocumentationText('changed\r\n')).not.toBe('original\n');
        expect(normalizeDocumentationText('line\rnext')).toBe('line\rnext');
    });
});
