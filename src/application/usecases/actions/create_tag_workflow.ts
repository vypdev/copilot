import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { RepositoryTagPort } from '../../ports/repository_release_ports';
import { logError, logWarn } from '../../ports/logging_ports';
import { validateDeploymentContinuation } from '../../policies/deployment_continuation_guard';
import { ApplicationError, toApplicationError } from '../../errors/application_error';

export async function runCreateTag(
    param: Execution,
    taskId: string,
    repositoryTagPort: RepositoryTagPort,
): Promise<Result[]> {
    const validationFailure = validateTagInput(param, taskId);
    if (validationFailure) return [validationFailure];
    const operation = param.currentConfiguration.deploymentOrchestration!;
    const version = operation.version;
    const tagName = `v${version}`;
    try {
        const sha1Tag = await repositoryTagPort.createOrVerifyTagAtSha(
            param.owner,
            param.repo,
            operation.productionSha!,
            tagName,
            param.tokens.token,
        );
        return sha1Tag ? [new Result({ id: taskId, success: true, executed: true, steps: [`Tag ${tagName} is ready: ${sha1Tag}`] })]
            : noTagResult(taskId, tagName);
    } catch (error) {
        const semanticError = toApplicationError(error, 'provider.unavailable', `Unable to create tag ${tagName}.`);
        logError(semanticError);
        return [new Result({ id: taskId, success: false, executed: true, steps: [`Failed to create tag ${tagName}.`], errors: [semanticError] })];
    }
}

function validateTagInput(param: Execution, taskId: string): Result | undefined {
    const operation = param.currentConfiguration.deploymentOrchestration;
    if (!operation) {
        return new Result({ id: taskId, success: false, executed: true, errors: [new ApplicationError('workflow.invalid-event', 'create_tag requires a durable deployment operation.')] });
    }
    const continuationError = validateDeploymentContinuation(operation, param.singleAction.operationId, ["publishing"], param.singleAction.version);
    if (continuationError) return new Result({ id: taskId, success: false, executed: true, errors: [new ApplicationError('workflow.stale', continuationError)] });
    if (!operation.productionSha) {
        return new Result({ id: taskId, success: false, executed: true, errors: [new ApplicationError('workflow.stale', 'The deployment operation has no accepted production SHA.')] });
    }
    return undefined;
}

function noTagResult(taskId: string, tagName: string): Result[] {
    logWarn(`CreateTag: createTag returned no SHA for version ${tagName}.`);
    return [new Result({ id: taskId, success: false, executed: true, errors: [new ApplicationError('provider.contract-invalid', `Failed to create tag ${tagName}.`)] })];
}
