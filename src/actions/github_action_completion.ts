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
import type { CopilotEvidencePort } from '../application/ports/copilot_evidence_ports';
import { buildCopilotEvidence } from '../application/policies/copilot_evidence_policy';
import type { ActionSummaryPort } from '../application/ports/action_summary_ports';
import { shouldPersistConfiguration } from '../application/policies/configuration_persistence_policy';

export async function finishGithubAction(
    execution: Execution,
    results: Result[],
    issueNotificationPort: ConstructorParameters<typeof PublishResultUseCase>[0],
    configurationStorePort: ConfigurationStorePort,
    evidencePort?: CopilotEvidencePort,
    summaryPort?: ActionSummaryPort,
): Promise<void> {
    const stepCount = results.reduce((acc, result) => acc + (result.steps?.length ?? 0), 0);
    const errorCount = results.reduce((acc, result) => acc + (result.errors?.length ?? 0), 0);
    logInfo(`Publishing result: ${results.length} result(s), ${stepCount} step(s), ${errorCount} error(s).`);

    execution.currentConfiguration.results = results;
    core.setOutput('bugbot-telemetry', JSON.stringify(extractBugbotTelemetry(results)));
    const dryRun = results.some((result) => getResultPayload(result.payload)?.dryRun === true);
    if (!dryRun) {
        await new PublishResultUseCase(issueNotificationPort, createLogReportAdapter()).invoke(execution);
    } else {
        logInfo('Bugbot dry-run: result publication and repository configuration persistence are disabled.');
    }
    commitPublishedRecommendationState(execution, results);
    if (!dryRun && shouldPersistConfiguration(execution)) {
        await new StoreConfigurationUseCase(configurationStorePort).invoke(execution);
        logInfo('Configuration stored. Finishing.');
    } else {
        logInfo('Configuration persistence skipped: this single action does not modify execution configuration.');
    }
    const summary = await writeActionSummary(execution, summaryPort);
    if (!dryRun) await publishCopilotEvidence(execution, results, summary, evidencePort);
    failActionForUnresolvedFindingsIfConfigured(execution, results, dryRun);
    setFirstErrorIfExists(results);
}

function extractBugbotTelemetry(results: readonly Result[]): unknown[] {
    return results.flatMap((result) => {
        const snapshot = getResultPayload(result.payload)?.bugbotTelemetry;
        return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? [snapshot] : [];
    });
}

async function writeActionSummary(execution: Execution, summaryPort?: ActionSummaryPort): Promise<string> {
    const summaryText = buildActionSummary({
        owner: execution.owner,
        repository: execution.repo,
        eventName: execution.eventName,
        issueNumber: execution.issue?.number ?? -1,
        pullRequestNumber: execution.pullRequest?.number ?? -1,
        lifecycleState: lifecycleStateFromLabels(
            execution.isPullRequest
                ? execution.labels?.currentPullRequestLabels ?? []
                : execution.labels?.currentIssueLabels ?? [],
            execution.labels?.lifecycle,
        ),
        pullRequestDescriptionMode: execution.ai?.getPullRequestDescriptionMode?.(),
        failOnUnresolvedFindings: execution.ai?.getBugbotReviewConfiguration?.().failOnUnresolved === true,
        results: execution.currentConfiguration.results,
    });
    if (!summaryPort) return summaryText;
    try {
        await summaryPort.publish(summaryText);
    } catch (error) {
        logInfo(`Could not write GitHub Actions summary: ${error instanceof Error ? error.message : String(error)}`);
    }
    return summaryText;
}

async function publishCopilotEvidence(
    execution: Execution,
    results: Result[],
    summary: string,
    evidencePort: CopilotEvidencePort | undefined,
): Promise<void> {
    if (!evidencePort) return;
    const headSha = execution.inputs?.pull_request?.head?.sha
        || (execution.isPush ? process.env.GITHUB_SHA : undefined);
    const evidence = buildCopilotEvidence({
        eventName: execution.eventName,
        headSha,
        summary,
        results,
        failOnUnresolvedFindings: execution.ai?.getBugbotReviewConfiguration?.().failOnUnresolved === true,
    });
    if (!evidence) return;
    try {
        const evidenceToken = process.env.COPILOT_EVIDENCE_TOKEN?.trim() || execution.tokens.token;
        await evidencePort.publish(evidence, execution.owner, execution.repo, evidenceToken);
        logInfo(`Published ${evidence.name} Check Run for ${evidence.headSha}.`);
    } catch (error) {
        logInfo(`Could not publish optional GitHub Check Run: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function failActionForUnresolvedFindingsIfConfigured(
    execution: Execution,
    results: readonly Result[],
    dryRun: boolean,
): void {
    if (dryRun || execution.ai?.getBugbotReviewConfiguration?.().failOnUnresolved !== true) return;
    const unresolved = results.reduce((count, result) => {
        const states = getResultPayload(getResultPayload(result.payload)?.findingStates);
        return count + (typeof states?.open === 'number' ? states.open : 0)
            + (typeof states?.reopened === 'number' ? states.reopened : 0);
    }, 0);
    if (unresolved > 0) core.setFailed(`Bugbot found ${unresolved} unresolved actionable finding(s).`);
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
