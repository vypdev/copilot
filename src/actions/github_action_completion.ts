import * as core from '@actions/core';
import type { Execution } from '../data/model/execution';
import { getResultPayload, type Result } from '../data/model/result';
import { isRecommendationState } from '../data/model/recommendation_state';
import type { ConfigurationStorePort } from '../application/ports/configuration_store_ports';
import { PublishResultUseCase } from '../application/usecases/steps/common/publish_resume_use_case';
import { StoreConfigurationUseCase } from '../application/usecases/steps/common/store_configuration_use_case';

import { logInfo } from '../utils/logger';
import { createLogReportAdapter } from '../infrastructure/logging/logger_adapter';
import { buildActionSummary } from '../application/policies/action_summary_policy';
import { lifecycleStateFromLabels } from '../domain/copilot_lifecycle';

export async function finishGithubAction(
    execution: Execution,
    results: Result[],
    issueNotificationPort: ConstructorParameters<typeof PublishResultUseCase>[0],
    configurationStorePort: ConfigurationStorePort,
): Promise<void> {
    const stepCount = results.reduce((acc, result) => acc + (result.steps?.length ?? 0), 0);
    const errorCount = results.reduce((acc, result) => acc + (result.errors?.length ?? 0), 0);
    logInfo(`Publishing result: ${results.length} result(s), ${stepCount} step(s), ${errorCount} error(s).`);

    execution.currentConfiguration.results = results;
    await new PublishResultUseCase(issueNotificationPort, createLogReportAdapter()).invoke(execution);
    commitPublishedRecommendationState(execution, results);
    await new StoreConfigurationUseCase(configurationStorePort).invoke(execution);
    await writeActionSummary(execution);
    logInfo('Configuration stored. Finishing.');

    if (execution.isSingleAction && execution.singleAction.throwError) {
        setFirstErrorIfExists(results);
    }
}

async function writeActionSummary(execution: Execution): Promise<void> {
    const summary = core.summary;
    if (!summary || typeof summary.addRaw !== 'function' || typeof summary.write !== 'function') return;
    try {
        const targetLabels = execution.isPullRequest
            ? execution.labels.currentPullRequestLabels
            : execution.labels.currentIssueLabels;
        const lifecycleState = lifecycleStateFromLabels(targetLabels, execution.labels.lifecycle);
        await summary
            .addRaw(buildActionSummary({
                owner: execution.owner,
                repository: execution.repo,
                eventName: execution.eventName,
                issueNumber: execution.issue.number,
                pullRequestNumber: execution.pullRequest.number,
                lifecycleState,
                results: execution.currentConfiguration.results,
            }))
            .write();
    } catch (error) {
        logInfo(`Could not write GitHub Actions summary: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function commitPublishedRecommendationState(execution: Execution, results: Result[]): void {
    const pendingState = results
        .map((result) => getResultPayload(result.payload)?.recommendationState)
        .find(isRecommendationState);
    if (!pendingState) return;

    const publicationFailed = execution.currentConfiguration.results.some(
        (result) => result.id === 'PublishResultUseCase' && !result.success,
    );
    if (!publicationFailed) {
        execution.currentConfiguration.recommendationState = pendingState;
    }
}

function setFirstErrorIfExists(results: Result[]): void {
    for (const result of results) {
        if (result.errors && result.errors.length > 0) {
            core.setFailed(result.errors[0].message);
            return;
        }
    }
}
