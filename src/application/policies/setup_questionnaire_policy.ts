import type { AgentTask } from '../../domain/agent';
import type { SetupConfiguration, SetupResourceStoragePolicy } from '../../domain/setup';
import type {
  SetupQuestion,
  SetupQuestionnaireContext,
  SetupQuestionnaireEvent,
  SetupQuestionnaireState,
  SetupQuestionnaireStateId,
} from '../../domain/setup_questionnaire';
import { cloneSetupConfiguration } from './setup_configuration_clone_policy';
import { SETUP_AGENT_TASKS, SETUP_FEATURE_DESCRIPTIONS } from './setup_configuration_defaults';

const AGENT_PROVIDERS = ['codex', 'opencode', 'cursor'] as const;
const MODEL_PROVIDERS = ['openai', 'anthropic', 'google', 'openrouter', 'opencode', 'local'] as const;

interface QuestionDefinition {
  readonly stateId: SetupQuestion['stateId'];
  readonly id: string;
  readonly label: string;
  readonly kind: SetupQuestion['kind'];
  readonly choices?: readonly string[];
  readonly applies?: (draft: SetupConfiguration, independently: boolean, context: SetupQuestionnaireContext) => boolean;
  readonly read?: (draft: SetupConfiguration) => string | number | boolean;
}

export function createSetupQuestionnaire(
  configuration: SetupConfiguration,
  context: SetupQuestionnaireContext = {},
): SetupQuestionnaireState {
  const draft = cloneSetupConfiguration(configuration);
  const question = questions(draft, false, context)[0];
  return { stateId: question.stateId, draft, question, terminal: 'collecting', configureIndependently: false };
}

export function createSetupReviewState(configuration: SetupConfiguration): SetupQuestionnaireState {
  return {
    stateId: 'review',
    draft: cloneSetupConfiguration(configuration),
    terminal: 'review',
    configureIndependently: false,
  };
}

export function transitionSetupQuestionnaire(
  state: SetupQuestionnaireState,
  event: SetupQuestionnaireEvent,
  context: SetupQuestionnaireContext = {},
): SetupQuestionnaireState {
  if (state.terminal !== 'collecting' || !state.question) return state;
  if (event.kind === 'cancel' || event.kind === 'end-of-input') {
    return {
      stateId: 'cancelled',
      draft: cloneSetupConfiguration(state.draft),
      terminal: 'cancelled',
      configureIndependently: state.configureIndependently,
    };
  }
  const parsed = parseAnswer(state.question, event.value);
  if ('error' in parsed) {
    return {
      ...state,
      draft: cloneSetupConfiguration(state.draft),
      validation: parsed.error,
    };
  }
  const configureIndependently = state.question.id === 'agents.configureIndependently'
    ? Boolean(parsed.value)
    : state.configureIndependently;
  const draft = applyAnswer(state.draft, state.question, parsed.value);
  const nextQuestions = questions(draft, configureIndependently, context);
  const nextIndex = nextQuestions.findIndex((question) => question.id === state.question?.id);
  const next = nextQuestions[nextIndex + 1];
  return next
    ? {
        stateId: next.stateId,
        draft,
        question: next,
        terminal: 'collecting',
        configureIndependently,
      }
    : { stateId: 'review', draft, terminal: 'review', configureIndependently };
}

export function enterSetupConfirmation(state: SetupQuestionnaireState): SetupQuestionnaireState {
  if (state.terminal !== 'review') throw new Error('Setup confirmation requires a reviewed questionnaire.');
  return { ...state, stateId: 'confirmation', terminal: 'confirmation', draft: cloneSetupConfiguration(state.draft) };
}

export function finishSetupQuestionnaire(
  state: SetupQuestionnaireState,
  approved: boolean,
): SetupQuestionnaireState {
  if (state.terminal !== 'confirmation') throw new Error('Setup can finish only from confirmation.');
  return {
    stateId: approved ? 'completed' : 'cancelled',
    draft: cloneSetupConfiguration(state.draft),
    terminal: approved ? 'completed' : 'cancelled',
    configureIndependently: state.configureIndependently,
  };
}

