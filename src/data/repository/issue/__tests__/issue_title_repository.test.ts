import type { GithubClientPort } from '../../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubIssueTitleClient } from '../../../../infrastructure/github/ports/github_issue_provider_ports';
import { Labels } from '../../../model/labels';
import { IssueTitleRepository } from '../issue_title_repository';

jest.mock('../../../../utils/logger', () => ({
    logDebugInfo: jest.fn(),
    logError: jest.fn(),
}));

function createLabels(): Labels {
    return new Labels(
        'bug', 'bugfix', 'hotfix', 'enhancement', 'feature', 'release',
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
    const repository = new IssueTitleRepository(client, metadataRepository);

    beforeEach(() => {
        update.mockReset();
        (client.getClient as jest.Mock).mockClear();
    });

    it('formats and updates an issue title with its version and label emoji', async () => {
        const labels = createLabels();
        labels.currentIssueLabels = [labels.feature];

        await expect(repository.updateTitleIssueFormat(
            'owner', 'repo', '1.2.3', 'Add login', 42, '✨', labels, 'token',
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
            'owner', 'repo', '', '✨ - Add login', 42, '✨', labels, 'token',
        )).resolves.toBeUndefined();

        expect(update).not.toHaveBeenCalled();
        expect(client.getClient).not.toHaveBeenCalled();
    });

    it('formats pull request titles using the issue number and sanitized issue title', async () => {
        const labels = createLabels();
        labels.currentIssueLabels = [labels.bug];

        await expect(repository.updateTitlePullRequestFormat(
            'owner', 'repo', 'old PR title', 'Fix 1.2.3!', 42, 99, '', labels, 'token',
        )).resolves.toBe('fix: Fix 123 (#42)');

        expect(update).toHaveBeenCalledWith({
            owner: 'owner', repo: 'repo', issue_number: 99, title: 'fix: Fix 123 (#42)',
        });
    });

    it('keeps repeated title updates idempotent after a generated prefix', async () => {
        const labels = createLabels();
        labels.currentIssueLabels = [labels.bug];

        await expect(repository.updateTitlePullRequestFormat(
            'owner', 'repo', '[#347] 🤖 - 347  347 Develop', '[#347] 🤖 - 347  347 Develop',
            347, 99, '', labels, 'token',
        )).resolves.toBe('fix: Develop (#347)');
    });

    it('cleans a pull request title without updating when no characters change', async () => {
        await expect(repository.cleanTitle(
            'owner', 'repo', 'Already clean', 99, 'token',
        )).resolves.toBeUndefined();

        expect(update).not.toHaveBeenCalled();
    });

    it('preserves a conventional author title without creating a GitHub mutation client', async () => {
        await expect(repository.updateTitlePullRequestFormat('owner', 'repo',
            'chore: run backend OWASP audits only on manual dispatch', '🔧 - Move backend OWASP audits',
            192, 194, '', createLabels(), 'token')).resolves.toBeUndefined();
        expect(update).not.toHaveBeenCalled();
        expect(client.getClient).not.toHaveBeenCalled();
    });

    it('does not rewrite a generated conventional title on subsequent processing', async () => {
        const labels = createLabels();
        const generated = await repository.updateTitlePullRequestFormat('owner', 'repo', 'Initial title',
            '🔧 - Update verification', 192, 194, '', labels, 'token');
        expect(generated).toBe('chore: Update verification (#192)');
        await repository.updateTitlePullRequestFormat('owner', 'repo', generated!,
            '🔧 - New issue wording', 192, 194, '', labels, 'token');
        expect(update).toHaveBeenCalledTimes(1);
    });

    it('propagates GitHub errors so the use case can handle them', async () => {
        const error = new Error('GitHub unavailable');
        update.mockRejectedValueOnce(error);
        const labels = createLabels();

        await expect(repository.updateTitleIssueFormat(
            'owner', 'repo', '', 'New title', 42, '', labels, 'token',
        )).rejects.toBe(error);
    });
});
