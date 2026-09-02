import { ACTIONS, INPUT_KEYS } from '../../utils/constants';
import type { GitInfo } from '../../cli_context';
import type { SetupConfiguration, SetupCredentialCollection } from '../../domain/setup';
import { buildSetupActionInputs } from '../../application/policies/setup_configuration_policy';

export interface SetupCommandOptions {
  debug?: boolean;
}

export function buildSetupParams(
  options: SetupCommandOptions,
  gitInfo: GitInfo,
  token: string,
  configuration?: SetupConfiguration,
  credentials?: SetupCredentialCollection,
  approvedWorkflowFiles: readonly string[] = [],
): Record<string, unknown> | undefined {
  if ('error' in gitInfo) return undefined;
  return {
    ...(configuration ? buildSetupActionInputs(configuration) : {}),
    [INPUT_KEYS.DEBUG]: options.debug?.toString() ?? 'false',
    [INPUT_KEYS.SINGLE_ACTION]: ACTIONS.INITIAL_SETUP,
    [INPUT_KEYS.SINGLE_ACTION_ISSUE]: 1,
    [INPUT_KEYS.TOKEN]: token,
    repo: { owner: gitInfo.owner, repo: gitInfo.repo },
    issue: { number: 1 },
    [INPUT_KEYS.WELCOME_TITLE]: '⚙️  Initial Setup',
    [INPUT_KEYS.WELCOME_MESSAGES]: [
      `Running initial setup for ${gitInfo.owner}/${gitInfo.repo}...`,
      'This will install the selected workflows, configure repository Variables, create labels and issue types, and verify access to GitHub.',
    ],
    ...(configuration ? { setupConfiguration: configuration } : {}),
    ...(credentials ? { setupCredentials: credentials } : {}),
    setupWorkflowUpdates: approvedWorkflowFiles,
  };
}
