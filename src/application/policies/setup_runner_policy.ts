import type { SetupRemoteConfiguration } from '../../domain/setup';
import { DEFAULT_SETUP_RUNNERS, SETUP_RUNNER_REGISTRY, type SetupRunnerConfiguration, type SetupRunnerProfile,
  type SetupRunnerInventory, type SetupRunnerJobReview, type SetupRunnerRole, type SetupRunsOn } from '../../domain/setup_runner';
import { redactSensitiveText } from '../../domain/security/sensitive_text';

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));
const literal = (value: unknown, empty = false): value is string => typeof value === 'string' && value.length <= 100
  && (empty || value.trim().length > 0) && value === value.trim() && !/[\p{Cc}\p{Cf}${}<>]/u.test(value)
  && redactSensitiveText(value) === value;
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,49}$/u.test(value)
  && redactSensitiveText(value) === value;

export function validSetupRunnerProfile(value: unknown): value is SetupRunnerProfile {
  if (!object(value) || !exact(value, ['id', 'group', 'labels', 'validation']) || !id(value.id)
    || !literal(value.group, true) || !['hosted', 'agent'].includes(String(value.validation))
    || !Array.isArray(value.labels) || value.labels.length < 1 || value.labels.length > 10
    || !value.labels.every(label => literal(label))) return false;
  const labels = value.labels.map(label => label.toLowerCase());
  return new Set(labels).size === labels.length && labels.includes('self-hosted')
    && !labels.includes('windows') && (labels.includes('linux') || labels.includes('macos'));
}

export function parseSetupRunnerProfiles(value: string): readonly SetupRunnerProfile[] | undefined {
  if (value.length > 16_000) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!object(parsed) || !exact(parsed, ['schemaVersion', 'profiles']) || parsed.schemaVersion !== 1
      || !Array.isArray(parsed.profiles) || parsed.profiles.length < 1 || parsed.profiles.length > 10
      || !parsed.profiles.every(validSetupRunnerProfile)) return undefined;
    const profiles = parsed.profiles as SetupRunnerProfile[];
    if (new Set(profiles.map(profile => profile.id.toLowerCase())).size !== profiles.length) return undefined;
    return profiles.map(profile => ({ ...profile, labels: [...profile.labels] }));
  } catch { return undefined; }
}

/** A repository override shadows the organization registry even when it is invalid. */
export function setupRunnerRegistry(remote?: SetupRemoteConfiguration): {
  readonly profiles: readonly SetupRunnerProfile[]; readonly status: 'available' | 'missing' | 'invalid' | 'unavailable';
  readonly source?: SetupRunnerConfiguration['source'];
  readonly scope?: 'repository' | 'organization';
} {
  // Unknown repository inventory cannot prove that a higher-priority override is absent.
  // A readable organization registry alone must not authorize selecting or reusing its route.
  if (!remote || remote.repositoryVariablesAccess !== 'available') return { profiles: [], status: 'unavailable' };
  const repository = remote.repositoryVariables.filter(variable => variable.name.toUpperCase() === SETUP_RUNNER_REGISTRY);
  const organization = remote.organizationVariables.filter(variable => variable.name.toUpperCase() === SETUP_RUNNER_REGISTRY);
  const entries = repository.length ? repository : organization;
  if (!repository.length && remote.organizationVariablesAccess !== 'available') return { profiles: [], status: 'unavailable' };
  if (!entries.length) return { profiles: [], status: 'missing' };
  const profiles = entries.length === 1 ? parseSetupRunnerProfiles(entries[0].value) : undefined;
  const scope = repository.length ? 'repository' as const : 'organization' as const;
  return profiles ? { profiles, status: 'available', scope, source: { scope, value: entries[0].value } }
    : { profiles: [], status: 'invalid', scope };
}

export function validateSetupRunners(value: unknown): readonly string[] {
  if (value === undefined) return [];
  const invalid = ['Runner configuration is invalid. Choose retain/hosted, or an exact Linux/macOS self-hosted profile; review group, unique labels and registry version.'];
  if (!object(value) || !exact(value, ['mode', 'profileId', 'group', 'labels', 'validation', 'source', 'discover'])
    || value.discover !== undefined && typeof value.discover !== 'boolean'
    || !['retain', 'hosted', 'organization-profile', 'manual-self-hosted'].includes(String(value.mode))
    || !literal(value.group, true) || typeof value.profileId !== 'string'
    || !Array.isArray(value.labels) || !['hosted', 'agent'].includes(String(value.validation))) return invalid;
  if (value.mode === 'retain' || value.mode === 'hosted') return value.group === '' && value.profileId === ''
    && value.labels.length === 0 && value.validation === 'hosted' && value.source === undefined ? [] : invalid;
  if (!validSetupRunnerProfile({ id: value.profileId || 'manual', group: value.group, labels: value.labels, validation: value.validation })) return invalid;
  if (value.mode === 'manual-self-hosted') return value.profileId === '' && value.source === undefined ? [] : invalid;
  if (!id(value.profileId) || !object(value.source) || !exact(value.source, ['scope', 'value'])
    || !['repository', 'organization'].includes(String(value.source.scope)) || typeof value.source.value !== 'string') return invalid;
  const selected = parseSetupRunnerProfiles(value.source.value)?.find(profile => profile.id === value.profileId);
  return selected && selected.group === value.group && selected.validation === value.validation
    && JSON.stringify(selected.labels) === JSON.stringify(value.labels) ? [] : invalid;
}