export function setupQuestionnaireStateLabel(stateId: SetupQuestionnaireStateId): string {
  return ({
    capabilities: 'Capabilities',
    'agent-runtime': 'Agent runtimes',
    'agent-model-defaults': 'Default agent model',
    'agent-role-overrides': 'Per-role agent models',
    repository: 'Repository behavior',
    deployment: 'Release and hotfix orchestration',
    bugbot: 'Bugbot and AI',
    projects: 'Projects',
    provisioning: 'Provisioning',
    storage: 'GitHub Actions resource storage',
    review: 'Review',
    confirmation: 'Confirmation',
    completed: 'Completed',
    cancelled: 'Cancelled',
  })[stateId];
}

function questions(
  draft: SetupConfiguration,
  independently: boolean,
  context: SetupQuestionnaireContext,
): SetupQuestion[] {
  return definitions().filter((definition) => definition.applies?.(draft, independently, context) ?? true)
    .map((definition) => toQuestion(definition, draft, context));
}

function definitions(): readonly QuestionDefinition[] {
  return [
    ...Object.entries(SETUP_FEATURE_DESCRIPTIONS).map(([feature, label]): QuestionDefinition => ({
      stateId: 'capabilities', id: `features.${feature}`, label, kind: 'boolean',
    })),
    ...SETUP_AGENT_TASKS.map((task): QuestionDefinition => ({
      stateId: 'agent-runtime', id: `agents.${task}.provider`, label: `${formatTask(task)} runtime`, kind: 'choice', choices: AGENT_PROVIDERS,
    })),
    { stateId: 'agent-model-defaults', id: 'agents.findings.modelProvider', label: 'Model provider for all tasks', kind: 'choice', choices: MODEL_PROVIDERS },
    { stateId: 'agent-model-defaults', id: 'agents.findings.model', label: 'Model name for all tasks', kind: 'text' },
    { stateId: 'agent-model-defaults', id: 'agents.findings.effort', label: 'Reasoning effort for all tasks (empty uses provider default)', kind: 'text' },
    { stateId: 'agent-model-defaults', id: 'agents.findings.executable', label: 'Validated executable for all tasks (empty uses the manifest basename)', kind: 'text' },
    { stateId: 'agent-model-defaults', id: 'agents.configureIndependently', label: 'Configure model provider, model, effort, and executable independently for every task?', kind: 'boolean', read: () => false },
    ...SETUP_AGENT_TASKS.filter((task) => task !== 'findings').flatMap((task) => agentOverrideQuestions(task)),
    ...repositoryQuestions(),
    ...deploymentQuestions(),
    ...bugbotQuestions(),
    { stateId: 'projects', id: 'projects.ids', label: 'GitHub Project IDs (comma-separated, empty skips integration)', kind: 'text' },
    ...['issueCreatedColumn', 'pullRequestCreatedColumn', 'issueInProgressColumn', 'pullRequestInProgressColumn'].map((field): QuestionDefinition => ({
      stateId: 'projects', id: `projects.${field}`, label: projectLabel(field), kind: 'text', applies: (config) => Boolean(config.projects.ids.trim()),
    })),
    { stateId: 'provisioning', id: 'createInitialTag', label: 'Create v1.0.0 when no version tag exists?', kind: 'boolean' },
    { stateId: 'provisioning', id: 'manageRepositoryVariables', label: 'Create/update GitHub Actions Variables?', kind: 'boolean' },
    { stateId: 'provisioning', id: 'manageRepositorySecrets', label: 'Validate and provision required GitHub Actions Secrets?', kind: 'boolean' },
    ...storageQuestions('variables'),
    ...storageQuestions('secrets'),
  ];
}

function agentOverrideQuestions(task: AgentTask): QuestionDefinition[] {
  const applies = (_draft: SetupConfiguration, independently: boolean) => independently;
  return [
    { stateId: 'agent-role-overrides', id: `agents.${task}.modelProvider`, label: `${formatTask(task)} model provider`, kind: 'choice', choices: MODEL_PROVIDERS, applies },
    { stateId: 'agent-role-overrides', id: `agents.${task}.model`, label: `${formatTask(task)} model`, kind: 'text', applies },
    { stateId: 'agent-role-overrides', id: `agents.${task}.effort`, label: `${formatTask(task)} effort (empty uses provider default)`, kind: 'text', applies },
    { stateId: 'agent-role-overrides', id: `agents.${task}.executable`, label: `${formatTask(task)} executable (empty uses the manifest basename)`, kind: 'text', applies },
  ];
}

