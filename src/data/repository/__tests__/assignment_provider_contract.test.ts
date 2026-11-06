import { OrganizationMembersRepository } from '../organization/organization_members_repository';
import { IssueAssignmentRepository } from '../issue/issue_assignment_repository';
import type { GithubOrganizationMembersClient } from '../../../infrastructure/github/ports/github_identity_provider_ports';
import type { GithubIssueAssignmentClient } from '../../../infrastructure/github/ports/github_issue_provider_ports';

jest.mock('../../../utils/logger', () => ({ logDebugInfo: jest.fn() }));

function membership(data: unknown, memberPage = false, fail = false) {
    const iterator = async function* (_method: unknown, params: { team_slug?: string }) {
        if (!memberPage || params.team_slug) {
            if (fail) throw { status: 403, message: 'private-token' };
            yield { data };
        } else yield { data: [{ slug: 'core' }] };
    };
    const client = { paginate: { iterator }, rest: { teams: { list: jest.fn(), listMembersInOrg: jest.fn() } } } as unknown as GithubOrganizationMembersClient;
    return new OrganizationMembersRepository({ getClient: () => client });
}

describe('assignment native provider contracts', () => {
    it.each([null, {}, 'private-token', [null], [[]], [{ slug: 17 }], [{ slug: ' ' }]])('rejects malformed teams instead of filtering them into an empty result (%j)', async data => {
        await expect(membership(data).getAllMembers('private-org', 'private-token')).rejects.toMatchObject({ code: 'provider.contract-invalid', operation: 'list-teams' });
    });

    it.each([null, {}, [null], [[]], [{ login: 17 }], [{ login: ' ' }]])('rejects malformed member pages after a valid team lookup (%j)', async data => {
        await expect(membership(data, true).getAllMembers('private-org', 'private-token')).rejects.toMatchObject({ code: 'provider.contract-invalid', operation: 'list-team-members' });
    });

    it('keeps the team-member operation when the awaited collection rejects after the initial read', async () => {
        await expect(membership([], true, true).getAllMembers('private-org', 'private-token')).rejects.toMatchObject({ code: 'authorization.denied', operation: 'list-team-members', providerStatus: 'http-403' });
    });

    it('keeps the same typed lookup diagnostic during random-member selection', async () => {
        await expect(membership([], true, true).getRandomMembers('private-org', 1, [], 'private-token')).rejects.toMatchObject({ code: 'authorization.denied', operation: 'list-team-members' });
    });

    it('sanitizes client initialization before membership queries', async () => {
        const repository = new OrganizationMembersRepository({ getClient: () => { throw { status: 401, message: 'private-token' }; } });
        await expect(repository.getAllMembers('private-org', 'private-token')).rejects.toMatchObject({ code: 'authorization.credential-invalid', operation: 'initialize-client' });
    });

    it.each([null, [], {}, { assignees: 'private-token' }, { assignees: [null] }, { assignees: ['private-token'] }, { assignees: [{ login: 4 }] }, { assignees: [{ login: ' ' }] }, { assignees: Array(11).fill({ login: 'alice' }) }])('validates assignment read/write responses (%j)', async data => {
        const client = { rest: { issues: { get: async () => ({ data }), addAssignees: async () => ({ data }) } } } as unknown as GithubIssueAssignmentClient;
        const repository = new IssueAssignmentRepository({ getClient: () => client });
        if (data && !Array.isArray(data) && Object.keys(data).length === 0) {
            await expect(repository.getCurrentAssignees('o', 'r', 1, 't')).resolves.toEqual([]);
            return;
        }
        await expect(repository.getCurrentAssignees('o', 'r', 1, 't')).rejects.toMatchObject({ code: 'provider.contract-invalid', operation: 'read-assignees' });
        await expect(repository.assignMembersToIssue('o', 'r', 1, ['alice'], 't')).rejects.toMatchObject({ code: 'provider.contract-invalid', operation: 'add-assignees' });
    });

    it('skips empty writes before acquiring a client and maps client failure for actual work', async () => {
        const getClient = jest.fn(() => { throw { status: 401 }; });
        const repository = new IssueAssignmentRepository({ getClient });
        await expect(repository.assignMembersToIssue('o', 'r', 1, [], 't')).resolves.toEqual([]);
        expect(getClient).not.toHaveBeenCalled();
        await expect(repository.getCurrentAssignees('o', 'r', 1, 't')).rejects.toMatchObject({ operation: 'initialize-client', code: 'authorization.credential-invalid' });
        await expect(repository.assignMembersToIssue('o', 'r', 1, ['alice'], 't')).rejects.toMatchObject({ operation: 'initialize-client', code: 'authorization.credential-invalid' });
    });

    it.each([null, undefined, 'private-token'])('rejects malformed response envelopes with a contract diagnostic (%j)', async envelope => {
        const client = { rest: { issues: { get: async () => envelope, addAssignees: async () => envelope } } } as unknown as GithubIssueAssignmentClient;
        const repository = new IssueAssignmentRepository({ getClient: () => client });
        await expect(repository.getCurrentAssignees('o', 'r', 1, 't')).rejects.toMatchObject({ code: 'provider.contract-invalid', operation: 'read-assignees' });
        await expect(repository.assignMembersToIssue('o', 'r', 1, ['alice'], 't')).rejects.toMatchObject({ code: 'provider.contract-invalid', operation: 'add-assignees' });
    });

    it.each([false, true])('rejects a null paginated response envelope (member lookup %s)', async members => {
        const iterator = async function* (_method: unknown, params: { team_slug?: string }) {
            if (members && !params.team_slug) yield { data: [{ slug: 'core' }] };
            else yield null;
        };
        const client = { paginate: { iterator }, rest: { teams: { list: jest.fn(), listMembersInOrg: jest.fn() } } } as unknown as GithubOrganizationMembersClient;
        await expect(new OrganizationMembersRepository({ getClient: () => client }).getAllMembers('o', 't')).rejects.toMatchObject({
            code: 'provider.contract-invalid', operation: members ? 'list-team-members' : 'list-teams' });
    });

    it('distinguishes valid empty teams and no available members from a failed read', async () => {
        await expect(membership([]).getRandomMembers('o', 1, [], 't')).resolves.toEqual([]);
        await expect(membership([{ login: 'alice' }], true).getRandomMembers('o', 1, ['alice'], 't')).resolves.toEqual([]);
    });
});
