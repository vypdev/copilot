import type { InitialLabelProvisioningPort, LabelProvisioningSummary } from "../../../application/ports/issue_management_ports";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubIssueLabelProvisioningClient } from "../../../infrastructure/github/ports/github_issue_label_provisioning_protocol";
import { Labels } from "../../model/labels";
export declare class IssueLabelProvisioningRepository implements InitialLabelProvisioningPort {
    private readonly githubClient;
    constructor(githubClient: GithubClientPort<GithubIssueLabelProvisioningClient>);
    ensureInitialLabels: (owner: string, repository: string, labels: Labels, token: string) => Promise<{
        configured: LabelProvisioningSummary;
        progress: LabelProvisioningSummary;
    }>;
    private listLabelsForRepo;
    private provisionMissingLabels;
    private provisionLabel;
}
