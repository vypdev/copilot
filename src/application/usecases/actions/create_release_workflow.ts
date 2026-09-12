import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { RepositoryReleasePublicationPort } from '../../ports/repository_release_ports';
import { logError, logWarn } from '../../ports/logging_ports';
import { validateReleaseInput, versionForRelease } from './create_release_policy';
import { validateDeploymentContinuation } from '../../policies/deployment_continuation_guard';
import { ApplicationError, toApplicationError } from '../../errors/application_error';

export async function runCreateRelease(
    param: Execution,
    taskId: string,
    repositoryReleasePort: RepositoryReleasePublicationPort,
): Promise<Result[]> {
    const operation = param.currentConfiguration.deploymentOrchestration;
    const continuationError = validateDeploymentContinuation(operation, param.singleAction.operationId, ["publishing"], param.singleAction.version);
    if (continuationError) return [failureResult(taskId, continuationError, 'workflow.stale')];
    const input = {
        version: param.singleAction.version || operation?.version || '',
        title: param.singleAction.title || operation?.title || '',
        changelog: param.singleAction.changelog || operation?.changelog || '',
    };
    const validationError = validateReleaseInput(input);
    if (validationError) {
        logError(validationError);
        return [failureResult(taskId, validationError, 'validation.invalid-input')];
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
            return [failureResult(taskId, 'Failed to create release.', 'provider.contract-invalid')];
        }
        return [new Result({
            id: taskId,
            success: true,
            executed: true,
            steps: [`Created release \`${releaseUrl}\`.`],
        })];
    } catch (error) {
        const semanticError = toApplicationError(error, 'provider.unavailable', 'Unable to create the release.');
        logError(semanticError);
        return [new Result({
            id: taskId,
            success: false,
            executed: true,
            steps: ['Failed to create release.'],
            errors: [semanticError],
        })];
    }
}

function failureResult(taskId: string, message: string, code: ConstructorParameters<typeof ApplicationError>[0]): Result {
    return new Result({ id: taskId, success: false, executed: true, errors: [new ApplicationError(code, message)] });
}
