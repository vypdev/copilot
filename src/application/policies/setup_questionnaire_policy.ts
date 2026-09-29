import type { AgentTask } from '../../domain/agent';
import type { SetupConfiguration, SetupResourceStoragePolicy } from '../../domain/setup';
import type {
  SetupQuestion,
  SetupQuestionnaireContext,
  SetupQuestionnaireEvent,
  SetupQuestionnaireState,
  SetupQuestionnaireStateId,
  SetupQuestionnaireProgress,
} from '../../domain/setup_questionnaire';
import { cloneSetupConfiguration } from './setup_configuration_clone_policy';
import { createDefaultSetupConfiguration, SETUP_AGENT_TASKS, SETUP_FEATURE_DESCRIPTIONS } from './setup_configuration_defaults';
import { ISSUE_WORKFLOW_KINDS, ISSUE_WORKFLOW_CATALOG, createIssueWorkflowProfile, type IssueWorkflowKind } from '../../domain/issue_workflow_profile';
import { parseSetupProjectSelection, sharedProjectStatusOptions } from './setup_project_selection_policy';

const AGENT_PROVIDERS = ['codex', 'opencode', 'cursor'] as const;
const MODEL_PROVIDERS = ['openai', 'anthropic', 'google', 'openrouter', 'opencode', 'local'] as const;
const PERMISSION_INTENT_QUESTION_IDS = new Set([
  'features.issues', 'features.pullRequests', 'issueWorkflows.enabled',
  'pullRequestApproval.mode', 'projects.enabled', 'createInitialTag',
  'manageRepositoryVariables', 'manageRepositorySecrets',
  'storage.variables.defaultScope', 'storage.variables.preserveExisting',
  'storage.secrets.defaultScope', 'storage.secrets.preserveExisting',
]);

interface QuestionDefinition {
  readonly stateId: SetupQuestion['stateId'];
  readonly id: string;
  readonly label: string;
  readonly kind: SetupQuestion['kind'];
  readonly choices?: readonly string[];
  readonly applies?: (draft: SetupConfiguration, independently: boolean, context: SetupQuestionnaireContext) => boolean;
  readonly read?: (draft: SetupConfiguration, context: SetupQuestionnaireContext) => string | number | boolean;
}

export function createSetupQuestionnaire(
  configuration: SetupConfiguration,
  context: SetupQuestionnaireContext = {},
): SetupQuestionnaireState {
  const draft = cloneSetupConfiguration(configuration);
  const independently = hasIndependentAgentSettings(draft);
  const question = questions(draft, independently, context, 'full')[0];
  return question
    ? { stateId: question.stateId, draft, question, terminal: 'collecting', configureIndependently: independently, phase: 'full' }
    : { stateId: 'review', draft, terminal: 'review', configureIndependently: independently, phase: 'full' };
}

function hasIndependentAgentSettings(draft: SetupConfiguration): boolean {
  const shared = draft.agents.findings;
  return SETUP_AGENT_TASKS.filter(task => task !== 'findings').some(task =>
    (['modelProvider', 'model', 'effort', 'executable'] as const).some(field => draft.agents[task][field] !== shared[field]));
}

export function createSetupPermissionIntentQuestionnaire(
  configuration: SetupConfiguration,
  context: SetupQuestionnaireContext = {},
): SetupQuestionnaireState {
  const draft = cloneSetupConfiguration(configuration);
  const projectsWanted = context.projectsWanted ?? Boolean(draft.projects.ids.trim());
  const question = questions(draft, false, context, 'permission-intent')[0];
  return question
    ? { stateId: question.stateId, draft, question, terminal: 'collecting', configureIndependently: false, phase: 'permission-intent', answeredQuestionIds: [], projectsWanted }
    : { stateId: 'review', draft, terminal: 'review', configureIndependently: false, phase: 'permission-intent', answeredQuestionIds: [], projectsWanted };
}

