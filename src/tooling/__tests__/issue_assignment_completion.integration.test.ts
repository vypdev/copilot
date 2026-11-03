import * as core from '@actions/core';
import { finishGithubAction } from '../../actions/github_action_completion';
import { AssignMemberToIssueUseCase } from '../../application/usecases/steps/issue/assign_members_to_issue_use_case';
import { UpdateIssueTypeUseCase } from '../../application/usecases/steps/issue/update_issue_type_use_case';
import { runProjectContentLinkWorkflow } from '../../application/usecases/steps/common/project_content_link_workflow';
import { runIssueWorkflow, type IssueWorkflowPorts, type IssueWorkflowRouteContext } from '../../application/usecases/issue_workflow';
import { Result } from '../../data/model/result';
import { Config } from '../../data/model/config';
import { Ai } from '../../data/model/ai';
import { ProjectDetail } from '../../data/model/project_detail';
import type { Execution } from '../../data/model/execution';
import { IssueAssignmentRepository } from '../../data/repository/issue/issue_assignment_repository';
import { IssueTypeAssignmentRepository } from '../../data/repository/issue/issue_type_assignment_repository';
import { OrganizationMembersRepository } from '../../data/repository/organization/organization_members_repository';
import { ProjectBoardLinkRepository } from '../../data/repository/project/project_board_link_repository';
import { ConfigurationHandler } from '../../manager/description/configuration_handler';
import { readConfigurationBlock } from '../../domain/configuration_markers';
import type { GithubIssueAssignmentClient } from '../../infrastructure/github/ports/github_issue_provider_ports';
import type { GithubOrganizationMembersClient } from '../../infrastructure/github/ports/github_identity_provider_ports';
import type { GithubGraphqlTransportClient } from '../../infrastructure/github/ports/github_graphql_transport_port';

jest.mock('@actions/core', () => ({ setOutput: jest.fn(), setFailed: jest.fn() }));
jest.mock('../../utils/logger', () => ({ logInfo: jest.fn(), logDebugInfo: jest.fn(), logError: jest.fn(), logWarn: jest.fn() }));

