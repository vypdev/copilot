import { createIssueContentClient, createIssueLifecycleClient } from './github_issue_client_factory';
import { IssueContentRepository } from '../../data/repository/issue/issue_content_repository';
import { IssueLifecycleRepository } from '../../data/repository/issue/issue_lifecycle_repository';
import { IssueClosureRepository } from '../../data/repository/issue/issue_closure_repository';
import { IssueNotificationRepository } from '../../data/repository/issue/issue_notification_repository';

export function createIssueClosureRepository(): IssueClosureRepository {
    return new IssueClosureRepository(
        new IssueLifecycleRepository(createIssueLifecycleClient()),
        new IssueContentRepository(createIssueContentClient()),
    );
}

export function createIssueNotificationRepository(): IssueNotificationRepository {
    return new IssueNotificationRepository(
        new IssueLifecycleRepository(createIssueLifecycleClient()),
        new IssueContentRepository(createIssueContentClient()),
    );
}
