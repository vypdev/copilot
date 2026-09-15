import * as core from '@actions/core';
import type { Execution } from '../data/model/execution';
import { renderApplicationErrorText } from '../application/policies/application_error_presentation_policy';
import { getResultPayload, type Result } from '../data/model/result';
import { isRecommendationState } from '../data/model/recommendation_state';
import type { ConfigurationStorePort } from '../application/ports/configuration_store_ports';
import { PublishResultUseCase } from '../application/usecases/steps/common/publish_resume_use_case';
import { StoreConfigurationUseCase } from '../application/usecases/steps/common/store_configuration_use_case';
import { projectPublishResultContext } from '../application/usecases/steps/common/publish_resume_workflow';
import { projectConfigurationPersistenceContext } from '../application/usecases/steps/common/store_configuration_use_case';

import { logInfo } from '../utils/logger';
import {
    buildActionSummary,
    renderLocalizationSummarySection,
    type LocalizationSummaryLabels,
} from '../application/policies/action_summary_policy';
import { resolveActionSummaryCatalog } from '../application/policies/action_summary_message_catalog';
import { lifecycleStateFromLabels } from '../domain/copilot_lifecycle';
import type { CopilotEvidencePort } from '../application/ports/copilot_evidence_ports';
import { buildCopilotEvidence } from '../application/policies/copilot_evidence_policy';
import type { ActionSummaryPort } from '../application/ports/action_summary_ports';
import { ApplicationError, toApplicationError } from '../application/errors/application_error';
import { shouldPersistConfiguration } from '../application/policies/configuration_persistence_policy';
import { renderDeploymentJobSummary } from '../application/policies/deployment_presentation_policy';
import { deploymentCopy, resolveDeploymentCatalog } from '../application/policies/deployment_message_catalog';
import { projectBugbotResultFindingStates } from '../application/policies/bugbot_result_finding_state_projection_policy';
import { countActionableBugbotFindings } from '../domain/bugbot/review_state';
import type { MessageCatalogResolutionPort } from '../application/ports/message_catalog_ports';
import type { ApplicationErrorMessageReader } from '../application/policies/application_error_message_catalog';
import type { BoundPublicationSourceQueryPort } from '../application/ports/publication_freshness_ports';

export async function finishGithubAction(
    execution: Execution,
    results: Result[],
    issueNotificationPort: ConstructorParameters<typeof PublishResultUseCase>[0],
    configurationStorePort: ConfigurationStorePort,
    evidencePort?: CopilotEvidencePort,
    summaryPort?: ActionSummaryPort,
    catalogResolver?: MessageCatalogResolutionPort,
    publicationSourceQuery?: BoundPublicationSourceQueryPort,
): Promise<void> {
    const stepCount = results.reduce((acc, result) => acc + (result.steps?.length ?? 0), 0);
    const errorCount = results.reduce((acc, result) => acc + (result.errors?.length ?? 0), 0);
    logInfo(`Publishing result: ${results.length} result(s), ${stepCount} step(s), ${errorCount} error(s).`);

    execution.currentConfiguration.results = results;
    core.setOutput('bugbot-telemetry', JSON.stringify(extractBugbotTelemetry(results)));
    const dryRun = results.some((result) => getResultPayload(result.payload)?.dryRun === true);
    const ownsDeploymentPresentation = execution.singleAction.isDeploymentOrchestrationAction;
    if (!dryRun && !execution.singleAction.isPublishIssueCommentAction && !ownsDeploymentPresentation) {
        const publicationOutcome = await new PublishResultUseCase(
            issueNotificationPort,
            catalogResolver,
            publicationSourceQuery,
        ).invoke(projectPublishResultContext(execution));
        if (publicationOutcome) results.push(publicationOutcome);
    } else if (execution.singleAction.isPublishIssueCommentAction || ownsDeploymentPresentation) {
        logInfo('Generic result publication skipped: this single action owns its user-facing presentation.');
    } else {
        logInfo('Bugbot dry-run: result publication and repository configuration persistence are disabled.');
    }
    commitPublishedRecommendationState(execution, results);
    if (!dryRun && shouldPersistConfiguration(execution)) {
        const configuration = projectConfigurationPersistenceContext(execution);
        if (configuration) {
            await new StoreConfigurationUseCase(configurationStorePort).invoke(configuration);
            logInfo('Configuration stored. Finishing.');
        } else {
            logInfo('Configuration persistence skipped: no valid issue target was resolved.');
        }
    } else {
        logInfo('Configuration persistence skipped: this single action does not modify execution configuration.');
    }
    const summary = await writeActionSummary(execution, summaryPort, catalogResolver);
    if (!dryRun) await publishCopilotEvidence(execution, results, summary.text, evidencePort);
    const completionError = firstApplicationError(results)
        ?? bugbotCompletionError(execution, results, dryRun);
    if (completionError) core.setFailed(renderApplicationErrorText(completionError, summary.errorMessage));
}

interface WrittenActionSummary {
    readonly text: string;
    readonly errorMessage: ApplicationErrorMessageReader;
}

function extractBugbotTelemetry(results: readonly Result[]): unknown[] {
    return results.flatMap((result) => {
        const snapshot = getResultPayload(result.payload)?.bugbotTelemetry;
        return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? [snapshot] : [];
    });
}

