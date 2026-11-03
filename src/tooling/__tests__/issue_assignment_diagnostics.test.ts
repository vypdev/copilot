import { OrganizationMembersRepository } from '../../data/repository/organization/organization_members_repository';
import { AssignMemberToIssueUseCase } from '../../application/usecases/steps/issue/assign_members_to_issue_use_case';
import { renderApplicationErrorText } from '../../application/policies/application_error_presentation_policy';
import type { GithubOrganizationMembersClient } from '../../infrastructure/github/ports/github_identity_provider_ports';
import { AssignmentProviderError } from '../../application/ports/assignment_provider_error';
import { ApplicationError } from '../../application/errors/application_error';
import { issueAssignmentFailure } from '../../application/errors/issue_assignment_failure';
import { Result } from '../../data/model/result';
import { runIssueWorkflow, type IssueWorkflowPorts, type IssueWorkflowRouteContext } from '../../application/usecases/issue_workflow';

jest.mock('../../utils/logger', () => ({ logInfo: jest.fn(), logDebugInfo: jest.fn(), logError: jest.fn() }));

const request = { target: 'issue' as const, number: 17, desiredAssigneesCount: 1, creator: 'alice' };

function failingMembership(cause: unknown) {
    const iterator = async function* () { yield { data: [] }; throw cause; };
    const client = { paginate: { iterator }, rest: { teams: { list: jest.fn(), listMembersInOrg: jest.fn() } } } as unknown as GithubOrganizationMembersClient;
    const repository = new OrganizationMembersRepository({ getClient: () => client });
    return { getAllMembers: () => repository.getAllMembers('private-org', 'private-token'),
        getRandomMembers: (count: number, current: readonly string[]) => repository.getRandomMembers('private-org', count, [...current], 'private-token') };
}

