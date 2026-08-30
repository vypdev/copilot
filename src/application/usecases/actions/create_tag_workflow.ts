import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { RepositoryTagPort } from '../../ports/repository_release_ports';
import { INPUT_KEYS } from '../../../utils/constants';
import { logError, logWarn } from '../../ports/logging_ports';

export async function runCreateTag(
    param: Execution,
    taskId: string,
    repositoryTagPort: RepositoryTagPort,
): Promise<Result[]> {
    const validationFailure = validateTagInput(param, taskId);
    if (validationFailure) return [validationFailure];
    const tagName = `v${param.singleAction.version}`;
    try {
        const sha1Tag = await repositoryTagPort.createTag(
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
    if (param.singleAction.version.length === 0) {
        logError('Version is not set.');
        return new Result({ id: taskId, success: false, executed: true, errors: [`${INPUT_KEYS.SINGLE_ACTION_VERSION} is not set.`] });
    }
    if (param.currentConfiguration.releaseBranch === undefined) {
        logError('Working branch not found in configuration.');
        return new Result({ id: taskId, success: false, executed: true, errors: ['Release branch not found in issue configuration.'] });
    }
    return undefined;
}

function noTagResult(taskId: string, tagName: string): Result[] {
    logWarn(`CreateTag: createTag returned no SHA for version ${tagName}.`);
    return [new Result({ id: taskId, success: false, executed: true, errors: [`Failed to create tag ${tagName}.`] })];
}
