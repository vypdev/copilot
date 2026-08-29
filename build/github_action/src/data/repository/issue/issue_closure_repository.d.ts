import type { IssueClosurePort } from '../../../application/ports/issue_lifecycle_ports';
export declare class IssueClosureRepository implements IssueClosurePort {
    private readonly lifecycleRepository;
    private readonly contentRepository;
    constructor(lifecycleRepository: Pick<IssueClosurePort, 'closeIssue'>, contentRepository: Pick<IssueClosurePort, 'addComment'>);
    closeIssue: (...args: Parameters<IssueClosurePort["closeIssue"]>) => Promise<boolean>;
    addComment: (...args: Parameters<IssueClosurePort["addComment"]>) => Promise<void>;
}
