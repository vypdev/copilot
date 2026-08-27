import type { GithubClientPort } from "./ports/github_client_provider_port";
import type { GithubWorkflowDispatchClient, GithubWorkflowRunsClient } from "./ports/github_workflow_provider_ports";
export declare class OctokitWorkflowRunsClientAdapter implements GithubClientPort<GithubWorkflowRunsClient> {
    getClient(token: string): GithubWorkflowRunsClient;
}
export declare class OctokitWorkflowDispatchClientAdapter implements GithubClientPort<GithubWorkflowDispatchClient> {
    getClient(token: string): GithubWorkflowDispatchClient;
}