describe('assignment failure through issue completion and replay', () => {
    beforeEach(() => jest.clearAllMocks());

    it.each([503, 403])('retains type, Project and persisted configuration after HTTP %s, then safely retries the same issue', async status => {
        const events: string[] = [];
        const assignees: string[] = [];
        let lookupStatus: number | undefined = status;
        let body = 'Original issue prose.';
        let linkedItemId: string | undefined;
        let selectedType: string | undefined;
        const typeAssignments: string[] = [];
        const nativeTypes = [{ id: 'IT_bug', name: 'Bug' }];
        (core.setFailed as jest.Mock).mockImplementation(() => events.push('failed'));

        const assignmentClient = { rest: { issues: {
            get: async () => ({ data: { assignees: assignees.map(login => ({ login })) } }),
            addAssignees: jest.fn(async ({ assignees: requested }: { assignees: string[] }) => {
                assignees.push(...requested); events.push('assignment');
                return { data: { assignees: assignees.map(login => ({ login })) } };
            }),
        } } };
        const assignments = new IssueAssignmentRepository({ getClient: () => assignmentClient as unknown as GithubIssueAssignmentClient });
        const membershipClient = { paginate: { iterator: async function* (_method: unknown, params: { team_slug?: string }) {
            if (lookupStatus !== undefined) throw { status: lookupStatus, message: 'private-token', response: { data: { members: ['private-member'] } } };
            yield { data: params.team_slug ? [{ login: 'alice' }] : [{ slug: 'core' }] };
        } }, rest: { teams: { list: jest.fn(), listMembersInOrg: jest.fn() } } };
        const members = new OrganizationMembersRepository({ getClient: () => membershipClient as unknown as GithubOrganizationMembersClient });
        const assignment = new AssignMemberToIssueUseCase({
            getCurrentAssignees: number => assignments.getCurrentAssignees('acme', 'repo', number, 'product-pat'),
            assignMembersToIssue: (number, requested) => assignments.assignMembersToIssue('acme', 'repo', number, [...requested], 'product-pat'),
        }, { getAllMembers: () => members.getAllMembers('acme', 'product-pat'),
            getRandomMembers: (count, current) => members.getRandomMembers('acme', count, [...current], 'product-pat') });

        const graphql = jest.fn(async (query: string, variables?: Record<string, unknown>) => {
            if (query.includes('issueTypes(first: 20)')) return { organization: { id: 'O1', issueTypes: { nodes: nativeTypes } } };
            if (query.includes('updateIssueIssueType')) {
                selectedType = String(variables?.issueTypeId); typeAssignments.push(selectedType); events.push('type');
                return { updateIssueIssueType: { issue: { id: 'I17', issueType: nativeTypes[0] } } };
            }
            if (query.includes('addProjectV2ItemById')) {
                linkedItemId = 'PVTI17'; events.push('project');
                return { addProjectV2ItemById: { item: { id: linkedItemId } } };
            }
            throw new Error('Unexpected provider operation; no live services are used.');
        });
        const transport = { getClient: () => ({ graphql }) as unknown as GithubGraphqlTransportClient };
        const types = new IssueTypeAssignmentRepository(async () => 'I17', transport);
        const typeStep = new UpdateIssueTypeUseCase({ setIssueType: (number, type) => types.setIssueType('acme', 'repo', number, type, 'product-pat') });
        const links = new ProjectBoardLinkRepository({ getLinkedContentItemId: async () => linkedItemId } as never, transport);
        const project = { id: 'PVT1', title: 'Product', owner: 'acme', type: 'organization', number: 1, url: 'https://github.com/orgs/acme/projects/1' };
        const projectStep = { taskId: 'LinkIssueProjectUseCase', invoke: () => runProjectContentLinkWorkflow({
            contentType: 'issue', contentNumber: 17, columnName: 'Todo', projects: [project],
        }, 'LinkIssueProjectUseCase', { resolveIssueContentId: async () => 'I17',
            linkContentId: (reference, id) => links.linkContentId(new ProjectDetail(reference), id, 'product-pat'),
            initializeStatus: async () => 'retained',
        }) };
        const description = { getDescription: async () => body,
            updateDescription: jest.fn(async (_owner: string, _repo: string, _number: number, updated: string) => { body = updated; events.push('configuration'); }) };
        const configuration = new ConfigurationHandler(description);
        const query = { owner: 'acme', repository: 'repo', issueNumber: 17, token: 'product-pat' };
        const summary = { publish: jest.fn(async (_text: string) => undefined) };
        const ports = { sharedContexts: { permissions: {}, title: { kind: 'issue', labelFacts: {} }, projectLink: {}, steps: {
            assignment: { target: 'issue', number: 17, desiredAssigneesCount: 1, creator: 'alice' },
            issueType: { issueNumber: 17, issueType: { name: 'Bug', description: 'A bug', color: 'red' } }, priority: {},
        } }, workflowSteps: { checkPermissions: { invoke: async () => [new Result({ id: 'permissions', success: true, executed: false })] },
            assignMemberToIssue: assignment, updateIssueType: typeStep, linkIssueProject: projectStep,
            checkPriorityIssueSize: { invoke: async () => [] }, updateTitle: { invoke: async () => [] },
        } } as unknown as IssueWorkflowPorts;
        const route = { started: false, branchRequired: false, membersOnly: false, newIssue: false } as IssueWorkflowRouteContext;
        const run = async (currentConfiguration: Config) => {
            const results = [...(await runIssueWorkflow(route, 'IssueUseCase', ports)).results];
            const execution = { owner: 'acme', repo: 'repo', eventName: 'issues', inputs: { issue: { state: 'open' } },
                isSingleAction: false, isIssue: true, isPullRequest: false, isPush: false, issueNumber: 17,
                issue: { number: 17 }, pullRequest: { number: -1 }, tokenUser: 'bot', currentConfiguration,
                locale: { repository: 'en-US', issue: 'en-US', pullRequest: 'en-US' }, singleAction: { issue: -1 },
                release: { active: false }, hotfix: { active: false }, debug: false, tokens: { token: 'product-pat' },
                ai: new Ai('', 'model', false, [], false, 'low', 20),
            } as unknown as Execution;
            await finishGithubAction(execution, results, {} as never, { update: context => configuration.update(query, context) }, undefined, summary);
            return results;
        };

        const first = await run(new Config({ branchType: 'bugfix', workingBranch: 'bugfix/17-work', parentBranch: 'develop' }));
        const failure = first.flatMap(result => [...result.errors])[0];
        expect(failure).toMatchObject({ code: status === 503 ? 'provider.unavailable' : 'authorization.denied', retryable: status === 503 });
        expect(events).toEqual(['type', 'project', 'configuration', 'failed']);
        expect(first.some(result => result.id === 'LinkIssueProjectUseCase' && result.success)).toBe(true);
        expect(selectedType).toBe('IT_bug'); expect(linkedItemId).toBe('PVTI17');
        expect(body).toContain('Original issue prose.');
        expect(body).not.toMatch(/private-token|private-member|product-pat/);
        const stored = await configuration.get(query);
        expect(stored).toMatchObject({ branchType: 'bugfix', workingBranch: 'bugfix/17-work', parentBranch: 'develop' });
        const firstStoredBody = body;

        // A fresh ordinary run observes native state. Only the transient source recovers.
        if (status === 503) lookupStatus = undefined;
        const second = await run(stored as Config);
        expect(second.flatMap(result => [...result.errors])).toHaveLength(status === 503 ? 0 : 1);
        expect(assignees).toEqual(status === 503 ? ['alice'] : []);
        expect(assignmentClient.rest.issues.addAssignees).toHaveBeenCalledTimes(status === 503 ? 1 : 0);
        expect(nativeTypes).toEqual([{ id: 'IT_bug', name: 'Bug' }]);
        // Existing type assignment is an idempotent field set, not another type entity.
        expect(typeAssignments).toEqual(['IT_bug', 'IT_bug']);
        expect(graphql.mock.calls.filter(([q]) => q.includes('addProjectV2ItemById'))).toHaveLength(1);
        expect(description.updateDescription).toHaveBeenCalledTimes(1);
        expect(body).toBe(firstStoredBody);
        expect(body.match(/<!-- copilot-configuration-start/gu)).toHaveLength(1);
        expect(readConfigurationBlock(body).kind).toBe('present');
        expect(summary.publish).toHaveBeenCalledTimes(2);
        expect(core.setFailed).toHaveBeenCalledTimes(status === 503 ? 1 : 2);
        expect(JSON.stringify(summary.publish.mock.calls)).not.toMatch(/private-token|private-member|product-pat/);
    });
});
