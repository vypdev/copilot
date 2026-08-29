import * as github from '@actions/github';
import { IssueAssignmentRepository } from '../issue/issue_assignment_repository';
import { OctokitIssueAssignmentClientAdapter } from '../../../infrastructure/github/octokit_issue_adapters';

jest.mock('@actions/github', () => ({ getOctokit: jest.fn() }));
jest.mock('../../../utils/logger', () => ({ logDebugInfo: jest.fn(), logError: jest.fn() }));

const mockGet = jest.fn();
const mockAddAssignees = jest.fn();

beforeEach(() => {
    jest.clearAllMocks();
    (github.getOctokit as jest.Mock).mockReturnValue({ rest: { issues: { get: mockGet, addAssignees: mockAddAssignees } } });
});

describe('IssueAssignmentRepository', () => {
    it('returns current assignee logins', async () => {
        mockGet.mockResolvedValue({ data: { assignees: [{ login: 'alice' }, { login: 'bob' }] } });
        await expect(new IssueAssignmentRepository(new OctokitIssueAssignmentClientAdapter()).getCurrentAssignees('o', 'r', 1, 't')).resolves.toEqual(['alice', 'bob']);
    });

    it('returns an empty list for missing assignees and propagates API errors', async () => {
        mockGet.mockResolvedValueOnce({ data: { assignees: null } }).mockRejectedValueOnce(new Error('API error'));
        const repository = new IssueAssignmentRepository(new OctokitIssueAssignmentClientAdapter());
        await expect(repository.getCurrentAssignees('o', 'r', 1, 't')).resolves.toEqual([]);
        await expect(repository.getCurrentAssignees('o', 'r', 1, 't')).rejects.toThrow('API error');
    });

    it('skips empty assignments and maps updated assignees', async () => {
        const repository = new IssueAssignmentRepository(new OctokitIssueAssignmentClientAdapter());
        await expect(repository.assignMembersToIssue('o', 'r', 1, [], 't')).resolves.toEqual([]);
        mockAddAssignees.mockResolvedValue({ data: { assignees: [{ login: 'alice' }] } });
        await expect(repository.assignMembersToIssue('o', 'r', 1, ['alice'], 't')).resolves.toEqual(['alice']);
        expect(mockAddAssignees).toHaveBeenCalledWith({ owner: 'o', repo: 'r', issue_number: 1, assignees: ['alice'] });
    });
});
