import { normalizePullRequestDescriptionMode } from '../../domain/pull_request_description';
import { enabledSetupWorkflowFiles } from '../../domain/setup_workflow_catalog';
import type {
    DoctorCheck,
    SetupConfiguration,
    SetupPlan,
    SetupVariable,
} from '../../domain/setup';
import {
    SETUP_AGENT_TASKS,
    setupAgentTasksForFeatures,
} from './setup_configuration_defaults';
import { usesOrganizationStorage } from './setup_configuration_storage_policy';
import { buildSetupCredentialRequirements } from './setup_credential_requirement_policy';
import { resolveLocaleProfile } from '../../domain/locale';
import { issueWorkflowFormFiles, serializeIssueWorkflowProfile } from '../../domain/issue_workflow_profile';
import { effectiveIssueWorkflowFeatures, effectiveIssueWorkflowProfile } from './setup_issue_workflow_policy';

export { buildSetupCredentialRequirements };

export function buildSetupPlan(
    configuration: SetupConfiguration,
    mergeQueueReadiness: readonly DoctorCheck[] = [],
): SetupPlan {
    const workflowFiles = enabledSetupWorkflowFiles(effectiveIssueWorkflowFeatures(configuration));
    const issueWorkflowProfile = effectiveIssueWorkflowProfile(configuration);
    const issueTemplateFiles = configuration.features.issueTemplates === false || configuration.features.issues === false
        ? []
        : ['config.yml', ...issueWorkflowFormFiles(issueWorkflowProfile)]
            .filter(file => configuration.features.release !== false || file !== 'release.yml')
            .filter(file => configuration.features.hotfix !== false || file !== 'hotfix.yml');
    const selectedFiles = [
        ...workflowFiles.map(file => `workflows/${file}`),
        ...issueTemplateFiles.map(file => `ISSUE_TEMPLATE/${file}`),
        ...(configuration.features.pullRequestTemplate === false ? [] : ['pull_request_template.md']),
        ...(configuration.repositoryAgentGuidance?.enabled === false ? [] : [
            '.copilot/repository-profile.json',
            '.copilot/AGENT_GUIDE.md',
            '.agents/skills/copilot-repository-workflow/SKILL.md',
            '.copilot/setup-manifest.json',
            ...(configuration.repositoryAgentGuidance.agentsPointer === 'disabled' ? [] : ['AGENTS.md (managed pointer only)']),
        ]),
    ];
    const credentialRequirements = buildSetupCredentialRequirements(configuration);
    return {
        configuration,
        workflowFiles,
        issueTemplateFiles,
        selectedFiles,
        variables: buildSetupRepositoryVariables(configuration),
        requiredSecrets: credentialRequirements
            .filter(requirement => !requirement.alternativeGroups?.length
                || requirement.alternativeGroups.some(group => !requirement.runnerAuthenticationGroups?.includes(group)))
            .map(requirement => requirement.name),
        credentialRequirements,
        mergeQueueReadiness: [...mergeQueueReadiness],
        warnings: buildSetupWarnings(configuration),
    };
}

