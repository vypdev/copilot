import type { SetupConfiguration, SetupVariable } from '../../domain/setup';
import type { SetupImportedSetting, SetupOrganizationImportRequest, SetupOrganizationImportResult } from '../../domain/setup_organization_reuse';
import { parseIssueWorkflowProfile } from '../../domain/issue_workflow_profile';
import { parsePullRequestApprovalPolicy } from '../../domain/pull_request_approval_policy';
import { redactSensitiveText } from '../../domain/security/sensitive_text';
import { cloneSetupConfiguration } from './setup_configuration_clone_policy';
import { normalizeSetupStoredEmptyList } from './setup_organization_variable_reuse_policy';
import { validateSetupConfiguration } from './setup_configuration_validation';
import { SETUP_ORGANIZATION_VARIABLE_BINDINGS } from './setup_organization_variable_bindings';

interface InventoryValue { readonly variable: SetupVariable; readonly source: 'organization' | 'repository'; readonly duplicate: boolean; }

/** Reads typed configuration only. No provider, credential collection or write authority. */
export function importSetupOrganizationConfiguration(request: SetupOrganizationImportRequest): SetupOrganizationImportResult {
  let configuration = cloneSetupConfiguration(request.configuration);
  const settings: SetupImportedSetting[] = [];
  const answered = new Set<string>();
  const remote = request.remote;
  if (remote.ownerType === 'User') return { configuration, inventory: 'not-organization', settings, answeredQuestionIds: [] };
  if (remote.ownerType !== 'Organization' || remote.organizationVariablesAccess !== 'available' || remote.repositoryVariablesAccess !== 'available') {
    return { configuration, inventory: 'unavailable', settings, answeredQuestionIds: [] };
  }
  const organization = inventory(remote.organizationVariables);
  const repository = inventory(remote.repositoryVariables);
  const lookup = (name: string): InventoryValue | undefined => {
    const local = repository.get(name);
    return local ? { ...local, source: 'repository' } : organization.get(name);
  };
  const explicit = (path: string) => request.explicitQuestionIds?.some(id =>
    path === id || path.startsWith(`${id}.`) || id.startsWith(`${path}.`)) ?? false;
  const record = (questionId: string, value: InventoryValue, status: SetupImportedSetting['status'], reason?: SetupImportedSetting['reason']) => {
    settings.push({ questionId, variable: value.variable.name, source: explicit(questionId) ? 'explicit' : value.source, status, ...(reason ? { reason } : {}) });
  };
  const candidate = (path: string, value: InventoryValue, change: (draft: SetupConfiguration) => void, targetSpecific = false) => {
    if (explicit(path)) { record(path, value, 'preserved'); return; }
    if (value.duplicate) { record(path, value, 'needs-review', 'duplicate-inventory'); return; }
    if (value.variable.value.length > 30_000 || redactSensitiveText(value.variable.value) !== value.variable.value) {
      record(path, value, 'needs-review', 'invalid-value'); return;
    }
    try {
      const draft = cloneSetupConfiguration(configuration);
      change(draft);
      if (validateSetupConfiguration(draft, { allowIncompleteApproval: true }).length > 0) throw new Error('Invalid candidate.');
      configuration = draft;
      record(path, value, targetSpecific ? 'needs-review' : 'imported', targetSpecific ? 'target-specific' : undefined);
      if (!targetSpecific) answered.add(path);
    } catch { record(path, value, 'needs-review', 'invalid-value'); }
  };
  const profile = lookup('COPILOT_ISSUE_WORKFLOW_PROFILE');
  if (profile) candidate('issueWorkflows.enabled', profile, draft => {
    const parsed = parseIssueWorkflowProfile(profile.variable.value);
    if ('error' in parsed) throw new Error('Invalid profile.');
    if ((explicit('features.issues') && draft.features.issues === false)
      || (explicit('features.release') && draft.features.release !== parsed.profile.enabled.includes('release'))
      || (explicit('features.hotfix') && draft.features.hotfix !== parsed.profile.enabled.includes('hotfix'))) {
      throw new Error('The profile conflicts with reviewed capabilities.');
    }
    draft.issueWorkflows = { enabled: [...parsed.profile.enabled] };
    draft.features.release = parsed.profile.enabled.includes('release');
    draft.features.hotfix = parsed.profile.enabled.includes('hotfix');
  });
  for (const binding of SETUP_ORGANIZATION_VARIABLE_BINDINGS) {
    const value = lookup(binding.variable) ?? (binding.fallbackVariable ? lookup(binding.fallbackVariable) : undefined);
    if (!value) continue;
    const normalized = normalizeSetupStoredEmptyList(binding.variable, value.variable.value);
    if (binding.targetSpecific) {
      if (binding.variable === 'BUGBOT_AUTOFIX_VERIFY_COMMANDS' && normalized === '') {
        candidate(binding.path, value, draft => { draft.ai.bugbotFixVerifyCommands = ''; });
      } else if (binding.variable === 'MERGE_QUEUE_CHECK_ATTESTATIONS' && value.variable.value.trim() === '[]') {
        candidate(binding.path, value, draft => { draft.repository.mergeQueueCheckAttestations = []; });
      } else record(binding.path, value, explicit(binding.path) ? 'preserved' : 'needs-review', 'target-specific');
      continue;
    }
    if (binding.path === 'repository.mainBranch' && value.variable.value !== remote.defaultBranch) {
      record(binding.path, value, explicit(binding.path) ? 'preserved' : 'needs-review', 'target-specific'); continue;
    }
    if (binding.path.startsWith('projects.') && binding.path !== 'projects.ids' && normalized !== '') {
      record(binding.path, value, explicit(binding.path) ? 'preserved' : 'needs-review', 'target-specific'); continue;
    }
    const targetSpecific = binding.path === 'repository.developmentBranch'
      && value.variable.value !== request.observedDevelopmentBranch;
    candidate(binding.path, value, draft => {
      setKnownPath(draft, binding.path, parseScalar(normalized, readKnownPath(draft, binding.path)));
    }, targetSpecific || binding.path.startsWith('projects.') && !(binding.path === 'projects.ids' && normalized === ''));
  }
  const approval = lookup('PR_APPROVAL_POLICY');
  if (approval) candidate('pullRequestApproval', approval, draft => {
    const parsed = parsePullRequestApprovalPolicy(approval.variable.value);
    draft.pullRequestApproval = { ...parsed, targetRoles: [...parsed.targetRoles], branchKinds: [...parsed.branchKinds],
      additionalExcludedPaths: [...parsed.additionalExcludedPaths], testChecks: [], producerAttested: false,
      coverage: parsed.coverage.mode === 'numeric'
        ? { ...parsed.coverage, checkName: '', artifactWorkflowName: '', reporterAttested: false }
        : { mode: 'check', checkName: '' } };
  }, true);
  if (settings.some(setting => setting.status === 'imported' && setting.questionId.startsWith('agents.'))) {
    answered.add('agents.configureIndependently');
  }
  return { configuration, inventory: 'available', settings, answeredQuestionIds: [...answered] };
}

