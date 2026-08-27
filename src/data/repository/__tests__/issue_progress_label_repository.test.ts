import { IssueProgressLabelRepository } from '../issue/issue_progress_label_repository';
import { PROGRESS_LABEL_PATTERN, progressPercentToColor } from '../../../application/policies/progress_labels';

describe('progress labels', () => {
    it('uses bounded red-yellow-green colors', () => {
        expect(progressPercentToColor(0)).toBe('b60205');
        expect(progressPercentToColor(50)).toBe('fbca04');
        expect(progressPercentToColor(100)).toBe('0e8a16');
        expect(progressPercentToColor(-10)).toBe('b60205');
        expect(progressPercentToColor(110)).toBe('0e8a16');
    });

    it('matches only percentage labels', () => {
        expect('50%').toMatch(PROGRESS_LABEL_PATTERN);
        expect('feature').not.toMatch(PROGRESS_LABEL_PATTERN);
    });

    it('replaces the current progress label and rounds progress', async () => {
        const getLabels = jest.fn().mockResolvedValue(['bug', '20%', 'priority:high']);
        const setLabels = jest.fn().mockResolvedValue(undefined);
        const repository = new IssueProgressLabelRepository({ getLabels, setLabels } as never);

        await repository.setProgressLabel('owner', 'repo', 7, 73, 'token');

        expect(setLabels).toHaveBeenCalledWith('owner', 'repo', 7, ['bug', 'priority:high', '75%'], 'token');
    });
});