export function buildSetupRepositoryVariables(configuration: SetupConfiguration): SetupVariable[] {
    const variables: SetupVariable[] = [];
    const add = (name: string, value: string | number | boolean | undefined) => {
        if (value === undefined || value === '') return;
        variables.push({ name, value: String(value) });
    };
    const base = configuration.agents.findings;
    add('AGENT_PROVIDER', base.provider);
    add('AGENT_MODEL_PROVIDER', base.modelProvider);
    add('AGENT_MODEL', base.model);
    add('AGENT_EFFORT', base.effort);
    add('AGENT_EXECUTABLE', base.executable);
    add('AGENT_PROVISIONING', configuration.ai.provisioningMode);
    add('AGENT_ALLOWED_MODEL_PROVIDERS', unique(SETUP_AGENT_TASKS.map(task => configuration.agents[task].modelProvider)).join(','));
    add('AGENT_ALLOWED_MODELS', unique(SETUP_AGENT_TASKS.map(task => `${configuration.agents[task].modelProvider}/${configuration.agents[task].model}`)).join(','));
    for (const task of SETUP_AGENT_TASKS) {
        const prefix = task.toUpperCase();
        const agent = configuration.agents[task];
        add(`${prefix}_PROVIDER`, agent.provider);
        add(`${prefix}_MODEL_PROVIDER`, agent.modelProvider);
        add(`${prefix}_MODEL`, agent.model);
        add(`${prefix}_EFFORT`, agent.effort);
        add(`${prefix}_EXECUTABLE`, agent.executable);
    }
    const repository = configuration.repository;
    const locale = resolveLocaleProfile(
        repository.repositoryLocale,
        repository.issueLocale,
        repository.pullRequestLocale,
    );
    add('MAIN_BRANCH', repository.mainBranch);
    add('DEVELOPMENT_BRANCH', repository.developmentBranch);
    add('FEATURE_TREE', repository.featureTree);
    add('BUGFIX_TREE', repository.bugfixTree);
    add('HOTFIX_TREE', repository.hotfixTree);
    add('RELEASE_TREE', repository.releaseTree);
    add('DOCS_TREE', repository.docsTree);
    add('CHORE_TREE', repository.choreTree);
    add('ISSUE_MANAGED_BRANCHES', repository.issueManagedBranches);
    add('PRE_BRANCH_SDD', repository.preBranchSdd);
    add('REOPEN_ISSUE_ON_PUSH', repository.reopenIssueOnPush);
    add('DESIRED_ASSIGNEES_COUNT', repository.desiredAssigneesCount);
    add('DESIRED_REVIEWERS_COUNT', repository.desiredReviewersCount);
    if (configuration.features.inactiveIssueClosure !== false) {
        add('INACTIVITY_THRESHOLD_HOURS', repository.inactivityThresholdHours);
    }
    add('REPOSITORY_LOCALE', locale.repository);
    add('ISSUES_LOCALE', locale.issueOverride);
    add('PULL_REQUESTS_LOCALE', locale.pullRequestOverride);
    add('COMMIT_PREFIX_TRANSFORMS', repository.commitPrefixTransforms);
    add('RELEASE_RECONCILIATION_STRATEGY', repository.releaseReconciliationStrategy);
    add('HOTFIX_RECONCILIATION_STRATEGY', repository.hotfixReconciliationStrategy);
    add('RECONCILIATION_PR_MODE', repository.reconciliationPullRequestMode);
    add('MERGE_QUEUE_CHECK_ATTESTATIONS', JSON.stringify(repository.mergeQueueCheckAttestations));
    add('RECONCILIATION_BACKMERGE_MODE', repository.reconciliationBackmergeMode);
    add('HOTFIX_ACTIVE_RELEASE_POLICY', repository.hotfixActiveReleasePolicy);
    add('RECONCILIATION_TREE', repository.reconciliationTree);
    add('RECONCILIATION_CLEANUP', repository.reconciliationCleanup);
    add('RECONCILIATION_ISSUE_COMPLETION', repository.reconciliationIssueCompletion);
    add('ORCHESTRATION_PRESENTATION_MODE', repository.orchestrationPresentationMode);
    add('ORCHESTRATION_DIAGRAMS', repository.orchestrationDiagrams);
    add('ORCHESTRATION_COMMENT_MODE', repository.orchestrationCommentMode);
    add('COPILOT_ISSUE_WORKFLOW_PROFILE', serializeIssueWorkflowProfile(effectiveIssueWorkflowProfile(configuration)));
    add('AI_PULL_REQUEST_DESCRIPTION_MODE', configuration.ai.pullRequestDescriptionMode);
    add('AI_IGNORE_FILES', configuration.ai.ignoreFiles);
    add('AI_MEMBERS_ONLY', configuration.ai.membersOnly);
    add('AI_INCLUDE_REASONING', configuration.ai.includeReasoning);
    add('BUGBOT_SEVERITY', configuration.ai.bugbotSeverity);
    add('BUGBOT_COMMENT_LIMIT', configuration.ai.bugbotCommentLimit);
    add('BUGBOT_AUTOFIX_VERIFY_COMMANDS', configuration.ai.bugbotFixVerifyCommands);
    add('BUGBOT_DRY_RUN', configuration.ai.bugbotDryRun);
    add('BUGBOT_EFFORT', configuration.ai.bugbotEffort);
    add('BUGBOT_REVIEW_DRAFTS', configuration.ai.bugbotReviewDrafts);
    add('BUGBOT_TRACE_RULES', configuration.ai.bugbotTraceRules);
    add('BUGBOT_SUGGESTED_CHANGES', configuration.ai.bugbotSuggestedChanges);
    add('BUGBOT_TELEMETRY', configuration.ai.bugbotTelemetry);
    add('BUGBOT_FAIL_ON_UNRESOLVED', configuration.ai.bugbotFailOnUnresolved);
    add('BUGBOT_ORGANIZATION_RULES', configuration.ai.bugbotOrganizationRules);
    add('PROJECT_IDS', configuration.projects.ids);
    add('PROJECT_COLUMN_ISSUE_CREATED', configuration.projects.issueCreatedColumn);
    add('PROJECT_COLUMN_PULL_REQUEST_CREATED', configuration.projects.pullRequestCreatedColumn);
    add('PROJECT_COLUMN_ISSUE_IN_PROGRESS', configuration.projects.issueInProgressColumn);
    add('PROJECT_COLUMN_PULL_REQUEST_IN_PROGRESS', configuration.projects.pullRequestInProgressColumn);
    return variables;
}