function repositoryQuestions(): QuestionDefinition[] {
  return [
    ['mainBranch', 'Production branch', 'text'],
    ['developmentBranch', 'Development branch', 'text'],
    ['featureTree', 'Feature branch prefix', 'text'],
    ['bugfixTree', 'Bugfix branch prefix', 'text'],
    ['hotfixTree', 'Hotfix branch prefix', 'text'],
    ['releaseTree', 'Release branch prefix', 'text'],
    ['docsTree', 'Documentation branch prefix', 'text'],
    ['choreTree', 'Chore branch prefix', 'text'],
    ['branchManagementAlways', 'Create/manage branches without the branched label?', 'boolean'],
    ['reopenIssueOnPush', 'Reopen closed issues when a related branch receives a push?', 'boolean'],
    ['desiredAssigneesCount', 'Desired issue assignees (0 disables automatic assignment)', 'number'],
    ['desiredReviewersCount', 'Desired pull-request reviewers (0 disables automatic assignment)', 'number'],
    ['inactivityThresholdHours', 'Hours without activity before closing a waiting issue', 'number'],
    ['issueLocale', 'Issue comment locale', 'text'],
    ['pullRequestLocale', 'Pull-request comment locale', 'text'],
    ['commitPrefixTransforms', 'Commit prefix transforms', 'text'],
  ].map(([field, label, kind]) => ({ stateId: 'repository', id: `repository.${field}`, label, kind })) as QuestionDefinition[];
}

function deploymentQuestions(): QuestionDefinition[] {
  return [
    choice('releaseReconciliationStrategy', 'Release reconciliation strategy', ['production-lineage', 'canonical-gitflow', 'manual']),
    choice('hotfixReconciliationStrategy', 'Hotfix reconciliation strategy', ['production-lineage', 'canonical-gitflow', 'manual']),
    choice('reconciliationPullRequestMode', 'Managed reconciliation PR mode', ['auto', 'auto-merge', 'merge-queue', 'create-only']),
    choice('reconciliationBackmergeMode', 'Reconciliation back-merge mode', ['auto', 'direct', 'sync-branch']),
    choice('hotfixActiveReleasePolicy', 'Hotfix target while a release is active', ['prefer-release', 'development', 'both']),
    { stateId: 'deployment', id: 'repository.reconciliationTree', label: 'Reconciliation branch prefix', kind: 'text' },
    choice('reconciliationCleanup', 'Branch cleanup after reconciliation', ['all', 'source-only', 'sync-only', 'none']),
    choice('reconciliationIssueCompletion', 'Launcher issue behavior after reconciliation', ['close', 'keep-open']),
    choice('orchestrationPresentationMode', 'Release control-center detail', ['guided', 'compact', 'quiet']),
    { stateId: 'deployment', id: 'repository.orchestrationDiagrams', label: 'Show accessible Mermaid release diagrams?', kind: 'boolean' },
    choice('orchestrationCommentMode', 'Release lifecycle comment mode', ['update', 'milestones']),
  ];
}

