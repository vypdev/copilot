import type { SetupConfiguration } from '../../domain/setup';
import { SETUP_AGENT_TASKS } from './setup_configuration_defaults';
import { SUPPORTED_AGENT_PROVIDERS } from './agent_configuration_validation_policy';
import { validateStorageConfiguration } from './setup_configuration_storage_policy';
import { MAX_INACTIVITY_THRESHOLD_HOURS } from '../../domain/issue_inactivity';
import { validateDeploymentConfiguration } from '../../domain/deployment_configuration';
import { canonicalizeLocaleTag } from '../../domain/locale';
import { ISSUE_WORKFLOW_KINDS } from '../../domain/issue_workflow_profile';
import { effectiveIssueWorkflowProfile } from './setup_issue_workflow_policy';

export function validateSetupConfiguration(configuration: SetupConfiguration): string[] {
    const errors: string[] = [];
    if (configuration.repository.preBranchSdd && !configuration.repository.issueManagedBranches) {
        errors.push('pre-branch-sdd requires issue-managed-branches.');
    }
    for (const retired of ['branch-management-always', 'branch-management-launcher-label']) {
        if (retired in configuration.actionInputs) {
            errors.push(`Action input ${retired} was removed; use issue-managed-branches and the fixed in-progress start label.`);
        }
    }
    const enabledWorkflows = configuration.issueWorkflows?.enabled ?? ISSUE_WORKFLOW_KINDS;
    const unknownWorkflows = enabledWorkflows.filter(kind => !ISSUE_WORKFLOW_KINDS.includes(kind));
    if (unknownWorkflows.length > 0) errors.push(`Unknown issue workflow(s): ${unknownWorkflows.join(', ')}.`);
    if (new Set(enabledWorkflows).size !== enabledWorkflows.length) errors.push('Issue workflow selection cannot contain duplicates.');
    for (const kind of ['release', 'hotfix'] as const) {
        if ((configuration.features[kind] !== false) !== enabledWorkflows.includes(kind)) {
            errors.push(`features.${kind} must match issueWorkflows.enabled; use the issue workflow selector as the source of truth.`);
        }
    }
    if (configuration.features.issues !== false && effectiveIssueWorkflowProfile(configuration).enabled.length === 0) {
        errors.push('At least one issue workflow must be enabled when issue automation is enabled.');
    }
    if (!configuration.repositoryAgentGuidance || !['prompt', 'create-if-missing', 'disabled'].includes(configuration.repositoryAgentGuidance.agentsPointer)) {
        errors.push('Repository agent guidance pointer must be prompt, create-if-missing, or disabled.');
    }
    for (const key of [
        'bug-label', 'bugfix-label', 'hotfix-label',
        'enhancement-label', 'feature-label', 'release-label', 'question-label', 'help-label',
        'deploy-label', 'deployed-label', 'docs-label', 'documentation-label', 'chore-label',
        'maintenance-label', 'priority-high-label', 'priority-medium-label', 'priority-low-label',
    ]) {
        const value = configuration.actionInputs[key];
        if (value !== undefined && (!value.trim() || value.length > 50 || /[\r\n]/u.test(value))) {
            errors.push(`Action input ${key} must be a non-empty single-line label of at most 50 characters.`);
        }
    }
    for (const key of ['release-workflow', 'hotfix-workflow']) {
        const value = configuration.actionInputs[key];
        if (value !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/u.test(value)) {
            errors.push(`Action input ${key} must be a safe workflow file name.`);
        }
    }
    const nonEmpty = [
        ['main branch', configuration.repository.mainBranch],
        ['development branch', configuration.repository.developmentBranch],
        ['feature branch prefix', configuration.repository.featureTree],
        ['bugfix branch prefix', configuration.repository.bugfixTree],
        ['hotfix branch prefix', configuration.repository.hotfixTree],
        ['release branch prefix', configuration.repository.releaseTree],
        ['docs branch prefix', configuration.repository.docsTree],
        ['chore branch prefix', configuration.repository.choreTree],
    ] as const;
    for (const [name, value] of nonEmpty) {
        if (!value.trim() || /\s/.test(value)) errors.push(`The ${name} must be non-empty and contain no whitespace.`);
    }
    if (configuration.repository.desiredAssigneesCount < 0 || configuration.repository.desiredAssigneesCount > 10) {
        errors.push('Desired assignees must be between 0 and 10.');
    }
    if (configuration.repository.desiredReviewersCount < 0 || configuration.repository.desiredReviewersCount > 15) {
        errors.push('Desired reviewers must be between 0 and 15.');
    }
    if (!Number.isInteger(configuration.repository.inactivityThresholdHours)
        || configuration.repository.inactivityThresholdHours < 1
        || configuration.repository.inactivityThresholdHours > MAX_INACTIVITY_THRESHOLD_HOURS) {
        errors.push(`Inactivity threshold must be between 1 and ${MAX_INACTIVITY_THRESHOLD_HOURS} hours.`);
    }
    validateLocale(errors, 'Repository locale', configuration.repository.repositoryLocale, false);
    validateLocale(errors, 'Issue locale override', configuration.repository.issueLocale, true);
    validateLocale(errors, 'Pull-request locale override', configuration.repository.pullRequestLocale, true);
    if (configuration.ai.bugbotCommentLimit < 1 || configuration.ai.bugbotCommentLimit > 100) {
        errors.push('Bugbot comment limit must be between 1 and 100.');
    }
    if (!['info', 'low', 'medium', 'high'].includes(configuration.ai.bugbotSeverity)) {
        errors.push('Bugbot severity must be info, low, medium, or high.');
    }
    if (!['low', 'default', 'high', 'smart'].includes(configuration.ai.bugbotEffort)) {
        errors.push('Bugbot review effort must be low, default, high, or smart.');
    }
    if (configuration.ai.bugbotOrganizationRules.length > 30_000) {
        errors.push('Bugbot organization rules must be at most 30000 characters.');
    }
    if (!['replace', 'append', 'preserve', 'disabled'].includes(configuration.ai.pullRequestDescriptionMode)) {
        errors.push('Pull-request description mode must be replace, append, preserve, or disabled.');
    }
    if (!['auto', 'always', 'disabled'].includes(configuration.ai.provisioningMode)) {
        errors.push('Agent provisioning must be auto, always, or disabled.');
    }
    errors.push(...validateDeploymentConfiguration({
        releaseReconciliationStrategy: configuration.repository.releaseReconciliationStrategy,
        hotfixReconciliationStrategy: configuration.repository.hotfixReconciliationStrategy,
        reconciliationPullRequestMode: configuration.repository.reconciliationPullRequestMode,
        reconciliationBackmergeMode: configuration.repository.reconciliationBackmergeMode,
        hotfixActiveReleasePolicy: configuration.repository.hotfixActiveReleasePolicy,
        reconciliationTree: configuration.repository.reconciliationTree,
        reconciliationCleanup: configuration.repository.reconciliationCleanup,
        reconciliationIssueCompletion: configuration.repository.reconciliationIssueCompletion,
        orchestrationPresentationMode: configuration.repository.orchestrationPresentationMode,
        orchestrationDiagrams: configuration.repository.orchestrationDiagrams,
        orchestrationCommentMode: configuration.repository.orchestrationCommentMode,
        mergeQueueCheckAttestations: configuration.repository.mergeQueueCheckAttestations,
    }, {
        productionBranch: configuration.repository.mainBranch,
        developmentBranch: configuration.repository.developmentBranch,
        releaseTree: configuration.repository.releaseTree,
        hotfixTree: configuration.repository.hotfixTree,
    }));
    errors.push(...validateStorageConfiguration(configuration.storage));
    for (const task of SETUP_AGENT_TASKS) {
        const agent = configuration.agents[task];
        if (!SUPPORTED_AGENT_PROVIDERS.includes(agent.provider)) errors.push(`Unsupported provider for ${task}: ${agent.provider}.`);
        if (!agent.modelProvider.trim() || !agent.model.trim()) errors.push(`Model provider and model are required for ${task}.`);
        if (/\s/.test(agent.model) || /\s/.test(agent.modelProvider)) errors.push(`Model provider and model for ${task} cannot contain whitespace.`);
    }
    return errors;
}

function validateLocale(errors: string[], label: string, value: string, optional: boolean): void {
    if (optional && !value.trim()) return;
    try {
        canonicalizeLocaleTag(value);
    } catch {
        errors.push(`${label} must be a valid BCP-47 language tag${optional ? ' or empty to inherit' : ''}.`);
    }
}