export function selectSetupRunnerMode(mode: SetupRunnerConfiguration['mode']): SetupRunnerConfiguration {
  return mode === 'manual-self-hosted'
    ? { mode, profileId: '', group: '', labels: ['self-hosted', 'Linux'], validation: 'hosted' }
    : { ...DEFAULT_SETUP_RUNNERS, mode, labels: [] };
}

export function setupRunnerProfileIsFresh(configuration: SetupRunnerConfiguration | undefined, remote: SetupRemoteConfiguration): boolean {
  if (configuration?.mode !== 'organization-profile') return true;
  const registry = setupRunnerRegistry(remote);
  return registry.status === 'available' && registry.source?.scope === configuration.source?.scope
    && registry.source?.value === configuration.source?.value;
}

/** A prior target supplies visible defaults only; registry overrides resolve again for this target. */
export function reusableSetupRunnerDefaults(previous: SetupRunnerConfiguration | undefined, remote: SetupRemoteConfiguration): SetupRunnerConfiguration | undefined {
  if (!previous || previous.mode === 'retain') return undefined;
  if (previous.mode === 'organization-profile') {
    const registry = setupRunnerRegistry(remote); const profile = registry.profiles.find(profile => profile.id === previous.profileId);
    if (!profile) return undefined;
    return { mode: previous.mode, profileId: profile.id, group: profile.group, labels: [...profile.labels], validation: profile.validation, source: registry.source,
      ...(previous.discover !== undefined ? { discover: previous.discover } : {}) };
  }
  return { ...previous, labels: [...previous.labels] };
}

/** Security roles are fixed by the template catalog, never guessed from user job names. */
export function setupRunnerRole(file: string, job: string): SetupRunnerRole | undefined {
  const agentJobs: Readonly<Record<string, string>> = {
    'copilot_issue.yml': 'copilot-issues', 'copilot_issue_comment.yml': 'copilot-issues',
    'copilot_pull_request.yml': 'copilot-pull-requests', 'copilot_pull_request_comment.yml': 'copilot-pull-requests',
    'copilot_commit.yml': 'copilot-commits', 'agent-cli-provisioning.yml': 'verify-agent-clis',
  };
  if (file === 'copilot_issue.yml' && job === 'issue-admission') return 'isolated';
  if (agentJobs[file] === job) return 'agent';
  if (file === 'copilot_pull_request_approval.yml' && job === 'observe-approval') return 'observer';
  if (file === 'copilot_pull_request_merge_queue.yml' && job === 'copilot-pull-request-required-check') return 'isolated';
  if (['release_workflow.yml', 'hotfix_workflow.yml'].includes(file)) {
    if (job === 'candidate-preflight') return 'isolated';
    if (['publish', 'publish-npm'].includes(job)) return 'publication';
    if (['validate', 'prepare-version-files', 'promote', 'resume-reconciliation', 'report-failure'].includes(job)) return 'validation';
  }
  const helperJobs: Readonly<Record<string, readonly string[]>> = {
    'copilot_branch_sync.yml': ['branch-sync'], 'copilot_close_inactive_issues.yml': ['copilot-inactive-issues'],
    'copilot_pull_request_review_state.yml': ['copilot-pull-request-review-state'],
    'copilot_deployment_orchestration.yml': ['resolve-operation', 'mutate'],
    'copilot_credential_health.yml': ['verify-pat', 'verify-openai', 'verify-anthropic', 'verify-google', 'verify-openrouter', 'verify-cursor', 'verify-opencode', 'verify-codex-api-key'],
  };
  return helperJobs[file]?.includes(job) ? file === 'copilot_credential_health.yml' ? 'credential-health' : 'validation' : undefined;
}

export function selectedSetupRunsOn(configuration: SetupRunnerConfiguration | undefined, role: SetupRunnerRole | undefined): SetupRunsOn | undefined {
  if (!configuration || configuration.mode === 'retain' || role === undefined
    || ['observer', 'publication', 'isolated'].includes(role)) return undefined;
  if (role === 'credential-health') return 'ubuntu-latest';
  if (configuration.mode === 'hosted' || role === 'validation' && configuration.validation === 'hosted') return 'ubuntu-latest';
  return configuration.group ? { group: configuration.group, labels: [...configuration.labels] } : [...configuration.labels];
}

export function setupRunnerReadiness(route: SetupRunsOn, inventory?: SetupRunnerInventory): SetupRunnerJobReview['status'] {
  if (JSON.stringify(route).includes('${{')) return 'access-unknown';
  const group = typeof route === 'object' && !Array.isArray(route) ? (route as { group?: string }).group : undefined;
  const raw = typeof route === 'string' || Array.isArray(route) ? route : (route as { labels?: string | readonly string[] }).labels;
  const labels = (typeof raw === 'string' ? [raw] : raw ?? []).map(label => label.toLowerCase());
  if (!group && labels.length === 1 && /^(ubuntu|macos|windows)-(latest|[0-9][a-z0-9.-]*)$/u.test(labels[0])) return 'hosted';
  if (!inventory || inventory.status !== 'available') return 'access-unknown';
  const matches = inventory.candidates.filter(candidate => (!group || candidate.group === group)
    && labels.every(label => candidate.labels.some(actual => actual.toLowerCase() === label)));
  if (!matches.length) return group && inventory.groups.some(candidate => candidate.name === group && candidate.access === 'confirmed')
    ? 'unavailable' : 'access-unknown';
  const authorized = matches.filter(candidate => candidate.access === 'confirmed');
  if (!authorized.length) return 'access-unknown';
  return authorized.some(candidate => candidate.status === 'online' && !candidate.busy) ? 'ready' : 'pending-capacity';
}
