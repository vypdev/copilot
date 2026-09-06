import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { IssueDescriptionQueryPort } from '../../../ports/issue_description_ports';
import type { OrganizationMembersPort } from '../../../ports/organization_members_ports';
import type { PullRequestDescriptionCommandPort } from '../../../ports/pull_request_description_ports';
export interface UpdatePullRequestDescriptionWorkflowDependencies {
    pullRequestDescriptionCommandPort: PullRequestDescriptionCommandPort;
    issueDescriptionQueryPort: IssueDescriptionQueryPort;
    organizationMembersPort: OrganizationMembersPort;
    aiRepository: FindingsQueryPort;
}
/** Generates and publishes a PR description while keeping provider details behind ports. */
export declare function runUpdatePullRequestDescriptionWorkflow(param: Execution, taskId: string, dependencies: UpdatePullRequestDescriptionWorkflowDependencies, force?: boolean): Promise<Result[]>;
