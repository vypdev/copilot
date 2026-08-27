import type { IssueClosurePort } from '../../../application/ports/issue_lifecycle_ports';
import type { IssueContentRepository } from './issue_content_repository';
import type { IssueLifecycleRepository } from './issue_lifecycle_repository';

export class IssueClosureRepository implements IssueClosurePort {
    constructor(
        private readonly lifecycleRepository: IssueLifecycleRepository,
        private readonly contentRepository: IssueContentRepository,
    ) {}

    closeIssue = (...args: Parameters<IssueLifecycleRepository['closeIssue']>) => this.lifecycleRepository.closeIssue(...args);
    addComment = (...args: Parameters<IssueContentRepository['addComment']>) => this.contentRepository.addComment(...args);
}
