import type { GithubClientPort } from "./ports/github_client_provider_port";
import type {
    GithubWorkflowDispatchClient,
    GithubWorkflowRunsClient,
} from "./ports/github_workflow_provider_ports";
import { getOctokitClient } from "./octokit_client_resolver";

export class OctokitWorkflowRunsClientAdapter implements GithubClientPort<GithubWorkflowRunsClient> {
    getClient(token: string): GithubWorkflowRunsClient {
        return getOctokitClient<GithubWorkflowRunsClient>(token);
    }
}

export class OctokitWorkflowDispatchClientAdapter implements GithubClientPort<GithubWorkflowDispatchClient> {
    getClient(token: string): GithubWorkflowDispatchClient {
        return getOctokitClient<GithubWorkflowDispatchClient>(token);
    }
}