export function createSetupReviewState(configuration: SetupConfiguration): SetupQuestionnaireState {
  return {
    stateId: 'review',
    draft: cloneSetupConfiguration(configuration),
    terminal: 'review',
    configureIndependently: false,
  };
}

/** Re-project the current question after a read-only discovery without replaying answers. */
export function refreshSetupQuestionnaireQuestion(
  state: SetupQuestionnaireState,
  context: SetupQuestionnaireContext,
): SetupQuestionnaireState {
  if (state.terminal !== 'collecting' || !state.question) return state;
  const question = questions(state.draft, state.configureIndependently, context, state.phase ?? 'full')
    .find(candidate => candidate.id === state.question?.id);
  return question ? { ...state, question, validation: undefined } : state;
}

/** The denominator follows the currently applicable, unskipped questions. */
export function setupQuestionnaireProgress(
  state: SetupQuestionnaireState,
  context: SetupQuestionnaireContext,
): SetupQuestionnaireProgress | undefined {
  if (state.terminal !== 'collecting' || !state.question) return undefined;
  const visible = questions(state.draft, state.configureIndependently, context, state.phase ?? 'full');
  const index = visible.findIndex(item => item.id === state.question?.id);
  if (index < 0) return undefined;
  const group = state.question.stateId;
  const groupQuestions = visible.filter(item => item.stateId === group);
  return { position: index + 1, total: visible.length, groupPosition: groupQuestions.findIndex(item => item.id === state.question?.id) + 1,
    groupTotal: groupQuestions.length, group };
}

/** Reopen an already answered group for final-plan correction without clearing unrelated values. */
export function reopenSetupQuestionnaireGroup(
  state: SetupQuestionnaireState,
  group: SetupQuestion['stateId'],
  context: SetupQuestionnaireContext,
): SetupQuestionnaireState | undefined {
  if (state.terminal !== 'review') return undefined;
  const first = questions(state.draft, state.configureIndependently, context, 'full').find(item => item.stateId === group);
  return first ? { ...state, stateId: first.stateId, terminal: 'collecting', question: first, validation: undefined,
    phase: 'full', answeredQuestionIds: [] } : undefined;
}

export function setupQuestionIdsForGroup(group: SetupQuestion['stateId']): readonly string[] {
  return definitions().filter(item => item.stateId === group).map(item => item.id);
}

/** Basic changes presentation only: security- and permission-driving decisions stay visible. */
export function setupBasicSkippedQuestionIds(configuration?: SetupConfiguration): readonly string[] {
  const defaults = configuration ? createDefaultSetupConfiguration() : undefined;
  const advancedRepository = new Set([
    'featureTree', 'bugfixTree', 'hotfixTree', 'releaseTree', 'docsTree', 'choreTree',
    'reconciliationTree', 'reopenIssueOnPush', 'inactivityThresholdHours',
    'issueLocale', 'pullRequestLocale', 'commitPrefixTransforms',
  ]);
  const advancedBugbot = new Set([
    'pullRequestDescriptionMode', 'ignoreFiles', 'includeReasoning', 'bugbotCommentLimit',
    'bugbotFixVerifyCommands', 'bugbotEffort', 'bugbotReviewDrafts', 'bugbotTraceRules',
    'bugbotSuggestedChanges', 'bugbotOrganizationRules',
  ]);
  return definitions().filter(definition =>
    definition.id === 'agents.findings.effort'
    || definition.id === 'agents.findings.executable'
    || (definition.id.startsWith('agents.') && definition.id.endsWith('.provider') && definition.id !== 'agents.findings.provider')
    || (definition.id.startsWith('repository.') && advancedRepository.has(definition.id.slice('repository.'.length)))
    || (definition.id.startsWith('ai.') && advancedBugbot.has(definition.id.slice('ai.'.length)))
  ).filter(definition => !configuration || JSON.stringify(valueAtPath(configuration, definition.id))
    === JSON.stringify(valueAtPath(defaults!, definition.id))
  ).map(definition => definition.id);
}

function valueAtPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => current && typeof current === 'object'
    ? (current as Record<string, unknown>)[key] : undefined, value);
}

export function setupEditableGroups(configuration: SetupConfiguration): readonly SetupQuestion['stateId'][] {
  // Projects can be enabled at review even if the operator declined it before
  // the PAT handoff. The re-run audits any newly required grant before Apply.
  const visible = questions(configuration, hasIndependentAgentSettings(configuration), { projectsWanted: true }, 'full');
  return [...new Set(visible.map(item => item.stateId))];
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
      phase: state.phase,
      answeredQuestionIds: state.answeredQuestionIds,
      projectsWanted: state.projectsWanted,
    };
  }
  if (event.kind === 'back') {
    const visible = questions(state.draft, state.configureIndependently, context, state.phase ?? 'full');
    const index = visible.findIndex(item => item.id === state.question?.id);
    if (index <= 0) return { ...state, validation: 'This is the first question in this pass. Review it or cancel setup.' };
    const previous = visible[index - 1];
    return { ...state, stateId: previous.stateId, question: previous, validation: undefined,
      answeredQuestionIds: state.answeredQuestionIds?.filter(id => visible.findIndex(item => item.id === id) < index - 1) };
  }
  if (state.question.id === 'projects.statusVerified' && ['n', 'no', 'false', '0'].includes(event.value.normalize('NFKC').trim().toLowerCase())) {
    const selection = questions(state.draft, state.configureIndependently, context, state.phase ?? 'full')
      .find(question => question.id === 'projects.ids');
    if (selection) return { ...state, question: selection, stateId: 'projects',
      validation: 'Status values were not confirmed. Choose compatible Projects, then review their Status options again.',
      answeredQuestionIds: state.answeredQuestionIds?.filter(id => id !== 'projects.ids' && !id.startsWith('projects.')) };
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
  const draft = applyAnswer(state.draft, state.question, parsed.value, state.configureIndependently);
  const projectsWanted = state.question.id === 'projects.enabled' ? Boolean(parsed.value) : state.projectsWanted;
  const answeredQuestionIds = [...(state.answeredQuestionIds ?? []), state.question.id];
  const nextQuestions = questions(draft, configureIndependently, context, state.phase ?? 'full');
  // A just-answered question may become inapplicable (for example, clearing
  // Projects removes its dependent fields). Advance by canonical definition
  // order; indexing the new visible list at -1 would restart the wizard.
  const definitionOrder = definitions().map(definition => definition.id);
  const currentOrder = definitionOrder.indexOf(state.question.id);
  const next = nextQuestions.find(question => definitionOrder.indexOf(question.id) > currentOrder);
  return next
    ? {
        stateId: next.stateId,
        draft,
        question: next,
        terminal: 'collecting',
        configureIndependently,
        phase: state.phase,
        answeredQuestionIds,
        projectsWanted,
      }
    : { stateId: 'review', draft, terminal: 'review', configureIndependently, phase: state.phase, answeredQuestionIds, projectsWanted };
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
    'pull-request-approval': 'Pull-request approval',
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
  phase: 'full' | 'permission-intent',
): SetupQuestion[] {
  return definitions().filter((definition) =>
    (phase === 'full' ? definition.id !== 'projects.enabled' : PERMISSION_INTENT_QUESTION_IDS.has(definition.id))
    && !context.skipQuestionIds?.includes(definition.id)
    && (definition.applies?.(draft, independently, context) ?? true))
    .map((definition) => toQuestion(definition, draft, context));
}

