import { createIssueLabelsClient } from './github_issue_client_factory';
import { IssueLabelRepository } from '../../data/repository/issue/issue_label_repository';

export function createIssueLabelRepository(): IssueLabelRepository {
    return new IssueLabelRepository(createIssueLabelsClient());
}
