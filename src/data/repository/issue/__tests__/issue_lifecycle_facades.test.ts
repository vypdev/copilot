import type { IssueClosurePort, IssueNotificationPort } from '../../../../application/ports/issue_lifecycle_ports';
import { IssueClosureRepository } from '../issue_closure_repository';
import { IssueNotificationRepository } from '../issue_notification_repository';

describe('issue lifecycle facades', () => {
    it('forwards notification capabilities through their narrow ports', async () => {
        const lifecycle: Pick<IssueNotificationPort, 'openIssue'> = { openIssue: jest.fn().mockResolvedValue(true) };
        const content: Pick<IssueNotificationPort, 'addComment'> = { addComment: jest.fn().mockResolvedValue(undefined) };
        const repository = new IssueNotificationRepository(lifecycle, content);

        await expect(repository.openIssue('owner', 'repo', 7, 'token')).resolves.toBe(true);
        await repository.addComment('owner', 'repo', 7, 'comment', 'token');

        expect(lifecycle.openIssue).toHaveBeenCalledWith('owner', 'repo', 7, 'token');
        expect(content.addComment).toHaveBeenCalledWith('owner', 'repo', 7, 'comment', 'token');
    });

    it('forwards closure capabilities through their narrow ports', async () => {
        const lifecycle: Pick<IssueClosurePort, 'closeIssue'> = { closeIssue: jest.fn().mockResolvedValue(true) };
        const content: Pick<IssueClosurePort, 'addComment'> = { addComment: jest.fn().mockResolvedValue(undefined) };
        const repository = new IssueClosureRepository(lifecycle, content);

        await expect(repository.closeIssue('owner', 'repo', 7, 'token')).resolves.toBe(true);
        await repository.addComment('owner', 'repo', 7, 'closed', 'token');

        expect(lifecycle.closeIssue).toHaveBeenCalledWith('owner', 'repo', 7, 'token');
        expect(content.addComment).toHaveBeenCalledWith('owner', 'repo', 7, 'closed', 'token');
    });
});
