import { logDebugInfo } from "../../../utils/logger";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubIssueAssignmentClient } from "../../../infrastructure/github/ports/github_issue_provider_ports";
import { ApplicationError } from '../../../application/errors/application_error';
import { withAssignmentProviderFailure } from '../github/assignment_provider_failure';

export class IssueAssignmentRepository {
    constructor(private readonly githubClient: GithubClientPort<GithubIssueAssignmentClient>) {}
    getCurrentAssignees = async (owner: string, repository: string, issueNumber: number, token: string): Promise<string[]> => {
        const octokit = await withAssignmentProviderFailure('initialize-client', async () => this.githubClient.getClient(token));
        return withAssignmentProviderFailure('read-assignees', async () => {
            const response = await octokit.rest.issues.get({ owner, repo: repository, issue_number: issueNumber });
            return assigneesFromIssue(response?.data);
        });
    };

    assignMembersToIssue = async (
        owner: string,
        repository: string,
        issueNumber: number,
        members: string[],
        token: string,
    ): Promise<string[]> => {
        if (members.length === 0) {
            logDebugInfo('No members provided for assignment. Skipping operation.');
            return [];
        }
        const octokit = await withAssignmentProviderFailure('initialize-client', async () => this.githubClient.getClient(token));
        return withAssignmentProviderFailure('add-assignees', async () => {
            const response = await octokit.rest.issues.addAssignees({
                owner, repo: repository, issue_number: issueNumber, assignees: members,
            });
            return assigneesFromIssue(response?.data);
        });
    };
}

function assigneesFromIssue(value: unknown): string[] {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw malformedAssignees();
    const assignees = (value as Record<string, unknown>).assignees ?? [];
    if (!Array.isArray(assignees) || assignees.length > 10) throw malformedAssignees();
    return assignees.map(assignee => {
        if (typeof assignee !== 'object' || assignee === null || typeof assignee.login !== 'string' || assignee.login.trim().length === 0) throw malformedAssignees();
        return assignee.login;
    });
}

function malformedAssignees(): ApplicationError {
    return new ApplicationError('provider.contract-invalid', 'Issue assignee response is malformed.');
}
