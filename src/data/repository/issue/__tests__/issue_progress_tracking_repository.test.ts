import type { IssueDescriptionQueryPort } from '../../../../application/ports/issue_description_ports';
import type { IssueLabelsPort, IssueProgressPort } from '../../../../application/ports/issue_management_ports';
import { IssueProgressTrackingRepository } from '../issue_progress_tracking_repository';

describe('IssueProgressTrackingRepository', () => {
    it('composes description, label, and progress capabilities through narrow ports', async () => {
        const content: Pick<IssueDescriptionQueryPort, 'getDescription'> = {
            getDescription: jest.fn().mockResolvedValue('description'),
        };
        const labels: Pick<IssueLabelsPort, 'getLabels' | 'setLabels'> = {
            getLabels: jest.fn().mockResolvedValue(['bug']),
            setLabels: jest.fn().mockResolvedValue(undefined),
        };
        const progress: Pick<IssueProgressPort, 'setProgressLabel'> = {
            setProgressLabel: jest.fn().mockResolvedValue(undefined),
        };
        const repository = new IssueProgressTrackingRepository(content, labels, progress);

        await expect(repository.getDescription('owner', 'repo', 7, 'token')).resolves.toBe('description');
        await expect(repository.getLabels('owner', 'repo', 7, 'token')).resolves.toEqual(['bug']);
        await repository.setLabels('owner', 'repo', 7, ['bug', 'urgent'], 'token');
        await repository.setProgressLabel('owner', 'repo', 7, 50, 'token');

        expect(labels.setLabels).toHaveBeenCalledWith('owner', 'repo', 7, ['bug', 'urgent'], 'token');
        expect(progress.setProgressLabel).toHaveBeenCalledWith('owner', 'repo', 7, 50, 'token');
    });
});