export function buildSetupActionInputs(configuration: SetupConfiguration): Record<string, string> {
    const repository = configuration.repository;
    const locale = resolveLocaleProfile(
        repository.repositoryLocale,
        repository.issueLocale,
        repository.pullRequestLocale,
    );
    const ai = configuration.ai;
    const projects = configuration.projects;
    return {
        'main-branch': repository.mainBranch,
        'development-branch': repository.developmentBranch,
        'feature-tree': repository.featureTree,
        'bugfix-tree': repository.bugfixTree,
        'hotfix-tree': repository.hotfixTree,
        'release-tree': repository.releaseTree,
        'docs-tree': repository.docsTree,
        'chore-tree': repository.choreTree,
        'issue-managed-branches': String(repository.issueManagedBranches),
        'pre-branch-sdd': String(repository.preBranchSdd),
        'reopen-issue-on-push': String(repository.reopenIssueOnPush),
        'desired-assignees-count': String(repository.desiredAssigneesCount),
        'desired-reviewers-count': String(repository.desiredReviewersCount),
        'inactivity-threshold-hours': String(repository.inactivityThresholdHours),
        'repository-locale': locale.repository,
        'issues-locale': locale.issueOverride ?? '',
        'pull-requests-locale': locale.pullRequestOverride ?? '',
        'commit-prefix-transforms': repository.commitPrefixTransforms,
        'release-reconciliation-strategy': repository.releaseReconciliationStrategy,
        'hotfix-reconciliation-strategy': repository.hotfixReconciliationStrategy,
        'reconciliation-pr-mode': repository.reconciliationPullRequestMode,
        'merge-queue-check-attestations': JSON.stringify(repository.mergeQueueCheckAttestations),
        'reconciliation-backmerge-mode': repository.reconciliationBackmergeMode,
        'hotfix-active-release-policy': repository.hotfixActiveReleasePolicy,
        'reconciliation-tree': repository.reconciliationTree,
        'reconciliation-cleanup': repository.reconciliationCleanup,
        'reconciliation-issue-completion': repository.reconciliationIssueCompletion,
        'orchestration-presentation-mode': repository.orchestrationPresentationMode,
        'orchestration-diagrams': String(repository.orchestrationDiagrams),
        'orchestration-comment-mode': repository.orchestrationCommentMode,
        'issue-workflow-profile': serializeIssueWorkflowProfile(effectiveIssueWorkflowProfile(configuration)),
        'ai-pull-request-description-mode': normalizePullRequestDescriptionMode(ai.pullRequestDescriptionMode),
        'ai-ignore-files': ai.ignoreFiles,
        'ai-members-only': String(ai.membersOnly),
        'ai-include-reasoning': String(ai.includeReasoning),
        'bugbot-severity': ai.bugbotSeverity,
        'bugbot-comment-limit': String(ai.bugbotCommentLimit),
        'bugbot-fix-verify-commands': ai.bugbotFixVerifyCommands,
        'bugbot-dry-run': String(ai.bugbotDryRun),
        'bugbot-effort': ai.bugbotEffort,
        'bugbot-review-drafts': String(ai.bugbotReviewDrafts),
        'bugbot-trace-rules': String(ai.bugbotTraceRules),
        'bugbot-suggested-changes': String(ai.bugbotSuggestedChanges),
        'bugbot-telemetry': String(ai.bugbotTelemetry),
        'bugbot-fail-on-unresolved': String(ai.bugbotFailOnUnresolved),
        'bugbot-organization-rules': ai.bugbotOrganizationRules,
        'project-ids': projects.ids,
        'project-column-issue-created': projects.issueCreatedColumn,
        'project-column-pull-request-created': projects.pullRequestCreatedColumn,
        'project-column-issue-in-progress': projects.issueInProgressColumn,
        'project-column-pull-request-in-progress': projects.pullRequestInProgressColumn,
        ...buildAgentActionInputs(configuration),
        ...configuration.actionInputs,
    };
}

