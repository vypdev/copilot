import type { SetupConfiguration } from '../../domain/setup';
import { SETUP_AGENT_TASKS } from './setup_configuration_defaults';
import { SUPPORTED_AGENT_PROVIDERS } from './agent_configuration_validation_policy';
import { validateStorageConfiguration } from './setup_configuration_storage_policy';
import { MAX_INACTIVITY_THRESHOLD_HOURS } from '../../domain/issue_inactivity';

export function validateSetupConfiguration(configuration: SetupConfiguration): string[] {
    const errors: string[] = [];
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
    if (configuration.repository.mergeTimeout < 0) errors.push('Merge timeout cannot be negative.');
    if (!Number.isInteger(configuration.repository.inactivityThresholdHours)
        || configuration.repository.inactivityThresholdHours < 1
        || configuration.repository.inactivityThresholdHours > MAX_INACTIVITY_THRESHOLD_HOURS) {
        errors.push(`Inactivity threshold must be between 1 and ${MAX_INACTIVITY_THRESHOLD_HOURS} hours.`);
    }
    if (configuration.ai.bugbotCommentLimit < 1 || configuration.ai.bugbotCommentLimit > 100) {
        errors.push('Bugbot comment limit must be between 1 and 100.');
    }
    if (!['info', 'low', 'medium', 'high'].includes(configuration.ai.bugbotSeverity)) {
        errors.push('Bugbot severity must be info, low, medium, or high.');
    }
    if (configuration.ai.pullRequestDescriptionMode !== undefined
        && !['replace', 'append', 'preserve', 'disabled'].includes(configuration.ai.pullRequestDescriptionMode)) {
        errors.push('Pull-request description mode must be replace, append, preserve, or disabled.');
    }
    if (!['auto', 'always', 'disabled'].includes(configuration.ai.provisioningMode)) {
        errors.push('Agent provisioning must be auto, always, or disabled.');
    }
    errors.push(...validateStorageConfiguration(configuration.storage));
    for (const task of SETUP_AGENT_TASKS) {
        const agent = configuration.agents[task];
        if (!SUPPORTED_AGENT_PROVIDERS.includes(agent.provider)) errors.push(`Unsupported provider for ${task}: ${agent.provider}.`);
        if (!agent.modelProvider.trim() || !agent.model.trim()) errors.push(`Model provider and model are required for ${task}.`);
        if (/\s/.test(agent.model) || /\s/.test(agent.modelProvider)) errors.push(`Model provider and model for ${task} cannot contain whitespace.`);
    }
    return errors;
}
