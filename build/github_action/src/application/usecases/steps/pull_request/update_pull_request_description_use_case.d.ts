import { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { FindingsQueryPort } from '../../../ports/agent_findings_ports';
import type { IssueDescriptionQueryPort } from '../../../ports/issue_description_ports';
import type { OrganizationMembersPort } from '../../../ports/organization_members_ports';
import type { PullRequestDescriptionCommandPort } from '../../../ports/pull_request_description_ports';
import { ParamUseCase } from '../../base/param_usecase';
/** Application boundary for generating a pull request description from its issue and diff. */
export declare class UpdatePullRequestDescriptionUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly pullRequestDescriptionCommandPort;
    private readonly issueDescriptionQueryPort;
    private readonly organizationMembersPort;
    private readonly aiRepository;
    taskId: string;
    constructor(pullRequestDescriptionCommandPort: PullRequestDescriptionCommandPort, issueDescriptionQueryPort: IssueDescriptionQueryPort, organizationMembersPort: OrganizationMembersPort, aiRepository: FindingsQueryPort);
    invoke(param: Execution): Promise<Result[]>;
    /** Explicit comment commands may update a preserved PR body on demand. */
    invokeExplicit(param: Execution): Promise<Result[]>;
}