function buildAgentActionInputs(configuration: SetupConfiguration): Record<string, string> {
    const result: Record<string, string> = {};
    const base = configuration.agents.findings;
    const add = (key: string, value: string | undefined) => { if (value !== undefined) result[key] = value; };
    add('agent-provider', base.provider);
    add('agent-model-provider', base.modelProvider);
    add('agent-model', base.model);
    add('agent-effort', base.effort);
    add('agent-executable', base.executable);
    for (const task of SETUP_AGENT_TASKS) {
        const agent = configuration.agents[task];
        const prefix = `${task}-`;
        add(`${prefix}provider`, agent.provider);
        add(`${prefix}model-provider`, agent.modelProvider);
        add(`${prefix}model`, agent.model);
        add(`${prefix}effort`, agent.effort);
        add(`${prefix}executable`, agent.executable);
    }
    return result;
}

function buildSetupWarnings(configuration: SetupConfiguration): string[] {
    const warnings: string[] = [];
    const issueWorkflowProfile = effectiveIssueWorkflowProfile(configuration);
    if (configuration.features.issues !== false && issueWorkflowProfile.enabled.length === 0) {
        warnings.push('No issue workflow kind is enabled; issue events will remain unmanaged until a supported Issue Form and profile entry are enabled.');
    }
    if (configuration.repository.issueManagedBranches && issueWorkflowProfile.enabled.includes('help')) {
        warnings.push('Help / question issues remain branchless even when issue-managed-branches is enabled.');
    }
    if (configuration.features.release !== false && !issueWorkflowProfile.enabled.includes('release')) {
        warnings.push('Release automation is installed, but release issue events are disabled by the selected issue workflow profile.');
    }
    if (configuration.features.hotfix !== false && !issueWorkflowProfile.enabled.includes('hotfix')) {
        warnings.push('Hotfix automation is installed, but hotfix issue events are disabled by the selected issue workflow profile.');
    }
    if (configuration.repositoryAgentGuidance?.enabled === false) {
        warnings.push('Repository agent guidance generation is disabled; collaborators will not receive the generated profile or workflow skill.');
    }
    if (configuration.features.release !== false && configuration.features.hotfix !== false) {
        warnings.push('Release and hotfix workflows require the workflow PAT Secret and a writable token.');
    }
    if (configuration.repository.reconciliationPullRequestMode === 'merge-queue') {
        warnings.push('Merge queue mode fails closed unless every required producer is verified automatically or covered by an exact reviewed attestation.');
    }
    if (configuration.ai.provisioningMode === 'always') {
        warnings.push('Always-provision mode reinstalls only default Codex/OpenCode runtimes from pinned manifest packages; explicit executables are never replaced and Cursor must be preinstalled.');
    }
    if (configuration.features.inactiveIssueClosure !== false) {
        warnings.push('Inactive issue closure is enabled; waiting issues are closed after the configured inactivity threshold and can be reopened with a new comment.');
    }
    if (configuration.projects.ids.trim()) {
        warnings.push('Project IDs must be accessible to the PAT and use the expected project column names.');
    }
    if (setupAgentTasksForFeatures(configuration).some(task => configuration.agents[task].provider === 'cursor')) {
        warnings.push('Cursor is an experimental runtime in Copilot and requires a compatible preinstalled CLI plus CURSOR_API_KEY; Copilot has no automatic Cursor installer.');
    }
    if (usesOrganizationStorage(configuration)) {
        warnings.push('Organization-level Secrets and Variables require organization permissions; selected access is the safest default and repository values take precedence.');
    }
    return warnings;
}

function unique(values: string[]): string[] {
    return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}