function bugbotQuestions(): QuestionDefinition[] {
  return [
    { stateId: 'bugbot', id: 'ai.pullRequestDescriptionMode', label: 'Pull-request description mode', kind: 'choice', choices: ['replace', 'append', 'preserve', 'disabled'] },
    { stateId: 'bugbot', id: 'ai.ignoreFiles', label: 'AI ignore file patterns (comma-separated)', kind: 'text' },
    { stateId: 'bugbot', id: 'ai.membersOnly', label: 'Restrict AI processing to repository members?', kind: 'boolean' },
    { stateId: 'bugbot', id: 'ai.includeReasoning', label: 'Include concise provider explanation metadata?', kind: 'boolean' },
    { stateId: 'bugbot', id: 'ai.bugbotSeverity', label: 'Minimum Bugbot severity to publish', kind: 'choice', choices: ['info', 'low', 'medium', 'high'] },
    { stateId: 'bugbot', id: 'ai.bugbotCommentLimit', label: 'Maximum Bugbot comments per run', kind: 'number' },
    { stateId: 'bugbot', id: 'ai.bugbotFixVerifyCommands', label: 'Bugbot autofix verification commands (comma-separated)', kind: 'text' },
    { stateId: 'bugbot', id: 'ai.bugbotDryRun', label: 'Run Bugbot in analysis-only dry-run mode?', kind: 'boolean' },
    { stateId: 'bugbot', id: 'ai.bugbotEffort', label: 'Bugbot review effort', kind: 'choice', choices: ['smart', 'low', 'default', 'high'] },
    { stateId: 'bugbot', id: 'ai.bugbotReviewDrafts', label: 'Review draft pull requests?', kind: 'boolean' },
    { stateId: 'bugbot', id: 'ai.bugbotTraceRules', label: 'Include applied rule sources in review summaries?', kind: 'boolean' },
    { stateId: 'bugbot', id: 'ai.bugbotSuggestedChanges', label: 'Publish safe inline suggested changes?', kind: 'boolean' },
    { stateId: 'bugbot', id: 'ai.bugbotTelemetry', label: 'Emit content-free Bugbot telemetry?', kind: 'boolean' },
    { stateId: 'bugbot', id: 'ai.bugbotFailOnUnresolved', label: 'Fail the workflow check while findings remain unresolved?', kind: 'boolean' },
    { stateId: 'bugbot', id: 'ai.bugbotOrganizationRules', label: 'Organization Bugbot rules (newline-separated)', kind: 'text' },
    { stateId: 'bugbot', id: 'ai.provisioningMode', label: 'Agent CLI provisioning mode', kind: 'choice', choices: ['auto', 'always', 'disabled'] },
  ];
}

function storageQuestions(kind: 'variables' | 'secrets'): QuestionDefinition[] {
  const label = kind === 'variables' ? 'Variables' : 'Secrets';
  return [
    {
      stateId: 'storage', id: `storage.${kind}.defaultScope`, label: `Default ${label} scope`, kind: 'choice', choices: ['repository', 'organization'],
      applies: (draft) => managesResource(draft, kind),
    },
    {
      stateId: 'storage', id: `storage.${kind}.organizationVisibility`, label: `Organization ${label} visibility`, kind: 'choice', choices: ['selected', 'private', 'all'],
      applies: (draft) => managesResource(draft, kind) && storageNeedsOrganization(draft.storage[kind]),
    },
    {
      stateId: 'storage', id: `storage.${kind}.preserveExisting`, label: `Preserve effective existing ${label}?`, kind: 'boolean',
      applies: (draft) => managesResource(draft, kind),
    },
    {
      stateId: 'storage', id: `storage.${kind}.overrides`, label: `Inherited ${label} to override at repository scope (comma-separated)`, kind: 'scope-overrides',
      applies: (draft, _independent, context) => managesResource(draft, kind) && inheritedNames(kind, draft, context).length > 0,
    },
  ];
}

function choice(field: string, label: string, choices: readonly string[]): QuestionDefinition {
  return { stateId: 'deployment', id: `repository.${field}`, label, kind: 'choice', choices };
}

function toQuestion(definition: QuestionDefinition, draft: SetupConfiguration, context: SetupQuestionnaireContext): SetupQuestion {
  const allowedNames = definition.kind === 'scope-overrides'
    ? inheritedNames(definition.id.includes('.variables.') ? 'variables' : 'secrets', draft, context)
    : undefined;
  return {
    stateId: definition.stateId,
    id: definition.id,
    label: definition.label,
    kind: definition.kind,
    defaultValue: definition.read?.(draft) ?? readPath(draft, definition.id, allowedNames),
    ...(definition.choices ? { choices: definition.choices } : {}),
    ...(allowedNames ? { allowedNames } : {}),
  };
}

function readPath(
  configuration: SetupConfiguration,
  path: string,
  allowedNames?: readonly string[],
): string | number | boolean {
  const value = path.split('.').reduce<unknown>((current, key) =>
    (current as Record<string, unknown>)[key], configuration);
  if (path.endsWith('.overrides')) {
    const overrides = value as Record<string, string> | undefined;
    return allowedNames!.filter((name) => overrides?.[name] === 'repository').join(',');
  }
  return value as string | number | boolean;
}

