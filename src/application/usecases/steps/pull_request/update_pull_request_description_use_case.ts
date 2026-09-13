import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { BoundIssueDescriptionQueryPort } from '../../../ports/issue_description_ports';
import type { BoundOrganizationMembersPort } from '../../../ports/organization_members_ports';
import type { BoundPullRequestDescriptionPort } from '../../../ports/pull_request_description_ports';
import type { ParamUseCase } from '../../base/param_usecase';
import type { PullRequestDescriptionRequest } from '../../pull_request_workflow_context';
import { runUpdatePullRequestDescriptionWorkflow } from './update_pull_request_description_workflow';

/** Application boundary for generating a pull request description from its issue and diff. */
export class UpdatePullRequestDescriptionUseCase implements ParamUseCase<PullRequestDescriptionRequest, Result[]> {
    taskId = 'UpdatePullRequestDescriptionUseCase';

    constructor(
        private readonly pullRequestDescriptionCommandPort: BoundPullRequestDescriptionPort,
        private readonly issueDescriptionQueryPort: BoundIssueDescriptionQueryPort,
        private readonly organizationMembersPort: BoundOrganizationMembersPort,
        private readonly aiRepository: FindingsQueryPort,
    ) {}

    async invoke(request: PullRequestDescriptionRequest): Promise<Result[]> {
        return runUpdatePullRequestDescriptionWorkflow(request, this.taskId, {
            pullRequestDescriptionCommandPort: this.pullRequestDescriptionCommandPort,
            issueDescriptionQueryPort: this.issueDescriptionQueryPort,
            organizationMembersPort: this.organizationMembersPort,
            aiRepository: this.aiRepository,
        });
    }
}
