import type { IssueClosurePort } from '../../../application/ports/issue_lifecycle_ports';

export class IssueClosureRepository implements IssueClosurePort {
    constructor(
        private readonly lifecycleRepository: Pick<IssueClosurePort, 'closeIssue'>,
        private readonly contentRepository: Pick<IssueClosurePort, 'addComment'>,
    ) {}

    closeIssue = (...args: Parameters<IssueClosurePort['closeIssue']>) => this.lifecycleRepository.closeIssue(...args);
    addComment = (...args: Parameters<IssueClosurePort['addComment']>) => this.contentRepository.addComment(...args);
}
