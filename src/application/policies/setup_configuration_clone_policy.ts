import type { SetupAgentConfiguration, SetupConfiguration } from '../../domain/setup';
import { SETUP_AGENT_TASKS } from './setup_configuration_defaults';

/** Returns a reference-isolated configuration snapshot without serializing it. */
export function cloneSetupConfiguration(configuration: SetupConfiguration): SetupConfiguration {
  const agents = Object.fromEntries(SETUP_AGENT_TASKS.map((task) => [
    task,
    { ...configuration.agents[task] },
  ])) as SetupAgentConfiguration;
  return {
    ...configuration,
    features: { ...configuration.features },
    agents,
    repository: {
      ...configuration.repository,
      mergeQueueCheckAttestations: configuration.repository.mergeQueueCheckAttestations.map((attestation) => ({
        ...attestation,
        targets: [...attestation.targets],
      })),
    },
    ai: { ...configuration.ai },
    projects: { ...configuration.projects },
    actionInputs: { ...configuration.actionInputs },
    storage: {
      secrets: {
        ...configuration.storage.secrets,
        overrides: { ...configuration.storage.secrets.overrides },
      },
      variables: {
        ...configuration.storage.variables,
        overrides: { ...configuration.storage.variables.overrides },
      },
    },
  };
}
