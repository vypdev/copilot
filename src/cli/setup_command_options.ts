import { loadSetupConfigurationOverrides } from './setup_config_file';
import { SETUP_FEATURE_DESCRIPTIONS, type SetupConfigurationOverrides } from '../application/policies/setup_configuration_policy';
import { mergeSetupOverrides } from '../application/policies/merge_setup_overrides_policy';
import type { SetupResourceScope } from '../domain/setup';
import { ISSUE_WORKFLOW_KINDS, type IssueWorkflowKind } from '../domain/issue_workflow_profile';

export function collectSecret(value: string, previous: Record<string, string>): Record<string, string> {
  const separator = value.indexOf('=');
  if (separator <= 0) throw new Error('--secret must use NAME=VALUE syntax.');
  const name = value.slice(0, separator).trim();
  const secret = value.slice(separator + 1);
  if (!/^[A-Z][A-Z0-9_]*$/.test(name) || !secret) throw new Error('--secret must use a non-empty NAME=VALUE with an uppercase secret name.');
  return { ...previous, [name]: secret };
}

export function collectApprovalCheck(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export interface SetupCommandOverrideOptions {
  config?: string;
  agent?: string;
  features?: string;
  issueWorkflows?: string;
  agentGuidance?: string;
  variablesScope?: string;
  secretsScope?: string;
  variablesVisibility?: string;
  secretsVisibility?: string;
  variableScope?: Record<string, SetupResourceScope>;
  secretScope?: Record<string, SetupResourceScope>;
  prApprovalMode?: string;
  prApprovalCheck?: string[];
  prApprovalCoverageCheck?: string;
  prApprovalAttestProducer?: boolean;
}

export function loadSetupOverrides(options: SetupCommandOverrideOptions): SetupConfigurationOverrides {
  const fromFile = options.config ? loadSetupConfigurationOverrides(options.config) : {};
  const fromFlags: SetupConfigurationOverrides = {};
  if (options.prApprovalMode || options.prApprovalCheck?.length || options.prApprovalCoverageCheck || options.prApprovalAttestProducer) {
    if (options.prApprovalMode && !['off', 'recommend', 'guarded'].includes(options.prApprovalMode)) {
      throw new Error('--pr-approval-mode must be guarded, recommend, or off.');
    }
    const checks = options.prApprovalCheck?.map(value => {
      const [name, appId, workflowName] = value.split('|').map(item => item.trim());
      return { name, sourceAppId: Number(appId), workflowName };
    });
    fromFlags.pullRequestApproval = {
      ...(options.prApprovalMode ? { mode: options.prApprovalMode as 'off' | 'recommend' | 'guarded' } : {}),
      ...(checks?.length ? { testChecks: checks } : {}),
      ...(options.prApprovalAttestProducer ? { producerAttested: true } : {}),
      ...(options.prApprovalCoverageCheck ? { coverage: { mode: 'check', checkName: options.prApprovalCoverageCheck } } : {}),
    };
  }
  if (options.agent) {
    if (!['codex', 'opencode', 'cursor'].includes(options.agent)) {
      throw new Error('--agent must be one of: codex, opencode, cursor.');
    }
    fromFlags.agents = Object.fromEntries(
      ['planner', 'findings', 'reviewer', 'fixer', 'tester'].map(task => [task, { provider: options.agent }]),
    ) as SetupConfigurationOverrides['agents'];
  }
  if (options.features) {
    if (options.features.trim().toLowerCase() === 'all') {
      fromFlags.features = Object.fromEntries(Object.keys(SETUP_FEATURE_DESCRIPTIONS).map(feature => [feature, true]));
    } else {
      const requested = options.features.split(',').map(feature => feature.trim()).filter(Boolean);
      const unknown = requested.filter(feature => !Object.prototype.hasOwnProperty.call(SETUP_FEATURE_DESCRIPTIONS, feature));
      if (unknown.length > 0) throw new Error(`Unknown setup feature(s): ${unknown.join(', ')}.`);
      fromFlags.features = Object.fromEntries(Object.keys(SETUP_FEATURE_DESCRIPTIONS).map(feature => [feature, requested.includes(feature)]));
    }
  }
  if (options.issueWorkflows) {
    const raw = options.issueWorkflows.trim().toLowerCase();
    const requested = raw === 'all' ? [...ISSUE_WORKFLOW_KINDS] : raw.split(',').map(item => item.trim()).filter(Boolean);
    const unknown = requested.filter(item => !ISSUE_WORKFLOW_KINDS.includes(item as IssueWorkflowKind));
    if (unknown.length > 0) throw new Error(`Unknown issue workflow(s): ${unknown.join(', ')}.`);
    if (new Set(requested).size !== requested.length) throw new Error('Issue workflow selection cannot contain duplicates.');
    fromFlags.issueWorkflows = { enabled: requested as IssueWorkflowKind[] };
  }
  if (options.agentGuidance) {
    const mode = options.agentGuidance.trim().toLowerCase();
    if (!['prompt', 'create-if-missing', 'disabled'].includes(mode)) throw new Error('--agent-guidance must be prompt, create-if-missing, or disabled.');
    fromFlags.repositoryAgentGuidance = { agentsPointer: mode as 'prompt' | 'create-if-missing' | 'disabled', enabled: mode !== 'disabled' };
  }
  const storage: NonNullable<SetupConfigurationOverrides['storage']> = {};
  if (options.variablesScope || options.variablesVisibility || Object.keys(options.variableScope ?? {}).length > 0) {
    storage.variables = {
      ...(options.variablesScope ? { defaultScope: parseScope(options.variablesScope, '--variables-scope') } : {}),
      ...(options.variablesVisibility ? { organizationVisibility: parseVisibility(options.variablesVisibility, '--variables-visibility') } : {}),
      ...(Object.keys(options.variableScope ?? {}).length > 0 ? { overrides: options.variableScope } : {}),
    };
  }
  if (options.secretsScope || options.secretsVisibility || Object.keys(options.secretScope ?? {}).length > 0) {
    storage.secrets = {
      ...(options.secretsScope ? { defaultScope: parseScope(options.secretsScope, '--secrets-scope') } : {}),
      ...(options.secretsVisibility ? { organizationVisibility: parseVisibility(options.secretsVisibility, '--secrets-visibility') } : {}),
      ...(Object.keys(options.secretScope ?? {}).length > 0 ? { overrides: options.secretScope } : {}),
    };
  }
  if (Object.keys(storage).length > 0) fromFlags.storage = storage;
  return mergeSetupOverrides(fromFile, fromFlags);
}

export function collectScope(value: string, previous: Record<string, SetupResourceScope>): Record<string, SetupResourceScope> {
  const separator = value.indexOf('=');
  if (separator <= 0) throw new Error('Scope overrides must use NAME=repository or NAME=organization syntax.');
  const name = value.slice(0, separator).trim();
  const scope = value.slice(separator + 1).trim().toLowerCase();
  if (!/^[A-Z][A-Z0-9_]*$/.test(name) || !['repository', 'organization'].includes(scope)) {
    throw new Error('Scope overrides must use an uppercase NAME and repository or organization scope.');
  }
  return { ...previous, [name]: scope as SetupResourceScope };
}

function parseScope(value: string, flag: string): 'repository' | 'organization' {
  const normalized = value.trim().toLowerCase();
  if (normalized !== 'repository' && normalized !== 'organization') throw new Error(`${flag} must be repository or organization.`);
  return normalized;
}

function parseVisibility(value: string, flag: string): 'all' | 'private' | 'selected' {
  const normalized = value.trim().toLowerCase();
  if (!['all', 'private', 'selected'].includes(normalized)) throw new Error(`${flag} must be selected, private, or all.`);
  return normalized as 'all' | 'private' | 'selected';
}
