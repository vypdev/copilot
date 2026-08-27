import { createIssueContentClient, createIssueLabelsClient, createIssueMetadataClient } from './github_issue_client_factory';
import { createGraphqlTransportClient } from './github_project_client_factory';
import { ExecutionIssueSetupRepository } from "../../data/repository/issue/execution_issue_setup_repository";
import { IssueContentRepository } from "../../data/repository/issue/issue_content_repository";
import { IssueLabelRepository } from "../../data/repository/issue/issue_label_repository";
import { IssueMetadataRepository } from "../../data/repository/issue/issue_metadata_repository";

export function createExecutionIssueSetupCompositionRoot(): ExecutionIssueSetupRepository {
    return new ExecutionIssueSetupRepository(
        new IssueMetadataRepository(createIssueMetadataClient(), createGraphqlTransportClient()),
        new IssueContentRepository(createIssueContentClient()),
        new IssueLabelRepository(createIssueLabelsClient()),
    );
}
