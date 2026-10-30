import type { Result } from '../../../../data/model/result';
import type { ParamUseCase } from '../../base/param_usecase';
import type { PullRequestDescriptionRequest } from '../../pull_request_workflow_context';

/** Called by the comment router only after its existing actor authorization. */
export async function runPreparedDescriptionCommand(
    request: PullRequestDescriptionRequest,
    description: ParamUseCase<PullRequestDescriptionRequest, Result[]>,
    prepare?: () => Promise<Result[]>,
): Promise<Result[]> {
    if (request.trigger !== 'authorized-command' || request.context.mode === 'disabled' || !prepare) {
        return description.invoke(request);
    }
    const recovery = await prepare();
    if (recovery.some(result => !result.success)) return recovery;
    return [...recovery, ...await description.invoke(request)];
}
