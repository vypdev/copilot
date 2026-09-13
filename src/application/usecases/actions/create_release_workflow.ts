import { Result } from '../../../data/model/result';
import type { BoundRepositoryReleasePublicationPort } from '../../ports/repository_release_ports';
import type { DeploymentPublicationContext } from '../push_single_action_contexts';
import { logError, logWarn } from '../../ports/logging_ports';
import { validateReleaseInput, versionForRelease } from './create_release_policy';
import { validateDeploymentContinuation } from '../../policies/deployment_continuation_guard';
import { ApplicationError, toApplicationError } from '../../errors/application_error';

export async function runCreateRelease(
    param: DeploymentPublicationContext,
    taskId: string,
    repositoryReleasePort: BoundRepositoryReleasePublicationPort,
): Promise<Result[]> {
    const operation = param.operation;
    const continuationError = validateDeploymentContinuation(operation, param.requestedOperationId, ["publishing"], param.requestedVersion);
    if (continuationError) return [failureResult(taskId, continuationError, 'workflow.stale')];
    if (!operation?.productionSha) return [failureResult(taskId, 'The deployment operation has no accepted production SHA.', 'workflow.stale')];
    const input = {
        version: operation.version,
        title: operation.title,
        changelog: operation.changelog,
    };
    const validationError = validateReleaseInput(input);
    if (validationError) {
        logError(validationError);
        return [failureResult(taskId, validationError, 'validation.invalid-input')];
    }

    const releaseVersion = versionForRelease(input.version);
    try {
        const releaseUrl = await repositoryReleasePort.createRelease(
            releaseVersion,
            input.title,
            input.changelog,
            operation.operationId,
            operation.productionSha,
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
