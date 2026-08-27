import { Labels } from '../../model/labels';
import { SizeThreshold } from '../../model/size_threshold';
import { SizeThresholds } from '../../model/size_thresholds';
import { classifyChangeSize } from '../branch_change_size_policy';

const labels = new Labels(
    'launch', 'bug', 'bugfix', 'hotfix', 'enhancement', 'feature', 'release',
    'question', 'help', 'deploy', 'deployed', 'docs', 'documentation', 'chore', 'maintenance',
    'high', 'medium', 'low', 'none', 'XXL', 'XL', 'L', 'M', 'S', 'XS',
);

const thresholds = new SizeThresholds(
    new SizeThreshold(1000, 100, 50),
    new SizeThreshold(500, 50, 25),
    new SizeThreshold(200, 25, 15),
    new SizeThreshold(100, 10, 10),
    new SizeThreshold(50, 5, 5),
    new SizeThreshold(0, 0, 0),
);

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
