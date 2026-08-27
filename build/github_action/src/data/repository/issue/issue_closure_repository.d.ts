import type { IssueClosurePort } from '../../../application/ports/issue_lifecycle_ports';
import type { IssueContentRepository } from './issue_content_repository';
import type { IssueLifecycleRepository } from './issue_lifecycle_repository';
export declare class IssueClosureRepository implements IssueClosurePort {
    private readonly lifecycleRepository;
    private readonly contentRepository;
    constructor(lifecycleRepository: IssueLifecycleRepository, contentRepository: IssueContentRepository);
    closeIssue: (...args: Parameters<IssueLifecycleRepository["closeIssue"]>) => Promise<boolean>;
    addComment: (...args: Parameters<IssueContentRepository["addComment"]>) => Promise<void>;
}
