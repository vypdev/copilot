import { BugbotIssueRepository } from '../bugbot_issue_repository';

describe('BugbotIssueRepository', () => {
    it('forwards issue comment reads and writes through semantic capabilities', async () => {
        const listIssueComments = jest.fn().mockResolvedValue([{ id: 1, body: 'comment' }]);
        const addComment = jest.fn().mockResolvedValue(undefined);
        const updateComment = jest.fn().mockResolvedValue(undefined);
        const repository = new BugbotIssueRepository({ listIssueComments, addComment, updateComment });

        await expect(repository.listIssueComments('owner', 'repo', 7, 'token')).resolves.toEqual([{ id: 1, body: 'comment' }]);
        await repository.addComment('owner', 'repo', 7, 'new', 'token');
        await repository.updateComment('owner', 'repo', 7, 1, 'updated', 'token');

        expect(listIssueComments).toHaveBeenCalledWith('owner', 'repo', 7, 'token');
        expect(addComment).toHaveBeenCalledWith('owner', 'repo', 7, 'new', 'token');
        expect(updateComment).toHaveBeenCalledWith('owner', 'repo', 7, 1, 'updated', 'token');
    });
});
