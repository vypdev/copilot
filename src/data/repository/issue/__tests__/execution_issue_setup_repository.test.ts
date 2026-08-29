import type { ExecutionIssueSetupPort } from '../../../../application/ports/execution_setup_ports';
import { ExecutionIssueSetupRepository } from '../execution_issue_setup_repository';

describe('ExecutionIssueSetupRepository', () => {
    it('composes setup capabilities without depending on concrete repositories', async () => {
        const metadata: Pick<ExecutionIssueSetupPort, 'isPullRequest' | 'isIssue' | 'getHeadBranch'> = {
            isPullRequest: jest.fn().mockResolvedValue(true),
            isIssue: jest.fn().mockResolvedValue(false),
            getHeadBranch: jest.fn().mockResolvedValue('feature/7'),
        };
        const content: Pick<ExecutionIssueSetupPort, 'getDescription' | 'updateDescription'> = {
            getDescription: jest.fn().mockResolvedValue('description'),
            updateDescription: jest.fn().mockResolvedValue(undefined),
        };
        const labels: Pick<ExecutionIssueSetupPort, 'getLabels'> = {
            getLabels: jest.fn().mockResolvedValue(['bug']),
        };
        const repository = new ExecutionIssueSetupRepository(metadata, content, labels);

        await expect(repository.isPullRequest('owner', 'repo', 7, 'token')).resolves.toBe(true);
        await expect(repository.isIssue('owner', 'repo', 7, 'token')).resolves.toBe(false);
        await expect(repository.getHeadBranch('owner', 'repo', 7, 'token')).resolves.toBe('feature/7');
        await expect(repository.getLabels('owner', 'repo', 7, 'token')).resolves.toEqual(['bug']);
        await expect(repository.getDescription('owner', 'repo', 7, 'token')).resolves.toBe('description');
        await repository.updateDescription('owner', 'repo', 7, 'updated', 'token');

        expect(metadata.getHeadBranch).toHaveBeenCalledWith('owner', 'repo', 7, 'token');
        expect(content.updateDescription).toHaveBeenCalledWith('owner', 'repo', 7, 'updated', 'token');
    });
});
