import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { RepositoryTagPort } from '../../ports/repository_release_ports';
import { INPUT_KEYS } from '../../contracts/input_keys';
import { logError, logWarn } from '../../ports/logging_ports';
import { validateDeploymentContinuation } from '../../policies/deployment_continuation_guard';

export async function runCreateTag(
    param: Execution,
    taskId: string,
    repositoryTagPort: RepositoryTagPort,
): Promise<Result[]> {
    const validationFailure = validateTagInput(param, taskId);
    if (validationFailure) return [validationFailure];
    const operation = param.currentConfiguration.deploymentOrchestration;
    const version = param.singleAction.version || operation?.version || '';
    const tagName = `v${version}`;
    try {
        const sha1Tag = operation?.productionSha
            ? await repositoryTagPort.createOrVerifyTagAtSha(
                param.owner,
                param.repo,
                operation.productionSha,
                tagName,
                param.tokens.token,
            )
            : await repositoryTagPort.createTag(
                param.owner,
                param.repo,
                param.currentConfiguration.releaseBranch!,
                tagName,
                param.tokens.token,
            );
        return sha1Tag ? [new Result({ id: taskId, success: true, executed: true, steps: [`Tag ${tagName} is ready: ${sha1Tag}`] })]
            : noTagResult(taskId, tagName);
    } catch (error) {
        logError(`Error executing ${taskId}: ${error}`);
        return [new Result({ id: taskId, success: false, executed: true, steps: [`Failed to create tag ${tagName}.`], errors: [error] })];
    }
}

function validateTagInput(param: Execution, taskId: string): Result | undefined {
    const operation = param.currentConfiguration.deploymentOrchestration;
    const continuationError = validateDeploymentContinuation(operation, param.singleAction.operationId, ["publishing"], param.singleAction.version);
    if (continuationError) return new Result({ id: taskId, success: false, executed: true, errors: [continuationError] });
    if (param.singleAction.version.length === 0 && !operation?.version) {
        logError('Version is not set.');
        return new Result({ id: taskId, success: false, executed: true, errors: [`${INPUT_KEYS.SINGLE_ACTION_VERSION} is not set.`] });
    }
    if (!operation?.productionSha && param.currentConfiguration.releaseBranch === undefined) {
        logError('Working branch not found in configuration.');
        return new Result({ id: taskId, success: false, executed: true, errors: ['Release branch not found in issue configuration.'] });
    }
    return undefined;
}

function noTagResult(taskId: string, tagName: string): Result[] {
    logWarn(`CreateTag: createTag returned no SHA for version ${tagName}.`);
    return [new Result({ id: taskId, success: false, executed: true, errors: [`Failed to create tag ${tagName}.`] })];
}
