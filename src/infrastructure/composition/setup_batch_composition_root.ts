import { getOctokitClient } from '../github/octokit_client_resolver';
import type { GithubSetupBatchClient } from '../github/ports/github_setup_batch_protocol';
import { SetupBatchGithubReadAdapter, SetupBatchGithubTransport, SetupBatchProviderError } from '../setup_batch_github_read_adapter';
import { SetupBatchGithubApplyAdapter } from '../setup_batch_github_apply_adapter';
import { SetupBatchJournalAdapter } from '../setup_batch_journal_adapter';
import { SetupBatchWorkspaceAdapter } from '../setup_batch_workspace_adapter';
import { createSetupRemoteConfigurationReadPort } from './setup_credentials_composition_root';
import { createRepositoryVariablesClient } from './github_identity_client_factory';
import { RepositoryVariablesCommandRepository } from '../../data/repository/repository_variables_repository';
import { IssueLabelProvisioningRepository } from '../../data/repository/issue/issue_label_provisioning_repository';
import { IssueTypeRepository } from '../../data/repository/issue/issue_type_repository';
import { createIssueLabelProvisioningClient } from './github_issue_client_factory';
import { createGraphqlTransportClient } from './github_project_client_factory';
import { readLocalLabelsAndIssueTypes } from '../../application/policies/issue_resource_input_policy';
import { getActionInputsWithDefaults } from '../../utils/yml_utils';
import { buildSetupActionInputs } from '../../application/policies/setup_configuration_policy';
import { selectedInitialIssueTypes, selectedInitialLabels } from '../../application/policies/setup_issue_resource_policy';
import type { InitialIssueTypeConfiguration, InitialLabelConfiguration } from '../../application/ports/issue_management_ports';
import type { SetupBatchTargetPlan } from '../../domain/setup_batch';

export function createSetupBatchCompositionRoot() {
  const transport = new SetupBatchGithubTransport({ getClient: token => getOctokitClient<GithubSetupBatchClient>(token) });
  const read = new SetupBatchGithubReadAdapter(transport, createSetupRemoteConfigurationReadPort());
  const labels = new IssueLabelProvisioningRepository(createIssueLabelProvisioningClient());
  const types = new IssueTypeRepository(createGraphqlTransportClient());
  const catalogs = (plan: SetupBatchTargetPlan) => {
    const parsed = readLocalLabelsAndIssueTypes(buildSetupActionInputs(plan.configuration), getActionInputsWithDefaults());
    const labelConfiguration = Object.fromEntries(Object.entries(parsed.labels).map(([key, value]) =>
      [key.endsWith('Label') ? key.slice(0, -5) : key, value])) as unknown as InitialLabelConfiguration;
    const issueTypes = Object.fromEntries(Object.entries(parsed.issueTypes).map(([key, value]) => {
      const name = key.slice('issueType'.length);
      return [name.charAt(0).toLowerCase() + name.slice(1), value];
    })) as unknown as InitialIssueTypeConfiguration;
    return { labelConfiguration, issueTypes };
  };
  const writer = new SetupBatchGithubApplyAdapter(read, new RepositoryVariablesCommandRepository(createRepositoryVariablesClient()), {
    labels: async (plan, token) => {
      const result = await labels.ensureInitialLabels(plan.target.owner, plan.target.name,
        selectedInitialLabels(catalogs(plan).labelConfiguration, plan.configuration), token);
      if (result.configured.errors.length || result.progress.errors.length) throw new SetupBatchProviderError('unknown');
    },
    issueTypes: async (plan, token) => {
      const result = await types.ensureIssueTypes(plan.target.owner, selectedInitialIssueTypes(catalogs(plan).issueTypes, plan.configuration), token);
      if (result.errors.length) throw new SetupBatchProviderError('unknown');
    },
  });
  return { discovery: read, inventory: read, writer, renderer: new SetupBatchWorkspaceAdapter(), journal: new SetupBatchJournalAdapter() };
}
