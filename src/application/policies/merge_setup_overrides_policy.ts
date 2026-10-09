import type { SetupConfigurationOverrides } from './setup_configuration_policy';
import { SETUP_AGENT_TASKS } from './setup_configuration_defaults';

/** Explicit CLI flags override only their fields; file-only settings remain intact. */
export function mergeSetupOverrides(
  fileOverrides: SetupConfigurationOverrides,
  flagOverrides: SetupConfigurationOverrides,
): SetupConfigurationOverrides {
  const agents = { ...fileOverrides.agents, ...flagOverrides.agents };
  for (const task of SETUP_AGENT_TASKS) {
    if (agents[task] !== undefined) {
      agents[task] = { ...fileOverrides.agents?.[task], ...flagOverrides.agents?.[task] };
    }
  }
  return {
    ...fileOverrides,
    ...flagOverrides,
    features: { ...fileOverrides.features, ...flagOverrides.features },
    agents,
    repository: { ...fileOverrides.repository, ...flagOverrides.repository },
    ai: { ...fileOverrides.ai, ...flagOverrides.ai },
    pullRequestApproval: {
      ...fileOverrides.pullRequestApproval,
      ...flagOverrides.pullRequestApproval,
      coverage: { ...fileOverrides.pullRequestApproval?.coverage, ...flagOverrides.pullRequestApproval?.coverage },
    } as SetupConfigurationOverrides['pullRequestApproval'],
    projects: { ...fileOverrides.projects, ...flagOverrides.projects },
    issueWorkflows: { ...fileOverrides.issueWorkflows, ...flagOverrides.issueWorkflows },
    repositoryAgentGuidance: { ...fileOverrides.repositoryAgentGuidance, ...flagOverrides.repositoryAgentGuidance },
    storage: {
      ...fileOverrides.storage,
      ...flagOverrides.storage,
      secrets: { ...fileOverrides.storage?.secrets, ...flagOverrides.storage?.secrets, overrides: { ...fileOverrides.storage?.secrets?.overrides, ...flagOverrides.storage?.secrets?.overrides } },
      variables: { ...fileOverrides.storage?.variables, ...flagOverrides.storage?.variables, overrides: { ...fileOverrides.storage?.variables?.overrides, ...flagOverrides.storage?.variables?.overrides } },
    },
  };
}