function parseAnswer(question: SetupQuestion, raw: string): { value: string | number | boolean | Record<string, string> } | { error: string } {
  const input = raw.normalize('NFKC').trim();
  if (!input && question.kind !== 'scope-overrides') return { value: question.defaultValue };
  if (question.kind === 'text') return { value: input };
  if (question.kind === 'number') {
    const number = Number(input);
    return Number.isSafeInteger(number) && number >= 0
      ? { value: number }
      : { error: 'Enter a non-negative whole number.' };
  }
  if (question.kind === 'boolean') {
    if (['y', 'yes', 'true', '1'].includes(input.toLowerCase())) return { value: true };
    if (['n', 'no', 'false', '0'].includes(input.toLowerCase())) return { value: false };
    return { error: 'Enter yes or no.' };
  }
  if (question.kind === 'choice') {
    const numeric = Number(input) - 1;
    const choice = Number.isInteger(numeric) && question.choices?.[numeric]
      ? question.choices[numeric]
      : question.choices?.find((candidate) => candidate.toLowerCase() === input.toLowerCase());
    return choice ? { value: choice } : { error: 'Select one of the listed options.' };
  }
  const scopeInput = input || String(question.defaultValue);
  const requested = (scopeInput.toLowerCase() === 'none' ? '' : scopeInput)
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const unknown = requested.filter((name) => !question.allowedNames?.includes(name));
  if (unknown.length > 0) return { error: `Unknown inherited resource name(s): ${unknown.join(', ')}.` };
  return { value: Object.fromEntries(requested.map((name) => [name, 'repository'])) };
}

function applyAnswer(
  configuration: SetupConfiguration,
  question: SetupQuestion,
  value: string | number | boolean | Record<string, string>,
): SetupConfiguration {
  const draft = cloneSetupConfiguration(configuration);
  if (question.id === 'agents.configureIndependently') return draft;
  if (['agents.findings.modelProvider', 'agents.findings.model', 'agents.findings.effort', 'agents.findings.executable'].includes(question.id)) {
    const field = question.id.split('.')[2] as 'modelProvider' | 'model' | 'effort' | 'executable';
    for (const task of SETUP_AGENT_TASKS) draft.agents[task] = { ...draft.agents[task], [field]: value as string };
    return draft;
  }
  const parts = question.id.split('.');
  let target: Record<string, unknown> = draft as unknown as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) target = target[part] as Record<string, unknown>;
  target[parts.at(-1) as string] = question.kind === 'scope-overrides'
    ? replaceInheritedOverrides(
        target[parts.at(-1) as string] as Record<string, string>,
        question.allowedNames!,
        value as Record<string, string>,
      )
    : value;
  return draft;
}

function inheritedNames(
  kind: 'variables' | 'secrets',
  draft: SetupConfiguration,
  context: SetupQuestionnaireContext,
): string[] {
  const remote = context.remote;
  if (!remote || draft.storage[kind].defaultScope !== 'repository') return [];
  const organization = kind === 'secrets'
    ? remote.organizationSecrets
    : remote.organizationVariables.map((variable) => variable.name);
  const repository = new Set(kind === 'secrets'
    ? remote.repositorySecrets
    : remote.repositoryVariables.map((variable) => variable.name));
  const configuredNames = kind === 'secrets' ? context.secretNames : context.variableNames;
  const configured = new Set(configuredNames ?? organization);
  return organization.filter((name) => configured.has(name) && !repository.has(name)).sort();
}

function replaceInheritedOverrides(
  current: Readonly<Record<string, string>>,
  inherited: readonly string[],
  requested: Readonly<Record<string, string>>,
): Record<string, string> {
  const inheritedNames = new Set(inherited);
  return {
    ...Object.fromEntries(Object.entries(current).filter(([name]) => !inheritedNames.has(name))),
    ...requested,
  };
}

function storageNeedsOrganization(policy: SetupResourceStoragePolicy): boolean {
  return policy.defaultScope === 'organization' || Object.values(policy.overrides).includes('organization');
}

function managesResource(configuration: SetupConfiguration, kind: 'variables' | 'secrets'): boolean {
  return kind === 'variables' ? configuration.manageRepositoryVariables : configuration.manageRepositorySecrets;
}

function formatTask(task: string): string {
  return task.charAt(0).toUpperCase() + task.slice(1);
}

function projectLabel(field: string): string {
  return ({
    issueCreatedColumn: 'Project column for new issues',
    pullRequestCreatedColumn: 'Project column for new pull requests',
    issueInProgressColumn: 'Project column for issues in progress',
    pullRequestInProgressColumn: 'Project column for pull requests in progress',
  } as Record<string, string>)[field];
}
