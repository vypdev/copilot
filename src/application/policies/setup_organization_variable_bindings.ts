import { SETUP_AGENT_TASKS } from './setup_configuration_defaults';
import type { SetupConfigurationOverrides } from './setup_configuration_defaults';

export interface SetupOrganizationVariableBinding {
  readonly variable: string;
  readonly path: string;
  readonly fallbackVariable?: string;
  readonly targetSpecific?: boolean;
}

const repositoryFields = [
  ['MAIN_BRANCH', 'mainBranch'], ['DEVELOPMENT_BRANCH', 'developmentBranch'],
  ['FEATURE_TREE', 'featureTree'], ['BUGFIX_TREE', 'bugfixTree'],
  ['HOTFIX_TREE', 'hotfixTree'], ['RELEASE_TREE', 'releaseTree'],
  ['DOCS_TREE', 'docsTree'], ['CHORE_TREE', 'choreTree'],
  ['ISSUE_MANAGED_BRANCHES', 'issueManagedBranches'], ['PRE_BRANCH_SDD', 'preBranchSdd'],
  ['REOPEN_ISSUE_ON_PUSH', 'reopenIssueOnPush'], ['DESIRED_ASSIGNEES_COUNT', 'desiredAssigneesCount'],
  ['DESIRED_REVIEWERS_COUNT', 'desiredReviewersCount'], ['INACTIVITY_THRESHOLD_HOURS', 'inactivityThresholdHours'],
  ['REPOSITORY_LOCALE', 'repositoryLocale'], ['ISSUES_LOCALE', 'issueLocale'],
  ['PULL_REQUESTS_LOCALE', 'pullRequestLocale'], ['COMMIT_PREFIX_TRANSFORMS', 'commitPrefixTransforms'],
  ['RELEASE_RECONCILIATION_STRATEGY', 'releaseReconciliationStrategy'],
  ['HOTFIX_RECONCILIATION_STRATEGY', 'hotfixReconciliationStrategy'],
  ['RECONCILIATION_PR_MODE', 'reconciliationPullRequestMode'],
  ['RECONCILIATION_BACKMERGE_MODE', 'reconciliationBackmergeMode'],
  ['HOTFIX_ACTIVE_RELEASE_POLICY', 'hotfixActiveReleasePolicy'],
  ['RECONCILIATION_TREE', 'reconciliationTree'], ['RECONCILIATION_CLEANUP', 'reconciliationCleanup'],
  ['RECONCILIATION_ISSUE_COMPLETION', 'reconciliationIssueCompletion'],
  ['ORCHESTRATION_PRESENTATION_MODE', 'orchestrationPresentationMode'],
  ['ORCHESTRATION_DIAGRAMS', 'orchestrationDiagrams'], ['ORCHESTRATION_COMMENT_MODE', 'orchestrationCommentMode'],
] as const;

const aiFields = [
  ['AI_PULL_REQUEST_DESCRIPTION_MODE', 'pullRequestDescriptionMode'], ['AI_IGNORE_FILES', 'ignoreFiles'],
  ['AI_MEMBERS_ONLY', 'membersOnly'], ['AI_INCLUDE_REASONING', 'includeReasoning'],
  ['BUGBOT_SEVERITY', 'bugbotSeverity'], ['BUGBOT_COMMENT_LIMIT', 'bugbotCommentLimit'],
  ['BUGBOT_DRY_RUN', 'bugbotDryRun'], ['BUGBOT_EFFORT', 'bugbotEffort'],
  ['BUGBOT_REVIEW_DRAFTS', 'bugbotReviewDrafts'], ['BUGBOT_TRACE_RULES', 'bugbotTraceRules'],
  ['BUGBOT_SUGGESTED_CHANGES', 'bugbotSuggestedChanges'], ['BUGBOT_TELEMETRY', 'bugbotTelemetry'],
  ['BUGBOT_FAIL_ON_UNRESOLVED', 'bugbotFailOnUnresolved'], ['BUGBOT_ORGANIZATION_RULES', 'bugbotOrganizationRules'],
] as const;

/** Explicit allowlist; unknown organization values never become configuration paths. */
export const SETUP_ORGANIZATION_VARIABLE_BINDINGS: readonly SetupOrganizationVariableBinding[] = [
  ...SETUP_AGENT_TASKS.flatMap(task => [
    ['PROVIDER', 'provider'], ['MODEL_PROVIDER', 'modelProvider'], ['MODEL', 'model'],
    ['EFFORT', 'effort'], ['EXECUTABLE', 'executable'],
  ].map(([suffix, field]) => ({ variable: `${task.toUpperCase()}_${suffix}`,
    fallbackVariable: `AGENT_${suffix}`, path: `agents.${task}.${field}` }))),
  ...repositoryFields.map(([variable, field]) => ({ variable, path: `repository.${field}` })),
  ...aiFields.map(([variable, field]) => ({ variable, path: `ai.${field}` })),
  { variable: 'BUGBOT_AUTOFIX_VERIFY_COMMANDS', path: 'ai.bugbotFixVerifyCommands', targetSpecific: true },
  { variable: 'MERGE_QUEUE_CHECK_ATTESTATIONS', path: 'repository.mergeQueueCheckAttestations', targetSpecific: true },
  ...([
    ['PROJECT_IDS', 'ids'], ['PROJECT_COLUMN_ISSUE_CREATED', 'issueCreatedColumn'],
    ['PROJECT_COLUMN_PULL_REQUEST_CREATED', 'pullRequestCreatedColumn'],
    ['PROJECT_COLUMN_ISSUE_IN_PROGRESS', 'issueInProgressColumn'],
    ['PROJECT_COLUMN_PULL_REQUEST_IN_PROGRESS', 'pullRequestInProgressColumn'],
  ] as const).map(([variable, field]) => ({ variable, path: `projects.${field}` })),
];

/** Only known configuration paths can preserve an explicit override during import. */
export function setupOrganizationExplicitQuestionIds(overrides: SetupConfigurationOverrides | undefined): readonly string[] {
  if (!overrides) return [];
  const paths = [...SETUP_ORGANIZATION_VARIABLE_BINDINGS.map(binding => binding.path),
    'issueWorkflows.enabled', 'pullRequestApproval', 'features.issues', 'features.release', 'features.hotfix'];
  return paths.filter(path => path.split('.').reduce<unknown>((value, key) =>
    value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, overrides) !== undefined);
}
