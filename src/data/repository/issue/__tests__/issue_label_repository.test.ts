import { IssueLabelRepository } from '../issue_label_repository';
import { OctokitIssueLabelsClientAdapter } from '../../../../infrastructure/github/octokit_issue_adapters';

jest.mock('../../../../utils/logger', () => ({
    logError: jest.fn(),
    logDebugInfo: jest.fn(),
}));

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

    it('propagates non-not-found provider errors', async () => {
        mockList.mockRejectedValueOnce({ status: 403, message: 'forbidden' });

        await expect(repository.getLabels('owner', 'repo', 7, 'token')).rejects.toMatchObject({ status: 403 });
    });

    it('requires real label evidence before size mutation, including unavailable and empty resources', async () => {
        mockList.mockRejectedValueOnce({ status: 404 });
        await expect(repository.getRequiredLabels('owner', 'repo', 99, 'token')).rejects.toMatchObject({ status: 404 });
        mockList.mockResolvedValueOnce({ data: [] });
        await expect(repository.getRequiredLabels('owner', 'repo', 99, 'token')).resolves.toEqual([]);
        expect(mockSet).not.toHaveBeenCalled();
    });

    it('reads all label pages before a size mutation without dropping unrelated labels', async () => {
        mockList.mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, index) => ({ name: `label-${index}` })) })
            .mockResolvedValueOnce({ data: [{ name: 'retained-last-page' }] });
        const labels = await repository.getRequiredLabels('owner', 'repo', 99, 'token');
        expect(labels).toHaveLength(101);
        expect(labels[100]).toBe('retained-last-page');
        expect(mockList).toHaveBeenLastCalledWith({ owner: 'owner', repo: 'repo', issue_number: 99, per_page: 100, page: 2 });
    });

    it.each([null, {}, { name: 1 }, { name: ' ' }])('rejects malformed required label %p before mutation', async label => {
        mockList.mockResolvedValueOnce({ data: [label] });
        await expect(repository.getRequiredLabels('owner', 'repo', 99, 'token')).rejects.toMatchObject({ code: 'provider.contract-invalid' });
        expect(mockSet).not.toHaveBeenCalled();
    });

    it('fails closed at the fixed label pagination bound', async () => {
        mockList.mockResolvedValue({ data: Array.from({ length: 100 }, (_, index) => ({ name: `label-${index}` })) });
        await expect(repository.getRequiredLabels('owner', 'repo', 99, 'token')).rejects.toMatchObject({ code: 'provider.contract-invalid' });
        expect(mockList).toHaveBeenCalledTimes(100);
        expect(mockSet).not.toHaveBeenCalled();
        mockList.mockReset();
    });

    it('replaces issue labels', async () => {
        mockSet.mockResolvedValue(undefined);
        await repository.setLabels('owner', 'repo', 7, ['bug'], 'token');
        expect(mockSet).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', issue_number: 7, labels: ['bug'] });
    });
});
