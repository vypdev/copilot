import type { GithubClientPort } from '../../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubIssueTitleClient } from '../../../../infrastructure/github/ports/github_issue_provider_ports';
import { Labels } from '../../../model/labels';
import type { IssueMetadataRepository } from '../issue_metadata_repository';
import { IssueTitleRepository } from '../issue_title_repository';

jest.mock('../../../../utils/logger', () => ({
    logDebugInfo: jest.fn(),
    logError: jest.fn(),
}));

function createLabels(): Labels {
    return new Labels(
        'launch', 'bug', 'bugfix', 'hotfix', 'enhancement', 'feature', 'release',
        'question', 'help', 'deploy', 'deployed', 'docs', 'documentation', 'chore', 'maintenance',
        'priority/high', 'priority/medium', 'priority/low', 'priority/none',
        'size/xxl', 'size/xl', 'size/l', 'size/m', 'size/s', 'size/xs',
    );
}

describe('IssueTitleRepository', () => {
    const update = jest.fn();
    const client: GithubClientPort<GithubIssueTitleClient> = {
        getClient: jest.fn(() => ({ rest: { issues: { update } } })),
    };
    const metadataRepository = { getTitle: jest.fn() };
    const repository = new IssueTitleRepository(
        client,
        metadataRepository as unknown as IssueMetadataRepository,
    );

    beforeEach(() => {
        update.mockReset();
        (client.getClient as jest.Mock).mockClear();
    });

    it('formats and updates an issue title with its version and label emoji', async () => {
        const labels = createLabels();
        labels.currentIssueLabels = [labels.feature];

        await expect(repository.updateTitleIssueFormat(
            'owner', 'repo', '1.2.3', 'Add login', 42, false, '✨', labels, 'token',
        )).resolves.toBe('✨ - 1.2.3 - Add login');

        expect(update).toHaveBeenCalledWith({
            owner: 'owner', repo: 'repo', issue_number: 42, title: '✨ - 1.2.3 - Add login',
        });
        expect(client.getClient).toHaveBeenCalledWith('token');
    });

    it('does not call GitHub when the formatted title is unchanged', async () => {
        const labels = createLabels();
        labels.currentIssueLabels = [labels.feature];

        await expect(repository.updateTitleIssueFormat(
            'owner', 'repo', '', '✨ - Add login', 42, false, '✨', labels, 'token',
        )).resolves.toBeUndefined();

        expect(update).not.toHaveBeenCalled();
        expect(client.getClient).not.toHaveBeenCalled();
    });

    it('formats pull request titles using the issue number and sanitized issue title', async () => {
        const labels = createLabels();
        labels.currentIssueLabels = [labels.bug];

        await expect(repository.updateTitlePullRequestFormat(
            'owner', 'repo', 'old PR title', 'Fix 1.2.3!', 42, 99, false, '', labels, 'token',
        )).resolves.toBe('[#42] 🐛 - Fix 123');

        expect(update).toHaveBeenCalledWith({
            owner: 'owner', repo: 'repo', issue_number: 99, title: '[#42] 🐛 - Fix 123',
        });
    });

    it('cleans a pull request title without updating when no characters change', async () => {
        await expect(repository.cleanTitle(
            'owner', 'repo', 'Already clean', 99, 'token',
        )).resolves.toBeUndefined();

        expect(update).not.toHaveBeenCalled();
    });

    it('propagates GitHub errors so the use case can handle them', async () => {
        const error = new Error('GitHub unavailable');
        update.mockRejectedValueOnce(error);
        const labels = createLabels();

        await expect(repository.updateTitleIssueFormat(
            'owner', 'repo', '', 'New title', 42, false, '', labels, 'token',
        )).rejects.toBe(error);
    });
});
