import { generatedPullRequestTitle, hasConventionalPullRequestTitle } from '../pull_request_title_policy';
import { titleLabelFacts } from '../../../../test-support/title-label-facts';

describe('conventional PR title compatibility', () => {
    test.each([
        'chore: run backend OWASP audits only on manual dispatch',
        'feat(api)!: change the public contract', 'fix!: remove legacy behavior',
        'docs: conserver les accents, 日本語 and version 3.9.1',
        'custom-type: keep the consumer convention', 'FIX: retain the author casing',
        'ci(frontend/build): update checks', '改善: preserve a custom type',
    ])('recognizes an author header without rewriting its content: %s', title => {
        expect(hasConventionalPullRequestTitle(title)).toBe(true);
    });
    test.each(['plain title', '[#192] 🔧 - display title', 'fix:no space', 'fix:   ',
        'fix: title\n', 'fix: title\r', 'fix(): empty scope', ''])('rejects a non-header: %p', title => {
        expect(hasConventionalPullRequestTitle(title)).toBe(false);
    });
    test.each([
        ['isBugfix', 'fix'], ['isBug', 'fix'], ['isHotfix', 'fix'],
        ['isFeature', 'feat'], ['isEnhancement', 'feat'],
        ['isDocs', 'docs'], ['isDocumentation', 'docs'], [undefined, 'chore'],
    ] as const)('generates a conventional title for %s', (label, type) => {
        const labels = titleLabelFacts(label ? { [label]: true } : {});
        expect(generatedPullRequestTitle('🐛 - Example', 'Example', 192, labels)).toBe(`${type}: Example (#192)`);
    });
    test('preserves a conventional source issue title when generating a PR title', () => {
        const title = 'feat(api)!: preserve version 3.9.1 and punctuation';
        expect(generatedPullRequestTitle(title, 'lossy fallback', 192, titleLabelFacts())).toBe(title);
    });
    test('provides a non-empty subject for an issue containing only decoration', () => {
        expect(generatedPullRequestTitle('🔧', '', 192, titleLabelFacts())).toBe('chore: Update linked issue (#192)');
    });
    test('prioritizes a bug kind when labels overlap', () => {
        expect(generatedPullRequestTitle('Example', 'Example', 192,
            titleLabelFacts({ isBug: true, isFeature: true }))).toBe('fix: Example (#192)');
    });
    test('bounds a generated subject while retaining the semantic prefix and issue suffix', () => {
        const title = generatedPullRequestTitle('Long issue', 'A'.repeat(300), 192, titleLabelFacts());
        expect(title.length).toBeLessThanOrEqual(256);
        expect(title).toMatch(/^chore: A+ \(#192\)$/u);
    });
});