describe('issue assignment failure evidence', () => {
    it('normalizes unknown failures into closed facts without retaining their text', () => {
        const error = issueAssignmentFailure(new Error('private-token'), { targetNumber: 17, desiredCount: 1, stage: 'lookup-members',
            assigneeRead: 'verified', observedAssignees: 0, confirmedAssignments: 0, remainingAssignments: 1, mutation: 'not-attempted' });
        expect(error).toMatchObject({ code: 'unexpected', retryable: false, recovery: { variables: { operation: 'unavailable', providerStatus: 'http-unavailable' } } });
        expect(JSON.stringify(error)).not.toContain('private-token');
    });

    it('rejects a missing target without reading membership or attempting writes', async () => {
        const read = jest.fn(), write = jest.fn(), lookup = jest.fn();
        const result = await new AssignMemberToIssueUseCase({ getCurrentAssignees: read, assignMembersToIssue: write },
            { getAllMembers: lookup, getRandomMembers: jest.fn() }).invoke({ ...request, number: 0 });
        expect(result).toEqual([expect.objectContaining({ success: false })]);
        expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(lookup).not.toHaveBeenCalled();
    });
    it.each([
        { status: 503, code: 'provider.unavailable', retryable: true },
        { status: 403, code: 'authorization.denied', retryable: false },
        { status: undefined, code: 'unexpected', retryable: false },
    ])('keeps safe lookup context and truthful retryability for $code', async ({ status, code, retryable }) => {
        const assign = jest.fn();
        const result = await new AssignMemberToIssueUseCase({ getCurrentAssignees: async () => [], assignMembersToIssue: assign },
            failingMembership({ status, message: 'private-token private-org private-member', response: { data: { secret: 'private-token' } } })).invoke(request);
        const error = result.flatMap(item => [...item.errors])[0];
        expect(error).toMatchObject({ code, retryable, recovery: { id: 'issue-assignment-failed', variables: {
            stage: 'lookup-members', operation: 'list-teams', providerStatus: status ? `http-${status}` : 'http-unavailable',
        } } });
        const presentation = renderApplicationErrorText(error);
        expect(presentation).toContain('organization teams');
        expect(presentation).not.toMatch(/private-token|private-org|private-member/);
        expect(assign).not.toHaveBeenCalled();
    });

    it('rereads an already assigned creator without depending on organization lookup', async () => {
        const members = failingMembership({ status: 403 });
        const lookup = jest.spyOn(members, 'getAllMembers');
        const assign = jest.fn();
        const result = await new AssignMemberToIssueUseCase({ getCurrentAssignees: async () => ['ALICE'], assignMembersToIssue: assign }, members).invoke(request);
        expect(result.every(item => item.success)).toBe(true);
        expect(lookup).not.toHaveBeenCalled();
        expect(assign).not.toHaveBeenCalled();
    });

    it('does not claim creator assignment when the returned assignment omits the creator', async () => {
        const result = await new AssignMemberToIssueUseCase({ getCurrentAssignees: async () => [], assignMembersToIssue: async () => [] },
            { getAllMembers: async () => ['alice'], getRandomMembers: async () => [] }).invoke(request);
        expect(result.some(item => !item.success && item.errors.some(error => error.code === 'provider.contract-invalid'))).toBe(true);
        expect(result.some(item => item.success && item.steps.some(step => step.includes('(creator)')))).toBe(false);
    });

    it('retains a confirmed creator across additional-member failure and rereads it on retry', async () => {
        const current: string[] = [];
        const assign = jest.fn(async (_number: number, members: readonly string[]) => {
            if (members.includes('bob') && assign.mock.calls.length === 2) throw new AssignmentProviderError('provider.unavailable', 'add-assignees', 'http-503');
            current.push(...members); return [...current];
        });
        const members = { getAllMembers: async () => ['alice', 'bob'], getRandomMembers: jest.fn(async () => ['bob']) };
        const useCase = new AssignMemberToIssueUseCase({ getCurrentAssignees: async () => [...current], assignMembersToIssue: assign }, members);
        const first = await useCase.invoke({ ...request, desiredAssigneesCount: 2 });
        const error = first.flatMap(item => [...item.errors])[0];
        expect(error.recovery).toMatchObject({ variables: { stage: 'assign-members', confirmedAssignments: 1, remainingAssignments: 1, mutation: 'unverified' } });
        expect(first.filter(item => item.success).flatMap(item => [...item.steps])).toContain('The issue was assigned to @alice (creator).');
        expect(error.toJSON().retainedState).toContain('Verified assignments');
        expect(members.getRandomMembers).toHaveBeenNthCalledWith(1, 1, ['alice']);
        const retried = await useCase.invoke({ ...request, desiredAssigneesCount: 2 });
        expect(retried.every(item => item.success)).toBe(true);
        expect(assign.mock.calls.map(call => call[1])).toEqual([['alice'], ['bob'], ['bob']]);
        expect(current).toEqual(['alice', 'bob']);
    });

    it('does not repeat a write whose response failed after it applied remotely', async () => {
        const current: string[] = [];
        const assign = jest.fn(async (_number: number, members: readonly string[]) => {
            current.push(...members); throw new AssignmentProviderError('provider.unavailable', 'add-assignees', 'http-503');
        });
        const lookup = jest.fn(async () => ['alice']);
        const useCase = new AssignMemberToIssueUseCase({ getCurrentAssignees: async () => [...current], assignMembersToIssue: assign }, { getAllMembers: lookup, getRandomMembers: async () => [] });
        const first = await useCase.invoke(request);
        expect(first.flatMap(item => [...item.errors])[0].recovery).toMatchObject({ variables: { confirmedAssignments: 0, mutation: 'unverified' } });
        lookup.mockRejectedValue(new Error('private-token'));
        expect((await useCase.invoke(request)).every(item => item.success)).toBe(true);
        expect(assign).toHaveBeenCalledTimes(1);
        expect(lookup).toHaveBeenCalledTimes(1);
    });

    it('retains partial requested-member confirmations and exposes the unconfirmed remainder', async () => {
        const result = await new AssignMemberToIssueUseCase({ getCurrentAssignees: async () => [], assignMembersToIssue: async () => ['bob', 'BOB', 'foreign'] },
            { getAllMembers: async () => ['bob', 'carol'], getRandomMembers: async () => ['bob', 'carol'] }).invoke({ ...request, creator: '', desiredAssigneesCount: 2 });
        expect(result.filter(item => item.success)).toHaveLength(1);
        expect(result.flatMap(item => [...item.errors])[0]).toMatchObject({ code: 'provider.contract-invalid', recovery: { variables: { confirmedAssignments: 1, remainingAssignments: 1, operation: 'add-assignees', mutation: 'unverified' } } });
    });

    it('keeps the verified creator when the subsequent member selection fails', async () => {
        const cause = new AssignmentProviderError('authorization.denied', 'list-team-members', 'http-403');
        const result = await new AssignMemberToIssueUseCase({ getCurrentAssignees: async () => [], assignMembersToIssue: async () => ['alice'] },
            { getAllMembers: async () => ['alice'], getRandomMembers: async () => { throw cause; } }).invoke({ ...request, desiredAssigneesCount: 2 });
        expect(result.flatMap(item => [...item.errors])[0]).toMatchObject({ correlationId: cause.correlationId, retryable: false,
            recovery: { variables: { stage: 'select-members', operation: 'list-team-members', mutation: 'verified', confirmedAssignments: 1 } } });
    });

    it('keeps an unread current count unavailable rather than claiming zero remaining work', async () => {
        const result = await new AssignMemberToIssueUseCase({ getCurrentAssignees: async () => { throw new ApplicationError('authorization.denied', 'Safe.'); }, assignMembersToIssue: jest.fn() },
            { getAllMembers: jest.fn(), getRandomMembers: jest.fn() }).invoke(request);
        const error = result.flatMap(item => [...item.errors])[0];
        expect(error.recovery).toMatchObject({ variables: { stage: 'read-assignees', assigneeRead: 'unavailable', operation: 'read-assignees', mutation: 'not-attempted' } });
        expect(renderApplicationErrorText(error)).toContain('Remaining target count: unavailable');
    });

    it('retains an already full target instead of adding an eligible but different creator', async () => {
        const lookup = jest.fn(async () => ['alice', 'bob']);
        const assign = jest.fn();
        const result = await new AssignMemberToIssueUseCase({ getCurrentAssignees: async () => ['bob'], assignMembersToIssue: assign },
            { getAllMembers: lookup, getRandomMembers: jest.fn() }).invoke(request);
        expect(result.every(item => item.success)).toBe(true);
        expect(lookup).not.toHaveBeenCalled();
        expect(assign).not.toHaveBeenCalled();
    });

    it('counts existing identities without case before selecting remaining members', async () => {
        const random = jest.fn(async () => ['bob']);
        const result = await new AssignMemberToIssueUseCase({ getCurrentAssignees: async () => ['alice', 'ALICE'], assignMembersToIssue: async () => ['alice', 'bob'] },
            { getAllMembers: async () => ['alice', 'bob'], getRandomMembers: random }).invoke({ ...request, creator: '', desiredAssigneesCount: 2 });
        expect(result.every(item => item.success)).toBe(true);
        expect(random).toHaveBeenCalledWith(1, ['alice', 'ALICE']);
    });

    it.each([503, 403, 422, undefined])('continues independent issue lifecycle steps after lookup failure (%s)', async status => {
        const assignment = new AssignMemberToIssueUseCase({ getCurrentAssignees: async () => [], assignMembersToIssue: jest.fn() }, failingMembership({ status }));
        const calls: string[] = [];
        const step = (id: string) => ({ taskId: id, invoke: async () => { calls.push(id); return [new Result({ id, success: true, executed: true })]; } });
        const ports = { sharedContexts: { permissions: {}, title: { kind: 'issue', labelFacts: {} }, projectLink: {}, steps: { assignment: request, issueType: {}, priority: {} } },
            workflowSteps: { checkPermissions: step('permissions'), assignMemberToIssue: assignment, updateIssueType: step('type'), linkIssueProject: step('project'), checkPriorityIssueSize: step('priority'), updateTitle: step('title') } } as unknown as IssueWorkflowPorts;
        const context = { started: false, branchRequired: false, membersOnly: false, newIssue: false } as IssueWorkflowRouteContext;
        const outcome = await runIssueWorkflow(context, 'IssueUseCase', ports);
        expect(calls).toEqual(['permissions', 'type', 'project', 'priority', 'title']);
        expect(outcome.results.filter(item => item.success).map(item => item.id)).toEqual(['type', 'project', 'priority', 'title']);
        expect(outcome.results.flatMap(item => [...item.errors])).toHaveLength(1);
        expect(JSON.stringify(outcome.results)).toContain('issue-assignment-failed');
    });
});
