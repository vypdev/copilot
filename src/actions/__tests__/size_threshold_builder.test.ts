import { buildSizeThresholds } from '../size_threshold_builder';

describe('buildSizeThresholds', () => {
    it('builds every size threshold in order', () => {
        const thresholds = buildSizeThresholds({
            xxl: { lines: 1, files: 2, commits: 3 },
            xl: { lines: 4, files: 5, commits: 6 },
            l: { lines: 7, files: 8, commits: 9 },
            m: { lines: 10, files: 11, commits: 12 },
            s: { lines: 13, files: 14, commits: 15 },
            xs: { lines: 16, files: 17, commits: 18 },
        });

        expect(thresholds.xxl).toMatchObject({ lines: 1, files: 2, commits: 3 });
        expect(thresholds.xl).toMatchObject({ lines: 4, files: 5, commits: 6 });
        expect(thresholds.l).toMatchObject({ lines: 7, files: 8, commits: 9 });
        expect(thresholds.m).toMatchObject({ lines: 10, files: 11, commits: 12 });
        expect(thresholds.s).toMatchObject({ lines: 13, files: 14, commits: 15 });
        expect(thresholds.xs).toMatchObject({ lines: 16, files: 17, commits: 18 });
    });
});
