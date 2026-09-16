import type { Result } from '../../../data/model/result';
import { ParamUseCase } from '../base/param_usecase';
import type { BoundIssueClosurePort } from '../../ports/issue_lifecycle_ports';
import type { BoundIssueInactivityQueryPort, IssueInactivityClockPort } from '../../ports/issue_inactivity_ports';
import type { InactivityContext } from '../push_single_action_contexts';
import { runCloseInactiveIssuesWorkflow } from './close_inactive_issues_workflow';
import type { MessageCatalogResolutionPort } from '../../ports/message_catalog_ports';

/** Application boundary for the scheduled inactivity-maintenance action. */
export class CloseInactiveIssuesUseCase implements ParamUseCase<InactivityContext, Result[]> {
    taskId = 'CloseInactiveIssuesUseCase';

    constructor(
        private readonly issueQueryPort: BoundIssueInactivityQueryPort,
        private readonly issueClosurePort: BoundIssueClosurePort,
        private readonly clock: IssueInactivityClockPort,
        private readonly catalogResolver?: MessageCatalogResolutionPort,
    ) {}

    async invoke(param: InactivityContext): Promise<Result[]> {
        return runCloseInactiveIssuesWorkflow(param, {
            issueQueryPort: this.issueQueryPort,
            issueClosurePort: this.issueClosurePort,
            clock: this.clock,
            catalogResolver: this.catalogResolver,
        });
    }
}