function definitions(): readonly QuestionDefinition[] {
  return [
    ...Object.entries(SETUP_FEATURE_DESCRIPTIONS)
      .filter(([feature]) => !['release', 'hotfix'].includes(feature))
      .map(([feature, label]): QuestionDefinition => ({
      stateId: 'capabilities', id: `features.${feature}`, label, kind: 'boolean',
      })),
    {
      stateId: 'capabilities',
      id: 'issueWorkflows.enabled',
      label: 'Issue workflow types to enable (Space toggles, Enter confirms)',
      kind: 'multi-select',
      choices: ['All', ...ISSUE_WORKFLOW_KINDS.map(kind => `${kind} — ${ISSUE_WORKFLOW_CATALOG[kind].label}`)],
      read: draft => draft.issueWorkflows.enabled.join(','),
      applies: draft => draft.features.issues !== false,
    },
    {
      stateId: 'capabilities',
      id: 'repositoryAgentGuidance.enabled',
      label: 'Generate repository guidance and a Copilot workflow skill for agents?',
      kind: 'boolean',
    },
    {
      stateId: 'capabilities',
      id: 'repositoryAgentGuidance.agentsPointer',
      label: 'Root AGENTS.md discovery pointer policy',
      kind: 'choice',
      choices: ['prompt', 'create-if-missing', 'disabled'],
      applies: draft => draft.repositoryAgentGuidance.enabled,
    },
    ...SETUP_AGENT_TASKS.map((task): QuestionDefinition => ({
      stateId: 'agent-runtime', id: `agents.${task}.provider`, label: `${formatTask(task)} runtime`, kind: 'choice', choices: AGENT_PROVIDERS,
    })),
    { stateId: 'agent-model-defaults', id: 'agents.findings.modelProvider', label: 'Shared model provider (unless a role has its own setting)', kind: 'choice', choices: MODEL_PROVIDERS },
    { stateId: 'agent-model-defaults', id: 'agents.findings.model', label: 'Shared model name (unless a role has its own setting)', kind: 'text' },
    { stateId: 'agent-model-defaults', id: 'agents.findings.effort', label: 'Shared reasoning effort (empty uses provider default; per-role overrides stay separate)', kind: 'text' },
    { stateId: 'agent-model-defaults', id: 'agents.findings.executable', label: 'Shared validated executable (empty uses manifest basename; per-role overrides stay separate)', kind: 'text' },
    { stateId: 'agent-model-defaults', id: 'agents.configureIndependently', label: 'Configure model provider, model, effort, and executable independently for every task?', kind: 'boolean', read: draft => hasIndependentAgentSettings(draft) },
    ...SETUP_AGENT_TASKS.filter((task) => task !== 'findings').flatMap((task) => agentOverrideQuestions(task)),
    ...repositoryQuestions(),
    ...deploymentQuestions(),
    ...bugbotQuestions(),
    ...approvalQuestions(),
    { stateId: 'projects', id: 'projects.enabled', label: 'Integrate existing GitHub Projects with issue and pull-request automation?', kind: 'boolean',
      read: (draft, context) => context.projectsWanted ?? Boolean(draft.projects.ids.trim()),
      applies: draft => draft.features.issues !== false || draft.features.pullRequests !== false },
    { stateId: 'projects', id: 'projects.ids', label: 'Select existing GitHub Projects (or enter Project numbers from their URLs)', kind: 'text',
      applies: (draft, _independent, context) => (draft.features.issues !== false || draft.features.pullRequests !== false) && context.projectsWanted !== false },
    ...['issueCreatedColumn', 'pullRequestCreatedColumn', 'issueInProgressColumn', 'pullRequestInProgressColumn'].map((field): QuestionDefinition => ({
      stateId: 'projects', id: `projects.${field}`, label: projectLabel(field), kind: 'text', applies: (config) => Boolean(config.projects.ids.trim()),
    })),
    { stateId: 'projects', id: 'projects.statusVerified',
      label: 'Have you checked every selected Project in GitHub and confirmed all four exact Status values?',
      kind: 'boolean', read: () => false,
      applies: (draft, _independently, context) => Boolean(draft.projects.ids.trim())
        && sharedProjectStatusOptions(draft.projects.ids, context.projectDiscovery?.candidates ?? []).state === 'unavailable',
    },
    { stateId: 'provisioning', id: 'createInitialTag', label: 'Create v1.0.0 when no version tag exists?', kind: 'boolean' },
    { stateId: 'provisioning', id: 'manageRepositoryVariables', label: 'Create/update GitHub Actions Variables?', kind: 'boolean' },
    { stateId: 'provisioning', id: 'manageRepositorySecrets', label: 'Validate and provision required GitHub Actions Secrets?', kind: 'boolean' },
    ...storageQuestions('variables'),
    ...storageQuestions('secrets'),
  ];
}

