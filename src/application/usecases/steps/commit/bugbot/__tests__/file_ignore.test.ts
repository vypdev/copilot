/**
 * Unit tests for file_ignore: fileMatchesIgnorePatterns (glob-style path matching).
 */

import { fileMatchesIgnorePatterns } from '../file_ignore';

describe('fileMatchesIgnorePatterns', () => {
    it('returns false when filePath is undefined or empty', () => {
        expect(fileMatchesIgnorePatterns(undefined, ['src/**'])).toBe(false);
        expect(fileMatchesIgnorePatterns('', ['*.test.ts'])).toBe(false);
        expect(fileMatchesIgnorePatterns('   ', ['x'])).toBe(false);
    });

    it('returns false when ignorePatterns is empty', () => {
        expect(fileMatchesIgnorePatterns('src/foo.ts', [])).toBe(false);
    });

    it('matches exact path', () => {
        expect(fileMatchesIgnorePatterns('src/foo.ts', ['src/foo.ts'])).toBe(true);
        expect(fileMatchesIgnorePatterns('src/foo.ts', ['other.ts'])).toBe(false);
    });

    it('matches glob * (any characters)', () => {
        // * becomes .* so it matches across path segments
        expect(fileMatchesIgnorePatterns('src/foo.test.ts', ['*.test.ts'])).toBe(true);
        expect(fileMatchesIgnorePatterns('foo.test.ts', ['*.test.ts'])).toBe(true);
        expect(fileMatchesIgnorePatterns('bar.test.ts', ['*.test.ts'])).toBe(true);
        expect(fileMatchesIgnorePatterns('bar.spec.ts', ['*.test.ts'])).toBe(false);
    });

    it('matches pattern with path segments', () => {
        expect(fileMatchesIgnorePatterns('src/utils/helper.ts', ['src/utils/*'])).toBe(true);
        expect(fileMatchesIgnorePatterns('src/utils/helper.ts', ['src/*'])).toBe(true);
    });

    it('matches **/ style (directory prefix with /*)', () => {
        // Implementation: pattern ending with /* becomes (\/.*)? so "src/utils/*" matches "src/utils" and "src/utils/anything"
        expect(fileMatchesIgnorePatterns('src/utils/helper.ts', ['src/utils/*'])).toBe(true);
        expect(fileMatchesIgnorePatterns('src/utils/deep/helper.ts', ['src/utils/*'])).toBe(true);
    });

    it('trims file path and patterns', () => {
        expect(fileMatchesIgnorePatterns('  src/foo.ts  ', ['  src/foo.ts  '])).toBe(true);
    });

    it('returns true if any pattern matches', () => {
        expect(
            fileMatchesIgnorePatterns('src/bar.ts', ['*.test.ts', 'src/bar.ts', 'other'])
        ).toBe(true);
    });

    it('returns false if no pattern matches', () => {
        expect(
            fileMatchesIgnorePatterns('src/bar.ts', ['*.test.ts', 'build/*', 'docs/*'])
        ).toBe(false);
    });

    it('escapes regex-special chars in pattern (literal match)', () => {
        expect(fileMatchesIgnorePatterns('src/file (1).ts', ['src/file (1).ts'])).toBe(true);
        expect(fileMatchesIgnorePatterns('src/file (2).ts', ['src/file (1).ts'])).toBe(false);
    });

    it('ReDoS mitigation: long patterns are skipped (no match)', () => {
        const longPattern = 'a'.repeat(600);
        expect(fileMatchesIgnorePatterns('a', [longPattern])).toBe(false);
    });

    it('ReDoS mitigation: many consecutive * collapse to one (same as single *)', () => {
        expect(fileMatchesIgnorePatterns('src/foo.test.ts', ['*.test.ts'])).toBe(true);
        expect(fileMatchesIgnorePatterns('src/foo.test.ts', ['*********.test.ts'])).toBe(true);
    });

    it('limits number of patterns (only first 200 are used)', () => {
        const noMatch = Array.from({ length: 200 }, () => 'build/*');
        const matchingPattern = 'src/bar.ts';
        const manyPatterns = [...noMatch, matchingPattern];
        expect(fileMatchesIgnorePatterns('src/bar.ts', manyPatterns)).toBe(false);
        expect(fileMatchesIgnorePatterns('src/bar.ts', [matchingPattern])).toBe(true);
    });

    it('caches compiled regexes (same patterns used multiple times)', () => {
        const patterns = ['*.test.ts', 'build/*'];
        expect(fileMatchesIgnorePatterns('src/foo.test.ts', patterns)).toBe(true);
        expect(fileMatchesIgnorePatterns('src/other.test.ts', patterns)).toBe(true);
        expect(fileMatchesIgnorePatterns('build/out.js', patterns)).toBe(true);
        expect(fileMatchesIgnorePatterns('src/foo.ts', patterns)).toBe(false);
    });

    it('skips empty and whitespace-only patterns', () => {
        const patterns = ['', '   ', '\t', '*.test.ts'];
        expect(fileMatchesIgnorePatterns('src/foo.test.ts', patterns)).toBe(true);
        expect(fileMatchesIgnorePatterns('src/foo.ts', patterns)).toBe(false);
    });

    it('matches when valid pattern is in list with long (skipped) patterns', () => {
        const longPattern = 'a'.repeat(600);
        const patterns = [longPattern, '*.test.ts', longPattern];
        expect(fileMatchesIgnorePatterns('src/foo.test.ts', patterns)).toBe(true);
        expect(fileMatchesIgnorePatterns('src/foo.ts', patterns)).toBe(false);
    });

    it('matches when the 200th pattern (last in limit) matches', () => {
        const noMatch = Array.from({ length: 199 }, () => 'build/*');
        const matchingPattern = 'src/last.ts';
        const patterns = [...noMatch, matchingPattern];
        expect(fileMatchesIgnorePatterns('src/last.ts', patterns)).toBe(true);
        expect(fileMatchesIgnorePatterns('src/other.ts', patterns)).toBe(false);
    });

    it('matches path when pattern has directory suffix /*', () => {
        expect(fileMatchesIgnorePatterns('src/utils', ['src/utils/*'])).toBe(true);
        expect(fileMatchesIgnorePatterns('src/utils/', ['src/utils/*'])).toBe(true);
    });
});