function inventory(variables: readonly SetupVariable[]): Map<string, InventoryValue> {
  const result = new Map<string, InventoryValue>();
  for (const variable of variables) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,99}$/u.test(variable.name)) continue;
    const name = variable.name.toUpperCase();
    result.set(name, { variable: { name, value: variable.value }, source: 'organization', duplicate: result.has(name) });
  }
  return result;
}

function readKnownPath(configuration: SetupConfiguration, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], configuration);
}

function setKnownPath(configuration: SetupConfiguration, path: string, value: string | number | boolean): void {
  const parts = path.split('.');
  const parent = parts.slice(0, -1).reduce<unknown>((current, key) => (current as Record<string, unknown>)[key], configuration);
  (parent as Record<string, unknown>)[parts[parts.length - 1]] = value;
}

function parseScalar(value: string, previous: unknown): string | number | boolean {
  if (typeof previous === 'boolean') {
    if (!/^(?:true|false)$/iu.test(value.trim())) throw new Error('Invalid boolean.');
    return value.trim().toLowerCase() === 'true';
  }
  if (typeof previous === 'number') {
    if (!/^\d+$/u.test(value.trim()) || !Number.isSafeInteger(Number(value))) throw new Error('Invalid integer.');
    return Number(value);
  }
  if (typeof previous !== 'string') throw new Error('Not a scalar setting.');
  return value;
}