/** Stable content inventory for documentation and localization audits; never answers questions. */
export function setupQuestionContentInventory(): readonly SetupQuestion[] {
  return definitions().map(({ stateId, id, label, kind, choices }) => ({
    stateId, id, label, kind, choices, defaultValue: '',
  }));
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
    ['issueManagedBranches', 'Let the Action create linked branches after in-progress?', 'boolean'],
    ['preBranchSdd', 'Require an SDD before feature and contract-change branches?', 'boolean'],
    ['reopenIssueOnPush', 'Reopen closed issues when a related branch receives a push?', 'boolean'],
    ['desiredAssigneesCount', 'Desired issue assignees (0 disables automatic assignment)', 'number'],
    ['desiredReviewersCount', 'Desired pull-request reviewers (0 disables automatic assignment)', 'number'],
    ['inactivityThresholdHours', 'Hours without activity before closing a waiting issue', 'number'],
    ['repositoryLocale', 'Repository message locale (BCP-47)', 'text'],
    ['issueLocale', 'Issue message locale override (empty inherits)', 'text'],
    ['pullRequestLocale', 'Pull-request message locale override (empty inherits)', 'text'],
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

function approvalQuestions(): QuestionDefinition[] {
  return [
    {
      stateId: 'pull-request-approval', id: 'pullRequestApproval.mode',
      label: 'Bot PR approval mode (guarded needs exact CI evidence and stale-approval protection)',
      kind: 'choice', choices: ['recommend', 'guarded', 'off'],
      applies: draft => draft.features.pullRequests !== false,
    },
    {
      stateId: 'pull-request-approval', id: 'pullRequestApproval.testChecks',
      label: 'Trusted test checks: name|source App ID|workflow name (semicolon-separated)',
      kind: 'text',
      read: draft => draft.pullRequestApproval.testChecks.map(check => `${check.name}|${check.sourceAppId}|${check.workflowName}`).join(';'),
      applies: draft => draft.features.pullRequests !== false && draft.pullRequestApproval.mode !== 'off',
    },
    {
      stateId: 'pull-request-approval', id: 'pullRequestApproval.coverage.mode',
      label: 'Coverage evidence mode', kind: 'choice', choices: ['check', 'numeric'],
      applies: draft => draft.features.pullRequests !== false && draft.pullRequestApproval.mode !== 'off',
    },
    {
      stateId: 'pull-request-approval', id: 'pullRequestApproval.coverage.checkName',
      label: 'Exact trusted check that enforces the coverage budget (no inferred percentage)',
      kind: 'choice',
      applies: draft => draft.features.pullRequests !== false && draft.pullRequestApproval.mode !== 'off',
    },
    {
      stateId: 'pull-request-approval', id: 'pullRequestApproval.coverage.minDiffPercent',
      label: 'Minimum changed-line coverage percentage (0–100)', kind: 'number',
      read: draft => draft.pullRequestApproval.coverage.mode === 'numeric'
        ? draft.pullRequestApproval.coverage.minDiffPercent : 80,
      applies: draft => draft.features.pullRequests !== false && draft.pullRequestApproval.mode !== 'off'
        && draft.pullRequestApproval.coverage.mode === 'numeric',
    },
    {
      stateId: 'pull-request-approval', id: 'pullRequestApproval.coverage.artifactWorkflowName',
      label: 'Exact workflow publishing copilot-diff-coverage-v1', kind: 'text',
      read: draft => draft.pullRequestApproval.coverage.mode === 'numeric'
        ? draft.pullRequestApproval.coverage.artifactWorkflowName : '',
      applies: draft => draft.features.pullRequests !== false && draft.pullRequestApproval.mode !== 'off'
        && draft.pullRequestApproval.coverage.mode === 'numeric',
    },
    {
      stateId: 'pull-request-approval', id: 'pullRequestApproval.coverage.reporterAttested',
      label: 'Is the bounded numeric coverage reporter installed in that trusted CI workflow?', kind: 'boolean',
      read: draft => draft.pullRequestApproval.coverage.mode === 'numeric'
        && draft.pullRequestApproval.coverage.reporterAttested,
      applies: draft => draft.features.pullRequests !== false && draft.pullRequestApproval.mode !== 'off'
        && draft.pullRequestApproval.coverage.mode === 'numeric',
    },
    {
      stateId: 'pull-request-approval', id: 'pullRequestApproval.producerAttested',
      label: 'Have you verified each exact check, source App ID, workflow, and coverage-enforcing CI step?',
      kind: 'boolean',
      applies: draft => draft.features.pullRequests !== false && draft.pullRequestApproval.mode !== 'off',
    },
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
  const branchScopedCandidates = context.approvalCheckCandidates?.map(candidate =>
    candidate.requiredByRuleset?.branch !== draft.repository.developmentBranch
      ? { ...candidate, requiredByRuleset: undefined } : candidate);
  const producerCandidates = definition.id === 'pullRequestApproval.testChecks' ? branchScopedCandidates
    : definition.id === 'pullRequestApproval.coverage.checkName' ? branchScopedCandidates?.filter(candidate =>
      draft.pullRequestApproval.testChecks.some(check => check.name === candidate.name
        && check.sourceAppId === candidate.sourceAppId && check.workflowName === candidate.workflowName)) : undefined;
  const coverageChoices = definition.id === 'pullRequestApproval.coverage.checkName'
    ? [...new Set(draft.pullRequestApproval.testChecks.map(check => check.name))] : undefined;
  const allowedNames = definition.kind === 'scope-overrides'
    ? inheritedNames(definition.id.includes('.variables.') ? 'variables' : 'secrets', draft, context)
    : undefined;
  const projectQuestion = definition.id === 'projects.ids';
  const statusQuestion = /^projects\.(issue|pullRequest)(Created|InProgress)Column$/u.test(definition.id);
  const projectCandidates = context.projectDiscovery?.candidates ?? [];
  const projectStatus = statusQuestion
    ? sharedProjectStatusOptions(draft.projects.ids, projectCandidates) : undefined;
  return {
    stateId: definition.stateId,
    id: definition.id,
    label: definition.label,
    kind: definition.id === 'pullRequestApproval.testChecks' ? 'producer-select'
      : projectQuestion ? 'project-select'
        : statusQuestion && projectStatus?.state === 'observed' ? 'choice' : definition.kind,
    defaultValue: definition.read?.(draft, context) ?? readPath(draft, definition.id, allowedNames),
    ...(coverageChoices ? { choices: coverageChoices } : projectStatus?.state === 'observed'
      ? { choices: projectStatus.options } : definition.choices ? { choices: definition.choices } : {}),
    ...(allowedNames ? { allowedNames } : {}),
    ...(producerCandidates?.length ? { producerCandidates } : {}),
    ...(definition.id === 'pullRequestApproval.coverage.checkName'
      ? { trustedProducers: draft.pullRequestApproval.testChecks } : {}),
    ...(definition.id === 'pullRequestApproval.testChecks' && context.approvalCheckDiscoveryStatus
      ? { discoveryStatus: context.approvalCheckDiscoveryStatus, discoveryTruncated: context.approvalCheckDiscoveryTruncated,
        discoveryRetryRemaining: context.discoveryRetryRemaining?.checks ?? 0 } : {}),
    ...(projectQuestion ? { discoveryStatus: context.projectDiscovery?.status ?? 'unavailable',
      discoveryTruncated: context.projectDiscovery?.truncated,
      ...(context.projectDiscovery && context.projectDiscovery.status !== 'unsupported' && context.discoveryRetryRemaining
        ? { discoveryRetryRemaining: context.discoveryRetryRemaining.projects } : {}),
      projectCandidates, projectOwner: context.projectOwner } : {}),
    ...(statusQuestion && projectStatus ? { statusOptionState: projectStatus.state } : {}),
    ...(definition.id === 'projects.statusVerified' ? { projectStatusValues: [
      { transition: 'issueCreated' as const, value: draft.projects.issueCreatedColumn },
      { transition: 'pullRequestCreated' as const, value: draft.projects.pullRequestCreatedColumn },
      { transition: 'issueInProgress' as const, value: draft.projects.issueInProgressColumn },
      { transition: 'pullRequestInProgress' as const, value: draft.projects.pullRequestInProgressColumn },
    ] } : {}),
    ...(definition.id === 'repository.mainBranch' && context.branchSources
      ? { suggestionSource: context.branchSources.main } : {}),
    ...(definition.id === 'repository.developmentBranch' && context.branchSources
      ? { suggestionSource: context.branchSources.development } : {}),
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
  if (question.id === 'projects.statusVerified') return ['y', 'yes', 'true', '1'].includes(input.toLowerCase())
    ? { value: true } : { error: 'Open every selected Project in GitHub and confirm that all four exact Status values exist. Answer Yes after checking, or No to choose Projects again.' };
  if (question.id === 'projects.ids') {
    const parsed = parseSetupProjectSelection(input || String(question.defaultValue), question.projectOwner);
    if ('error' in parsed) return parsed;
    const status = sharedProjectStatusOptions(parsed.value, question.projectCandidates ?? []);
    if (status.state === 'incompatible') return { error: 'Selected Projects have no common Status option. Choose compatible Projects or configure them separately.' };
    return parsed;
  }
  if (question.id === 'pullRequestApproval.testChecks') {
    const entries = (input || String(question.defaultValue)).split(';').map(item => item.trim()).filter(Boolean)
      .flatMap(item => item.split(',').map(value => value.trim()).filter(Boolean))
      .map(item => {
        const index = Number(item) - 1;
        const candidate = Number.isSafeInteger(index) && /^[1-9]\d*$/u.test(item) ? question.producerCandidates?.[index] : undefined;
        return candidate ? `${candidate.name}|${candidate.sourceAppId}|${candidate.workflowName}` : item;
      });
    if (entries.length < 1 || entries.length > 8 || entries.some(entry => !/^[^|;\r\n]{1,100}\|[1-9][0-9]*\|[^|;\r\n]{1,100}$/u.test(entry))) {
      return { error: 'Select 1–8 observed checks or enter exact name|App ID|workflow tuples.' };
    }
    if (new Set(entries).size !== entries.length) return { error: 'A trusted check was selected more than once.' };
    const names = entries.map(entry => entry.split('|', 1)[0]);
    if (new Set(names).size !== names.length) return { error: 'Two trusted producers use the same check name. Coverage stores only one name; choose one producer or rename the CI jobs before continuing.' };
    return { value: entries.join(';') };
  }
  if (!input && question.statusOptionState === 'observed' && !question.choices?.includes(String(question.defaultValue))) {
    return { error: 'The saved Status value is not available in every selected Project. Choose a listed Status option.' };
  }
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
  if (question.kind === 'multi-select') {
    const selected = parseWorkflowSelection(input || String(question.defaultValue));
    if ('error' in selected) return selected;
    return { value: selected.value.join(',') };
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
  independently: boolean,
): SetupConfiguration {
  const draft = cloneSetupConfiguration(configuration);
  if (question.id === 'agents.configureIndependently') {
    if (!value) for (const task of SETUP_AGENT_TASKS.filter(task => task !== 'findings')) {
      draft.agents[task] = { ...draft.agents[task], modelProvider: draft.agents.findings.modelProvider,
        model: draft.agents.findings.model, effort: draft.agents.findings.effort,
        executable: draft.agents.findings.executable };
    }
    return draft;
  }
  if (question.id === 'projects.enabled') {
    if (!value) draft.projects.ids = '';
    return draft;
  }
  if (question.id === 'projects.statusVerified') return draft;
  if (question.id === 'features.issues' && value === false) {
    draft.features.issues = false;
    draft.features.release = false;
    draft.features.hotfix = false;
    draft.issueWorkflows = createIssueWorkflowProfile([]);
    return draft;
  }
  if (question.id === 'features.pullRequests' && value === false) {
    draft.features.pullRequests = false;
    draft.pullRequestApproval = { ...draft.pullRequestApproval, mode: 'off' };
    return draft;
  }
  if (question.id === 'pullRequestApproval.testChecks') {
    const entries = String(value).split(';').map(item => item.trim()).filter(Boolean);
    draft.pullRequestApproval = {
      ...draft.pullRequestApproval,
      testChecks: entries.map(entry => {
        const [name, sourceAppId, workflowName] = entry.split('|').map(part => part.trim());
        return { name, sourceAppId: Number(sourceAppId), workflowName };
      }),
    };
    return draft;
  }
  if (question.id === 'pullRequestApproval.coverage.checkName') {
    draft.pullRequestApproval = {
      ...draft.pullRequestApproval,
      coverage: { ...draft.pullRequestApproval.coverage, checkName: String(value) },
    };
    return draft;
  }
  if (question.id === 'pullRequestApproval.coverage.mode') {
    const checkName = draft.pullRequestApproval.coverage.checkName;
    draft.pullRequestApproval = { ...draft.pullRequestApproval,
      coverage: value === 'numeric'
        ? { mode: 'numeric', checkName, minDiffPercent: 80, artifactWorkflowName: '', reporterAttested: false }
        : { mode: 'check', checkName } };
    return draft;
  }
  if (question.id === 'issueWorkflows.enabled') {
    const selected = String(value).split(',').map(item => item.trim()).filter(Boolean) as IssueWorkflowKind[];
    draft.issueWorkflows = createIssueWorkflowProfile(selected);
    draft.features.release = selected.includes('release');
    draft.features.hotfix = selected.includes('hotfix');
    return draft;
  }
  if (['agents.findings.modelProvider', 'agents.findings.model', 'agents.findings.effort', 'agents.findings.executable'].includes(question.id)) {
    const field = question.id.split('.')[2] as 'modelProvider' | 'model' | 'effort' | 'executable';
    for (const task of independently ? (['findings'] as const) : SETUP_AGENT_TASKS) {
      draft.agents[task] = { ...draft.agents[task], [field]: value as string };
    }
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

function parseWorkflowSelection(raw: string): { value: IssueWorkflowKind[] } | { error: string } {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'none') return { value: [] };
  if (!normalized || normalized === 'all') return { value: [...ISSUE_WORKFLOW_KINDS] };
  const requested = normalized.split(',').map(item => item.trim()).filter(Boolean)
    .map(item => item.replace(/\s+—.*$/u, '').replace(/^\d+[.)]\s*/u, ''));
  const unknown = requested.filter(item => !ISSUE_WORKFLOW_KINDS.includes(item as IssueWorkflowKind));
  if (unknown.length > 0) return { error: `Unknown issue workflow(s): ${unknown.join(', ')}.` };
  return { value: ISSUE_WORKFLOW_KINDS.filter(kind => requested.includes(kind)) };
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
