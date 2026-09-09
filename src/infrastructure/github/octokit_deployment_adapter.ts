import { getOctokitClient } from "./octokit_client_resolver";
import type { GithubClientPort } from "./ports/github_client_provider_port";
import type { GithubDeploymentClient } from "./ports/github_deployment_provider_port";

export class OctokitDeploymentClientAdapter implements GithubClientPort<GithubDeploymentClient> {
  getClient(token: string): GithubDeploymentClient {
    return getOctokitClient<GithubDeploymentClient>(token);
  }
}
