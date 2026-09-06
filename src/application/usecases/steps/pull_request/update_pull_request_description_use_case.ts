import { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { IssueDescriptionQueryPort } from '../../../ports/issue_description_ports';
import type { OrganizationMembersPort } from '../../../ports/organization_members_ports';
import type { PullRequestDescriptionCommandPort } from '../../../ports/pull_request_description_ports';
import { ParamUseCase } from '../../base/param_usecase';
import { runUpdatePullRequestDescriptionWorkflow } from './update_pull_request_description_workflow';

/** Application boundary for generating a pull request description from its issue and diff. */
export class UpdatePullRequestDescriptionUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'UpdatePullRequestDescriptionUseCase';

    constructor(
        private readonly pullRequestDescriptionCommandPort: PullRequestDescriptionCommandPort,
        private readonly issueDescriptionQueryPort: IssueDescriptionQueryPort,
        private readonly organizationMembersPort: OrganizationMembersPort,
        private readonly aiRepository: FindingsQueryPort,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        return await runUpdatePullRequestDescriptionWorkflow(param, this.taskId, {
            pullRequestDescriptionCommandPort: this.pullRequestDescriptionCommandPort,
            issueDescriptionQueryPort: this.issueDescriptionQueryPort,
            organizationMembersPort: this.organizationMembersPort,
            aiRepository: this.aiRepository,
        });
    }

    /** Explicit comment commands may update a preserved PR body on demand. */
    async invokeExplicit(param: Execution): Promise<Result[]> {
        return await runUpdatePullRequestDescriptionWorkflow(param, this.taskId, {
            pullRequestDescriptionCommandPort: this.pullRequestDescriptionCommandPort,
            issueDescriptionQueryPort: this.issueDescriptionQueryPort,
            organizationMembersPort: this.organizationMembersPort,
            aiRepository: this.aiRepository,
        }, true);
    }
}