async function writeActionSummary(
    execution: Execution,
    summaryPort?: ActionSummaryPort,
    catalogResolver?: MessageCatalogResolutionPort,
): Promise<WrittenActionSummary> {
    const operation = execution.currentConfiguration.deploymentOrchestration;
    const locale = execution.locale ?? { repository: 'en-US', issue: 'en-US', pullRequest: 'en-US' };
    const summaryLocale = execution.singleAction.isDeploymentOrchestrationAction && operation?.locale
        ? operation.locale
        : locale;
    let body: string;
    let localizationLabels: LocalizationSummaryLabels | undefined;
    let appendLocalizationEvidence = false;
    let errorMessage: ApplicationErrorMessageReader;
    if (execution.singleAction.isDeploymentOrchestrationAction && operation) {
        const effectiveLocale = operation.locale ?? locale;
        const catalog = await resolveDeploymentCatalog(
            effectiveLocale.repository,
            execution.ai.getAgentConfiguration('planner'),
            catalogResolver,
        );
        const messages = deploymentCopy(catalog);
        errorMessage = (id, variables) => catalog.message(id, variables);
        localizationLabels = {
            heading: messages.localization,
            property: messages.property,
            value: messages.value,
            repositoryLocale: messages.repositoryLocaleLabel,
            issueLocale: messages.issueLocaleLabel,
            pullRequestLocale: messages.pullRequestLocaleLabel,
            catalogResolution: messages.catalogResolution,
            descriptors: messages.descriptors,
            reason: messages.reason,
        };
        appendLocalizationEvidence = true;
        body = renderDeploymentJobSummary(operation, {
            owner: execution.owner,
            repository: execution.repo,
            issue: execution.singleAction.issue,
            repositoryLocale: effectiveLocale.repository,
            issueLocale: effectiveLocale.issue,
            pullRequestLocale: effectiveLocale.pullRequest,
            packageName: execution.owner === 'vypdev' && execution.repo === 'copilot' ? '@vypdev/copilot' : undefined,
            workflowRunUrl: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
                ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
                : undefined,
        }, operation.lastFailure?.previousPhase, catalog);
    } else {
        const catalog = await resolveActionSummaryCatalog(
            locale.repository,
            execution.ai.getAgentConfiguration('planner'),
            catalogResolver,
        );
        errorMessage = (id, variables) => catalog.message(id, variables);
        body = buildActionSummary({
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
            pullRequestDescriptionMode: execution.ai.getPullRequestDescriptionMode(),
            failOnUnresolvedFindings: execution.ai.getBugbotReviewConfiguration().failOnUnresolved,
            locale: {
                repository: locale.repository,
                issue: locale.issue,
                pullRequest: locale.pullRequest,
            },
            catalogResolutions: catalogResolver?.observations?.() ?? [],
            results: execution.currentConfiguration.results,
        }, catalog);
    }
    const localizationEvidence = appendLocalizationEvidence
        ? renderLocalizationSummarySection({
            repository: summaryLocale.repository,
            issue: summaryLocale.issue,
            pullRequest: summaryLocale.pullRequest,
        }, catalogResolver?.observations?.() ?? [], localizationLabels)
        : '';
    const summaryText = [body, localizationEvidence].filter(Boolean).join('\n\n');
    if (!summaryPort) return { text: summaryText, errorMessage };
    try {
        await summaryPort.publish(summaryText);
    } catch (error) {
        logInfo(toApplicationError(error, 'provider.unavailable', 'Could not write the GitHub Actions summary.').message);
    }
    return { text: summaryText, errorMessage };
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
        failOnUnresolvedFindings: execution.ai.getBugbotReviewConfiguration().failOnUnresolved,
    });
    if (!evidence) return;
    try {
        const evidenceToken = process.env.COPILOT_EVIDENCE_TOKEN?.trim() || execution.tokens.token;
        await evidencePort.publish(evidence, execution.owner, execution.repo, evidenceToken);
        logInfo(`Published ${evidence.name} Check Run for ${evidence.headSha}.`);
    } catch (error) {
        logInfo(toApplicationError(error, 'provider.unavailable', 'Could not publish the optional GitHub Check Run.').message);
    }
}

function bugbotCompletionError(
    execution: Execution,
    results: readonly Result[],
    dryRun: boolean,
): ApplicationError | undefined {
    if (dryRun) return undefined;
    const projection = projectBugbotResultFindingStates(results);
    if (projection.status === 'invalid') {
        return new ApplicationError('provider.contract-invalid', 'Bugbot finding-state evidence is malformed.');
    }
    if (projection.status === 'absent') return undefined;
    if (projection.counts.unknown > 0) {
        return new ApplicationError('provider.contract-invalid', 'Bugbot finding-state evidence could not be verified.');
    }
    if (
        execution.ai.getBugbotReviewConfiguration().failOnUnresolved
        && countActionableBugbotFindings(projection.counts) > 0
    ) {
        return new ApplicationError('workflow.failed', 'Bugbot found unresolved actionable findings.');
    }
    return undefined;
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

function firstApplicationError(results: readonly Result[]): Result['errors'][number] | undefined {
    for (const result of results) {
        if (result.errors && result.errors.length > 0) {
            return result.errors[0];
        }
    }
    return undefined;
}
