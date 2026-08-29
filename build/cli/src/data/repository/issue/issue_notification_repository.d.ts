import type { IssueNotificationPort } from '../../../application/ports/issue_lifecycle_ports';
export declare class IssueNotificationRepository implements IssueNotificationPort {
    private readonly lifecycleRepository;
    private readonly contentRepository;
    constructor(lifecycleRepository: Pick<IssueNotificationPort, 'openIssue'>, contentRepository: Pick<IssueNotificationPort, 'addComment'>);
    openIssue: (...args: Parameters<IssueNotificationPort["openIssue"]>) => Promise<boolean>;
    addComment: (...args: Parameters<IssueNotificationPort["addComment"]>) => Promise<void>;
}
