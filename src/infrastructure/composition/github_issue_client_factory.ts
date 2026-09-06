import { OctokitIssueAssignmentClientAdapter, OctokitIssueContentClientAdapter, OctokitIssueInactivityClientAdapter, OctokitIssueLabelProvisioningClientAdapter, OctokitIssueLabelsClientAdapter, OctokitIssueLifecycleClientAdapter, OctokitIssueMetadataClientAdapter, OctokitIssueTitleClientAdapter } from "../github/octokit_issue_adapters";
export const createIssueAssignmentClient = () => new OctokitIssueAssignmentClientAdapter();
export const createIssueContentClient = () => new OctokitIssueContentClientAdapter();
export const createIssueLabelProvisioningClient = () => new OctokitIssueLabelProvisioningClientAdapter();
export const createIssueLabelsClient = () => new OctokitIssueLabelsClientAdapter();
export const createIssueLifecycleClient = () => new OctokitIssueLifecycleClientAdapter();
export const createIssueInactivityClient = () => new OctokitIssueInactivityClientAdapter();
export const createIssueMetadataClient = () => new OctokitIssueMetadataClientAdapter();
export const createIssueTitleClient = () => new OctokitIssueTitleClientAdapter();
