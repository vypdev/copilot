import { SetupRunnerDiscoveryAdapter } from '../setup_runner_discovery_adapter';
import { SetupBatchGithubTransport } from '../setup_batch_github_read_adapter';
import { getOctokitClient } from '../github/octokit_client_resolver';
import type { GithubSetupBatchClient } from '../github/ports/github_setup_batch_protocol';
import { inspectSetupInstallation } from '../../utils/setup_installation_review';
import type { SetupInstallationReviewPort } from '../../application/ports/setup_runner_ports';

export function createSetupRunnerDiscovery() {
  return new SetupRunnerDiscoveryAdapter(new SetupBatchGithubTransport({ getClient: token => getOctokitClient<GithubSetupBatchClient>(token) }));
}
export function createSetupInstallationReview(root = process.cwd()): SetupInstallationReviewPort {
  return { inspect: async configuration => inspectSetupInstallation(root, configuration) };
}
