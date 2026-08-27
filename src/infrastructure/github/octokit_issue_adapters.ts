import { getOctokitClient } from "./octokit_client_resolver";
import type { GithubClientPort } from "./ports/github_client_provider_port";
import type { GithubIssueAssignmentClient, GithubIssueContentClient, GithubIssueLabelsClient, GithubIssueLifecycleClient, GithubIssueMetadataClient, GithubIssueTitleClient } from "../../application/ports/github_issue_ports";
import type { GithubIssueLabelProvisioningClient } from "./ports/github_issue_label_provisioning_protocol";

export class OctokitIssueAssignmentClientAdapter implements GithubClientPort<GithubIssueAssignmentClient> {
    getClient(token: string): GithubIssueAssignmentClient { return getOctokitClient<GithubIssueAssignmentClient>(token); }
}
export class OctokitIssueContentClientAdapter implements GithubClientPort<GithubIssueContentClient> {
    getClient(token: string): GithubIssueContentClient { return getOctokitClient<GithubIssueContentClient>(token); }
}
export class OctokitIssueLabelProvisioningClientAdapter implements GithubClientPort<GithubIssueLabelProvisioningClient> {
    getClient(token: string): GithubIssueLabelProvisioningClient { return getOctokitClient<GithubIssueLabelProvisioningClient>(token); }
}
export class OctokitIssueLabelsClientAdapter implements GithubClientPort<GithubIssueLabelsClient> {
    getClient(token: string): GithubIssueLabelsClient { return getOctokitClient<GithubIssueLabelsClient>(token); }
}
export class OctokitIssueLifecycleClientAdapter implements GithubClientPort<GithubIssueLifecycleClient> {
    getClient(token: string): GithubIssueLifecycleClient { return getOctokitClient<GithubIssueLifecycleClient>(token); }
}
export class OctokitIssueMetadataClientAdapter implements GithubClientPort<GithubIssueMetadataClient> {
    getClient(token: string): GithubIssueMetadataClient { return getOctokitClient<GithubIssueMetadataClient>(token); }
}
export class OctokitIssueTitleClientAdapter implements GithubClientPort<GithubIssueTitleClient> {
    getClient(token: string): GithubIssueTitleClient { return getOctokitClient<GithubIssueTitleClient>(token); }
}
