import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { RepositoryReleasePublicationPort, RepositoryTagPort } from '../../ports/repository_release_ports';
import { INPUT_KEYS } from '../../contracts/input_keys';
import { logError, logInfo } from '../../ports/logging_ports';
import { validateDeploymentContinuation } from '../../policies/deployment_continuation_guard';

export async function runPublishGithubAction(
    param: Execution,
    taskId: string,
    repositoryTagPort: RepositoryTagPort,
    repositoryReleasePort: RepositoryReleasePublicationPort,
): Promise<Result[]> {
    const validationFailure = validateVersion(param, taskId);
    if (validationFailure) return [validationFailure];
    const version = param.singleAction.version || param.currentConfiguration?.deploymentOrchestration?.version || '';
    const sourceTag = `v${version}`;
    const targetTag = sourceTag.split('.')[0];
    try {
        await repositoryTagPort.updateTag(param.owner, param.repo, sourceTag, targetTag, param.tokens.token);
        const releaseId = await repositoryReleasePort.updateRelease(
            param.owner,
            param.repo,
            sourceTag,
            targetTag,
            param.tokens.token,
        );
        return releaseId ? successResult(taskId, sourceTag, targetTag, releaseId) : failureResult(taskId, sourceTag, targetTag);
    } catch (error) {
        logError(`Error executing ${taskId}: ${error}`);
        return [new Result({
            id: taskId,
            success: false,
            executed: true,
            steps: [`Failed to update release \`${targetTag}\` from \`${sourceTag}\`.`],
            errors: [error],
        })];
    }
}

function validateVersion(param: Execution, taskId: string): Result | undefined {
    const continuationError = validateDeploymentContinuation(
        param.currentConfiguration?.deploymentOrchestration,
        param.singleAction.operationId,
        ["publishing"],
        param.singleAction.version,
    );
    if (continuationError) return new Result({ id: taskId, success: false, executed: true, errors: [continuationError] });
    if (param.singleAction.version.length > 0 || param.currentConfiguration?.deploymentOrchestration?.version) return undefined;
    logError('Version is not set.');
    return new Result({ id: taskId, success: false, executed: true, errors: [`${INPUT_KEYS.SINGLE_ACTION_VERSION} is not set.`] });
}

function successResult(taskId: string, sourceTag: string, targetTag: string, releaseId: string): Result[] {
    logInfo(`Updated release \`${targetTag}\` from \`${sourceTag}\`: ${releaseId}`);
    return [new Result({ id: taskId, success: true, executed: true, steps: [`Updated release \`${targetTag}\` from \`${sourceTag}\`.`] })];
}

function failureResult(taskId: string, sourceTag: string, targetTag: string): Result[] {
    return [new Result({ id: taskId, success: false, executed: true, errors: [`Failed to update release \`${targetTag}\` from \`${sourceTag}\`.`] })];
}
