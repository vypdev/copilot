import * as github from '@actions/github';
import { IssueLifecycleRepository } from '../issue/issue_lifecycle_repository';
import { OctokitIssueLifecycleClientAdapter } from '../../../infrastructure/github/octokit_issue_adapters';

jest.mock('@actions/github', () => ({ getOctokit: jest.fn() }));
jest.mock('../../../utils/logger', () => ({ logDebugInfo: jest.fn() }));

const mockGet = jest.fn();
const mockUpdate = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    (github.getOctokit as jest.Mock).mockReturnValue({ rest: { issues: { get: mockGet, update: mockUpdate } } });
});

describe('IssueLifecycleRepository', () => {
    it('closes an open issue and returns true', async () => {
        mockGet.mockResolvedValue({ data: { state: 'open' } });
        await expect(new IssueLifecycleRepository(new OctokitIssueLifecycleClientAdapter()).closeIssue('o', 'r', 1, 't')).resolves.toBe(true);
        expect(mockUpdate).toHaveBeenCalledWith({ owner: 'o', repo: 'r', issue_number: 1, state: 'closed' });
    });

    it('does not update an already closed issue', async () => {
        mockGet.mockResolvedValue({ data: { state: 'closed' } });
        await expect(new IssueLifecycleRepository(new OctokitIssueLifecycleClientAdapter()).closeIssue('o', 'r', 1, 't')).resolves.toBe(false);
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('opens a closed issue and does not update an open issue', async () => {
        mockGet.mockResolvedValueOnce({ data: { state: 'closed' } }).mockResolvedValueOnce({ data: { state: 'open' } });
        const repository = new IssueLifecycleRepository(new OctokitIssueLifecycleClientAdapter());
        await expect(repository.openIssue('o', 'r', 1, 't')).resolves.toBe(true);
        await expect(repository.openIssue('o', 'r', 1, 't')).resolves.toBe(false);
        expect(mockUpdate).toHaveBeenCalledWith({ owner: 'o', repo: 'r', issue_number: 1, state: 'open' });
    });

    it('propagates errors when reading issue state fails', async () => {
        const error = new Error('API error');
        mockGet.mockRejectedValue(error);
        await expect(new IssueLifecycleRepository(new OctokitIssueLifecycleClientAdapter()).closeIssue('o', 'r', 1, 't')).rejects.toThrow('API error');
    });
});
