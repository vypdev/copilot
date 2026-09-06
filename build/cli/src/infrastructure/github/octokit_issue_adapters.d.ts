import type { GithubClientPort } from "./ports/github_client_provider_port";
import type { GithubIssueAssignmentClient, GithubIssueContentClient, GithubIssueInactivityClient, GithubIssueLabelsClient, GithubIssueLifecycleClient, GithubIssueMetadataClient, GithubIssueTitleClient } from "./ports/github_issue_provider_ports";
import type { GithubIssueLabelProvisioningClient } from "./ports/github_issue_label_provisioning_protocol";
export declare class OctokitIssueAssignmentClientAdapter implements GithubClientPort<GithubIssueAssignmentClient> {
    getClient(token: string): GithubIssueAssignmentClient;
}
export declare class OctokitIssueContentClientAdapter implements GithubClientPort<GithubIssueContentClient> {
    getClient(token: string): GithubIssueContentClient;
}
export declare class OctokitIssueLabelProvisioningClientAdapter implements GithubClientPort<GithubIssueLabelProvisioningClient> {
    getClient(token: string): GithubIssueLabelProvisioningClient;
}
export declare class OctokitIssueLabelsClientAdapter implements GithubClientPort<GithubIssueLabelsClient> {
    getClient(token: string): GithubIssueLabelsClient;
}
export declare class OctokitIssueLifecycleClientAdapter implements GithubClientPort<GithubIssueLifecycleClient> {
    getClient(token: string): GithubIssueLifecycleClient;
}
export declare class OctokitIssueInactivityClientAdapter implements GithubClientPort<GithubIssueInactivityClient> {
    getClient(token: string): GithubIssueInactivityClient;
}
export declare class OctokitIssueMetadataClientAdapter implements GithubClientPort<GithubIssueMetadataClient> {
    getClient(token: string): GithubIssueMetadataClient;
}
export declare class OctokitIssueTitleClientAdapter implements GithubClientPort<GithubIssueTitleClient> {
    getClient(token: string): GithubIssueTitleClient;
}
