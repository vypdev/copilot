import { createIssueMetadataClient } from './github_issue_client_factory';
import { createGraphqlTransportClient } from './github_project_client_factory';
import { IssueMetadataRepository } from '../../data/repository/issue/issue_metadata_repository';

export function createIssueMetadataCompositionRoot(): IssueMetadataRepository {
    return new IssueMetadataRepository(createIssueMetadataClient(), createGraphqlTransportClient());
}
