import {
    isSafeFindingFilePath,
    isAllowedPathForPr,
    resolveFindingPathForPr,
} from '../path_validation';

describe('path_validation', () => {
    describe('isSafeFindingFilePath', () => {
        it('returns false for undefined or null', () => {
            expect(isSafeFindingFilePath(undefined)).toBe(false);
            expect(isSafeFindingFilePath(null as unknown as string)).toBe(false);
        });

        it('returns false for empty or whitespace-only', () => {
            expect(isSafeFindingFilePath('')).toBe(false);
            expect(isSafeFindingFilePath('   ')).toBe(false);
        });

        it('returns false for path containing null byte', () => {
            expect(isSafeFindingFilePath('src/foo\x00.ts')).toBe(false);
            expect(isSafeFindingFilePath('\x00etc/passwd')).toBe(false);
        });

        it('returns false for path containing ..', () => {
            expect(isSafeFindingFilePath('../foo.ts')).toBe(false);
            expect(isSafeFindingFilePath('src/../etc/passwd')).toBe(false);
            expect(isSafeFindingFilePath('..')).toBe(false);
        });

        it('returns false for absolute paths', () => {
            expect(isSafeFindingFilePath('/etc/passwd')).toBe(false);
            expect(isSafeFindingFilePath('/src/foo.ts')).toBe(false);
            expect(isSafeFindingFilePath('C:\\Users\\file.ts')).toBe(false);
            expect(isSafeFindingFilePath('\\Windows\\path')).toBe(false);
        });

        it('returns true for relative paths without ..', () => {
            expect(isSafeFindingFilePath('src/foo.ts')).toBe(true);
            expect(isSafeFindingFilePath('lib/utils/helper.ts')).toBe(true);
            expect(isSafeFindingFilePath('file.ts')).toBe(true);
            expect(isSafeFindingFilePath('  src/bar.ts  ')).toBe(true);
        });

        it('returns false for non-string input', () => {
            expect(isSafeFindingFilePath(123 as unknown as string)).toBe(false);
            expect(isSafeFindingFilePath({} as unknown as string)).toBe(false);
        });
    });

    describe('isAllowedPathForPr', () => {
        const prFiles = [
            { filename: 'src/foo.ts', status: 'modified' },
            { filename: 'lib/bar.ts', status: 'added' },
        ];

        it('returns false when path is unsafe', () => {
            expect(isAllowedPathForPr('../../../etc/passwd', prFiles)).toBe(false);
            expect(isAllowedPathForPr('/absolute', prFiles)).toBe(false);
        });

        it('returns false when path is not in prFiles', () => {
            expect(isAllowedPathForPr('other/file.ts', prFiles)).toBe(false);
        });

        it('returns true when path is safe and in prFiles', () => {
            expect(isAllowedPathForPr('src/foo.ts', prFiles)).toBe(true);
            expect(isAllowedPathForPr('  src/foo.ts  ', prFiles)).toBe(true);
            expect(isAllowedPathForPr('lib/bar.ts', prFiles)).toBe(true);
        });

        it('returns false when prFiles is empty', () => {
            expect(isAllowedPathForPr('src/foo.ts', [])).toBe(false);
        });
    });

    describe('resolveFindingPathForPr', () => {
        const prFiles = [
            { filename: 'src/foo.ts', status: 'modified' },
            { filename: 'lib/bar.ts', status: 'added' },
        ];

        it('returns finding file when valid and in prFiles', () => {
            expect(resolveFindingPathForPr('src/foo.ts', prFiles)).toBe('src/foo.ts');
            expect(resolveFindingPathForPr('lib/bar.ts', prFiles)).toBe('lib/bar.ts');
        });

        it('returns undefined when finding file is invalid (no fallback to wrong file)', () => {
            expect(resolveFindingPathForPr('../../../etc/passwd', prFiles)).toBeUndefined();
            expect(resolveFindingPathForPr('/etc/passwd', prFiles)).toBeUndefined();
        });

        it('returns undefined when finding file is not in prFiles', () => {
            expect(resolveFindingPathForPr('other/file.ts', prFiles)).toBeUndefined();
        });

        it('returns undefined when finding file is undefined', () => {
            expect(resolveFindingPathForPr(undefined, prFiles)).toBeUndefined();
        });

        it('returns undefined when prFiles is empty', () => {
            expect(resolveFindingPathForPr('src/foo.ts', [])).toBeUndefined();
            expect(resolveFindingPathForPr(undefined, [])).toBeUndefined();
        });
    });
});
