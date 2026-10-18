import type { SetupConfiguration } from '../../domain/setup';
import type { SetupQuestion, SetupQuestionnaireContext } from '../../domain/setup_questionnaire';
import { DEFAULT_SETUP_RUNNERS, type SetupRunnerConfiguration } from '../../domain/setup_runner';
import { selectSetupRunnerMode, setupRunnerRegistry, validSetupRunnerProfile } from './setup_runner_policy';

export function setupRunnerQuestions() {
  const manual = (draft: SetupConfiguration) => draft.runners?.mode === 'manual-self-hosted';
  return [
    { stateId: 'agent-runtime' as const, id: 'runners.discover', label: 'Discover existing runners and groups (optional read-only PAT permissions)?', kind: 'boolean' as const,
      read: (draft: SetupConfiguration) => draft.runners?.discover ?? false },
    { stateId: 'agent-runtime' as const, id: 'runners.mode', label: 'Where should Copilot jobs run?', kind: 'choice' as const,
      choices: ['retain', 'hosted', 'organization-profile', 'manual-self-hosted'], read: (draft: SetupConfiguration) => draft.runners?.mode ?? 'retain' },
    { stateId: 'agent-runtime' as const, id: 'runners.profileId', label: 'Reusable runner profile', kind: 'choice' as const,
      applies: (draft: SetupConfiguration) => draft.runners?.mode === 'organization-profile' },
    { stateId: 'agent-runtime' as const, id: 'runners.group', label: 'Existing runner group (empty selects by labels)', kind: 'text' as const, applies: manual },
    { stateId: 'agent-runtime' as const, id: 'runners.labels', label: 'Exact runner labels, comma-separated (include self-hosted and Linux or macOS)', kind: 'text' as const,
      read: (draft: SetupConfiguration) => draft.runners!.labels.join(','), applies: manual },
    { stateId: 'agent-runtime' as const, id: 'runners.validation', label: 'Ordinary validation jobs: hosted, or the selected agent runner?', kind: 'choice' as const,
      choices: ['hosted', 'agent'], applies: manual },
  ];
}

export function setupRunnerQuestion(question: SetupQuestion, context: SetupQuestionnaireContext): SetupQuestion {
  if (!question.id.startsWith('runners.') || question.id === 'runners.discover') return question;
  const registry = setupRunnerRegistry(context.remote);
  return { ...question, runnerProfiles: registry.profiles, runnerRegistryStatus: registry.status, runnerRegistryScope: registry.scope, runnerInventory: context.runnerInventory,
    ...(question.id === 'runners.mode' ? { choices: ['retain', 'hosted', ...(registry.status === 'available' ? ['organization-profile'] : []), 'manual-self-hosted'] } : {}),
    ...(question.id === 'runners.profileId' ? { choices: registry.profiles.map(profile => profile.id) } : {}) };
}

export function applySetupRunnerAnswer(configuration: SetupConfiguration, question: SetupQuestion,
  input: string, context: SetupQuestionnaireContext): { readonly configuration?: SetupConfiguration; readonly error?: string } {
  const current = configuration.runners ?? DEFAULT_SETUP_RUNNERS;
  let runners: SetupRunnerConfiguration;
  if (question.id === 'runners.discover') {
    return { configuration: { ...configuration, runners: { ...current, discover: input === 'true' } } };
  } else if (question.id === 'runners.mode') {
    const mode = input as SetupRunnerConfiguration['mode'];
    if (mode === 'organization-profile') {
      const registry = setupRunnerRegistry(context.remote);
      const profile = registry.profiles.find(profile => profile.id === current.profileId) ?? registry.profiles[0];
      if (!profile) return { error: 'No valid effective runner registry is available. Enter an exact manual profile or repair COPILOT_RUNNER_PROFILES.' };
      runners = { mode, profileId: profile.id, group: profile.group, labels: [...profile.labels], validation: profile.validation, source: registry.source };
    } else runners = selectSetupRunnerMode(mode);
  } else if (question.id === 'runners.profileId') {
    const registry = setupRunnerRegistry(context.remote); const profile = registry.profiles.find(profile => profile.id === input);
    if (!profile) return { error: 'The selected runner profile is unavailable. Review the registry or enter a manual profile.' };
    runners = { mode: 'organization-profile', profileId: profile.id, group: profile.group, labels: [...profile.labels], validation: profile.validation, source: registry.source };
  } else if (question.id === 'runners.labels') {
    const labels = input.split(',').map(label => label.trim());
    if (!validSetupRunnerProfile({ id: 'manual', group: current.group, labels, validation: current.validation })) {
      return { error: 'Use 1–10 unique literal labels including self-hosted and Linux or macOS. Expressions and Windows service routes are unsupported.' };
    }
    runners = { ...current, labels };
  } else if (question.id === 'runners.group') {
    if (!validSetupRunnerProfile({ id: 'manual', group: input, labels: current.labels, validation: current.validation })) {
      return { error: 'Enter an existing literal runner group of at most 100 characters, or leave it empty. Expressions and control characters are unsupported.' };
    }
    runners = { ...current, group: input };
  } else runners = { ...current, validation: input as SetupRunnerConfiguration['validation'] };
  return { configuration: { ...configuration, runners: { ...runners,
    ...(current.discover !== undefined ? { discover: current.discover } : {}) } } };
}
