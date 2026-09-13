import { Result } from '../../../data/model/result';
import type { BoundRepositoryReleasePublicationPort, BoundRepositoryTagPort } from '../../ports/repository_release_ports';
import type { DeploymentPublicationContext } from '../push_single_action_contexts';
import { INPUT_KEYS } from '../../contracts/input_keys';
import { logError, logInfo } from '../../ports/logging_ports';
import { validateDeploymentContinuation } from '../../policies/deployment_continuation_guard';
import { ApplicationError, toApplicationError } from '../../errors/application_error';

export async function runPublishGithubAction(
    param: DeploymentPublicationContext,
    taskId: string,
    repositoryTagPort: BoundRepositoryTagPort,
    repositoryReleasePort: BoundRepositoryReleasePublicationPort,
): Promise<Result[]> {
    const validationFailure = validateVersion(param, taskId);
    if (validationFailure) return [validationFailure];
    const version = param.requestedVersion || param.operation?.version || '';
    const sourceTag = `v${version}`;
    const targetTag = sourceTag.split('.')[0];
    try {
        await repositoryTagPort.updateTag(sourceTag, targetTag);
        const releaseId = await repositoryReleasePort.updateRelease(
            sourceTag,
            targetTag,
        );
        return releaseId ? successResult(taskId, sourceTag, targetTag, releaseId) : failureResult(taskId, sourceTag, targetTag);
    } catch (error) {
        const semanticError = toApplicationError(error, 'provider.unavailable', `Unable to update release ${targetTag} from ${sourceTag}.`);
        logError(semanticError);
        return [new Result({
            id: taskId,
            success: false,
            executed: true,
            steps: [`Failed to update release \`${targetTag}\` from \`${sourceTag}\`.`],
            errors: [semanticError],
        })];
    }
}

function validateVersion(param: DeploymentPublicationContext, taskId: string): Result | undefined {
    const continuationError = validateDeploymentContinuation(
        param.operation,
        param.requestedOperationId,
        ["publishing"],
        param.requestedVersion,
    );
    if (continuationError) return new Result({ id: taskId, success: false, executed: true, errors: [new ApplicationError('workflow.stale', continuationError)] });
    if (param.requestedVersion.length > 0 || param.operation?.version) return undefined;
    logError('Version is not set.');
    return new Result({ id: taskId, success: false, executed: true, errors: [new ApplicationError('validation.invalid-input', `${INPUT_KEYS.SINGLE_ACTION_VERSION} is not set.`)] });
}

function successResult(taskId: string, sourceTag: string, targetTag: string, releaseId: string): Result[] {
    logInfo(`Updated release \`${targetTag}\` from \`${sourceTag}\`: ${releaseId}`);
    return [new Result({ id: taskId, success: true, executed: true, steps: [`Updated release \`${targetTag}\` from \`${sourceTag}\`.`] })];
}

function failureResult(taskId: string, sourceTag: string, targetTag: string): Result[] {
    return [new Result({ id: taskId, success: false, executed: true, errors: [new ApplicationError('provider.contract-invalid', `Failed to update release ${targetTag} from ${sourceTag}.`)] })];
}
