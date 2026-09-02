import { IssueTypeRepository } from '../issue/issue_type_repository';
import { OctokitGraphqlTransportClientAdapter } from '../../../infrastructure/github/octokit_project_adapters';
import { IssueTypes } from '../../model/issue_types';

const mockGraphql = jest.fn();

jest.mock('../../../utils/logger', () => ({
    logError: jest.fn(),
}));

jest.mock('@actions/github', () => ({
    getOctokit: jest.fn(() => ({ graphql: (...args: unknown[]) => mockGraphql(...args) })),
}));

describe('IssueTypeRepository', () => {
    beforeEach(() => jest.clearAllMocks());

    it('reads all GraphQL pages', async () => {
        mockGraphql
            .mockResolvedValueOnce({
                organization: {
                    id: 'org-id',
                    issueTypes: {
                        nodes: [{ id: '1', name: 'Task' }],
                        pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
                    },
                },
            })
            .mockResolvedValueOnce({
                organization: {
                    id: 'org-id',
                    issueTypes: {
                        nodes: [{ id: '2', name: 'Bug' }],
                        pageInfo: { hasNextPage: false, endCursor: null },
                    },
                },
            });

        await expect(new IssueTypeRepository(new OctokitGraphqlTransportClientAdapter()).listIssueTypes('owner', 'token'))
            .resolves.toEqual([{ id: '1', name: 'Task' }, { id: '2', name: 'Bug' }]);
        expect(mockGraphql).toHaveBeenNthCalledWith(1, expect.stringContaining('first: 100'), { owner: 'owner', after: null });
        expect(mockGraphql).toHaveBeenNthCalledWith(2, expect.any(String), { owner: 'owner', after: 'cursor-1' });
    });

    it('fails clearly when GraphQL pagination omits its next cursor', async () => {
        mockGraphql.mockResolvedValue({
            organization: {
                id: 'org-id',
                issueTypes: {
                    nodes: [],
                    pageInfo: { hasNextPage: true, endCursor: null },
                },
            },
        });

        await expect(new IssueTypeRepository(new OctokitGraphqlTransportClientAdapter()).listIssueTypes('owner', 'token'))
            .rejects.toThrow('did not return a cursor');
    });

    it('fails clearly when the organization does not exist', async () => {
        mockGraphql.mockResolvedValue({ organization: null });

        await expect(new IssueTypeRepository(new OctokitGraphqlTransportClientAdapter()).listIssueTypes('missing', 'token'))
            .rejects.toThrow('Could not resolve the organization missing');
    });

    it('creates an issue type after resolving the organization id', async () => {
        mockGraphql
            .mockResolvedValueOnce({ organization: { id: 'org-id' } })
            .mockResolvedValueOnce({ createIssueType: { issueType: { id: 'type-id' } } });

        await expect(new IssueTypeRepository(new OctokitGraphqlTransportClientAdapter()).createIssueType(
            'owner', 'Bug', 'Bug description', 'ff0000', 'token',
        )).resolves.toBe('type-id');
        expect(mockGraphql).toHaveBeenNthCalledWith(2, expect.stringContaining('createIssueType'), {
            ownerId: 'org-id',
            name: 'Bug',
            description: 'Bug description',
            color: 'FF0000',
            isEnabled: true,
        });
    });

    it('fails clearly when creation cannot resolve the organization', async () => {
        mockGraphql.mockResolvedValue({ organization: null });

        await expect(new IssueTypeRepository(new OctokitGraphqlTransportClientAdapter()).createIssueType(
            'missing', 'Bug', 'description', 'ff0000', 'token',
        )).rejects.toThrow('Could not resolve the organization missing');
    });

    it('does not create an issue type that already exists', async () => {
        mockGraphql.mockResolvedValue({
            organization: {
                id: 'org-id',
                issueTypes: { nodes: [{ id: 'existing', name: 'bUg' }], pageInfo: { hasNextPage: false, endCursor: null } },
            },
        });

        await expect(new IssueTypeRepository(new OctokitGraphqlTransportClientAdapter()).ensureIssueType(
            'owner', 'BUG', 'description', 'ff0000', 'token',
        )).resolves.toEqual({ created: false, existed: true });
        expect(mockGraphql).toHaveBeenCalledTimes(1);
    });

    it('creates a missing issue type', async () => {
        mockGraphql
            .mockResolvedValueOnce({
                organization: {
                    id: 'org-id',
                    issueTypes: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
                },
            })
            .mockResolvedValueOnce({ organization: { id: 'org-id' } })
            .mockResolvedValueOnce({ createIssueType: { issueType: { id: 'created' } } });

        await expect(new IssueTypeRepository(new OctokitGraphqlTransportClientAdapter()).ensureIssueType(
            'owner', 'Feature', 'description', '00ff00', 'token',
        )).resolves.toEqual({ created: true, existed: false });
        expect(mockGraphql).toHaveBeenCalledTimes(3);
    });

    it('returns a complete summary and continues after individual type failures', async () => {
        mockGraphql.mockRejectedValue(new Error('GraphQL unavailable'));
        const issueTypes = new IssueTypes(
            'task', 'task description', 'blue',
            'bug', 'bug description', 'red',
            'feature', 'feature description', 'green',
            'documentation', 'documentation description', 'gray',
            'maintenance', 'maintenance description', 'yellow',
            'hotfix', 'hotfix description', 'orange',
            'release', 'release description', 'purple',
            'question', 'question description', 'pink',
            'help', 'help description', 'teal',
        );

        await expect(new IssueTypeRepository(new OctokitGraphqlTransportClientAdapter()).ensureIssueTypes(
            'owner', issueTypes, 'token',
        )).resolves.toMatchObject({ created: 0, existing: 0, errors: expect.arrayContaining([
            expect.stringContaining('Error creating Issue type "task"'),
        ]) });
    });

    it('rethrows an ensure error after logging it', async () => {
        mockGraphql.mockRejectedValue(new Error('GraphQL unavailable'));

        await expect(new IssueTypeRepository(new OctokitGraphqlTransportClientAdapter()).ensureIssueType(
            'owner', 'Bug', 'description', 'ff0000', 'token',
        )).rejects.toThrow('GraphQL unavailable');
    });
});
