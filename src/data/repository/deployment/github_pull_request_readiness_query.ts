import type { MergeQueueObservationProblem } from "../../../domain/merge_queue_readiness";
import type { GithubDeploymentClient } from "../../../infrastructure/github/ports/github_deployment_provider_port";

interface PullRequestReadiness {
  readonly headSha: string;
  readonly immediatelyMergeable: boolean;
}

interface ReadinessResponse {
  readonly repository?: {
    readonly pullRequest?: {
      readonly headRefOid?: string;
      readonly mergeable?: string;
      readonly mergeStateStatus?: string;
      readonly isDraft?: boolean;
    } | null;
  } | null;
}

export async function observePullRequestReadiness(
  client: GithubDeploymentClient,
  owner: string,
  repository: string,
  pullRequest: number,
): Promise<{ readonly value?: PullRequestReadiness; readonly problem?: MergeQueueObservationProblem }> {
  try {
    const response = await client.graphql<ReadinessResponse>(
      `query DeploymentPullRequestReadiness($owner: String!, $repository: String!, $pullRequest: Int!) {
        repository(owner: $owner, name: $repository) {
          pullRequest(number: $pullRequest) { headRefOid mergeable mergeStateStatus isDraft }
        }
      }`,
      { owner, repository, pullRequest },
    );
    const state = response?.repository?.pullRequest;
    if (!state || typeof state.headRefOid !== "string" || !/^[a-f0-9]{40}$/i.test(state.headRefOid)
      || typeof state.mergeable !== "string" || !["MERGEABLE", "CONFLICTING", "UNKNOWN"].includes(state.mergeable)
      || typeof state.mergeStateStatus !== "string" || state.mergeStateStatus.length === 0
      || typeof state.isDraft !== "boolean") {
      return { problem: { area: "workflow-contract", message: "GitHub returned incomplete pull-request merge readiness." } };
    }
    return {
      value: {
        headSha: state.headRefOid,
        immediatelyMergeable: !state.isDraft && state.mergeable === "MERGEABLE"
          && ["CLEAN", "UNSTABLE"].includes(state.mergeStateStatus),
      },
    };
  } catch {
    return { problem: { area: "workflow-contract", message: "GitHub pull-request merge readiness could not be inspected." } };
  }
}
