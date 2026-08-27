import { IssueLabelRepository } from '../issue_label_repository';
import { OctokitIssueLabelsClientAdapter } from '../../../../infrastructure/github/octokit_issue_adapters';

const mockList = jest.fn();
const mockSet = jest.fn();
jest.mock('@actions/github', () => ({
    getOctokit: () => ({ rest: { issues: { listLabelsOnIssue: mockList, setLabels: mockSet } } }),
}));

describe('IssueLabelRepository', () => {
    const repository = new IssueLabelRepository(new OctokitIssueLabelsClientAdapter());
    beforeEach(() => jest.clearAllMocks());

    it('reads label names and handles not found', async () => {
        mockList.mockResolvedValueOnce({ data: [{ name: 'bug' }, { name: 'priority:high' }] });
        await expect(repository.getLabels('owner', 'repo', 7, 'token')).resolves.toEqual(['bug', 'priority:high']);
        mockList.mockRejectedValueOnce({ status: 404 });
        await expect(repository.getLabels('owner', 'repo', 7, 'token')).resolves.toEqual([]);
    });

    it('replaces issue labels', async () => {
        mockSet.mockResolvedValue(undefined);
        await repository.setLabels('owner', 'repo', 7, ['bug'], 'token');
        expect(mockSet).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', issue_number: 7, labels: ['bug'] });
    });
});
