import { classifyChangeSize } from '../branch_change_size_policy';

const labels = { xxl: 'XXL', xl: 'XL', l: 'L', m: 'M', s: 'S', xs: 'XS' };

const thresholds = {
    xxl: { lines: 1000, files: 100, commits: 50 },
    xl: { lines: 500, files: 50, commits: 25 },
    l: { lines: 200, files: 25, commits: 15 },
    m: { lines: 100, files: 10, commits: 10 },
    s: { lines: 50, files: 5, commits: 5 },
    xs: { lines: 0, files: 0, commits: 0 },
};

describe('branch change size policy', () => {
    it('selects the first threshold exceeded in priority order', () => {
        expect(classifyChangeSize({ totalChanges: 51, totalFiles: 1, totalCommits: 1 }, thresholds, labels)).toEqual({
            size: 'S',
            githubSize: 'S',
            reason: 'More than 50 lines changed',
        });
    });

    it('reports the first exceeded metric in the selected category', () => {
        expect(classifyChangeSize({ totalChanges: 1, totalFiles: 11, totalCommits: 1 }, thresholds, labels).reason)
            .toBe('More than 10 files modified');
    });

    it('returns XS for changes within all thresholds', () => {
        expect(classifyChangeSize({ totalChanges: 1, totalFiles: 1, totalCommits: 1 }, thresholds, labels)).toEqual({
            size: 'XS',
            githubSize: 'XS',
            reason: 'Small changes (1 lines, 1 files)',
        });
    });
});
