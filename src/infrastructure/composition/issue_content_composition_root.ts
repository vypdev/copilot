import { createIssueContentClient } from './github_issue_client_factory';
import { IssueContentRepository } from '../../data/repository/issue/issue_content_repository';

export function createIssueContentCompositionRoot(): IssueContentRepository {
    return new IssueContentRepository(createIssueContentClient());
}
