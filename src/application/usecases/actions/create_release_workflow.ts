import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { RepositoryReleasePublicationPort } from '../../ports/repository_release_ports';
import { logError, logWarn } from '../../ports/logging_ports';
import { validateReleaseInput, versionForRelease } from './create_release_policy';
import { validateDeploymentContinuation } from '../../policies/deployment_continuation_guard';

export async function runCreateRelease(
    param: Execution,
    taskId: string,
    repositoryReleasePort: RepositoryReleasePublicationPort,
): Promise<Result[]> {
    const operation = param.currentConfiguration.deploymentOrchestration;
    const continuationError = validateDeploymentContinuation(operation, param.singleAction.operationId, ["publishing"], param.singleAction.version);
    if (continuationError) return [failureResult(taskId, continuationError)];
    const input = {
        version: param.singleAction.version || operation?.version || '',
        title: param.singleAction.title || operation?.title || '',
        changelog: param.singleAction.changelog || operation?.changelog || '',
    };
    const validationError = validateReleaseInput(input);
    if (validationError) {
        logError(validationError);
        return [failureResult(taskId, validationError)];
    }

    const releaseVersion = versionForRelease(input.version);
    try {
        const releaseUrl = await repositoryReleasePort.createRelease(
            param.owner,
            param.repo,
            releaseVersion,
            input.title,
            input.changelog,
            param.tokens.token,
        );
        if (!releaseUrl) {
            logWarn(`CreateRelease: createRelease returned no URL for version ${releaseVersion}.`);
            return [failureResult(taskId, 'Failed to create release.')];
        }
        return [new Result({
            id: taskId,
            success: true,
            executed: true,
            steps: [`Created release \`${releaseUrl}\`.`],
        })];
    } catch (error) {
        logError(`Error executing ${taskId}: ${error}`);
        return [new Result({
            id: taskId,
            success: false,
            executed: true,
            steps: ['Failed to create release.'],
            errors: [error],
        })];
    }
}

function failureResult(taskId: string, error: string): Result {
    return new Result({ id: taskId, success: false, executed: true, errors: [error] });
}
