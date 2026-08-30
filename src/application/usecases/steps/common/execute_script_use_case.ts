import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import { logDebugInfo, logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";
import { applyCommitPrefixTransform } from './commit_prefix_transform_policy';

export class CommitPrefixBuilderUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'CommitPrefixBuilderUseCase';

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`)

        const result: Result[] = []

        try {
            const branchName = param.commitPrefixBuilderParams.branchName as string;
            const transforms = param.commitPrefixBuilder; // Now it's a list of transforms
            
            const commitPrefix = buildCommitPrefix(branchName, transforms, (transform) => {
                logDebugInfo(`Unknown transform: ${transform}, skipping...`);
            });
            logDebugInfo(`Commit prefix generated: ${commitPrefix}`);

            result.push(
                new Result({
                    id: this.taskId,
                    success: true,
                    executed: true,
                    steps: [],
                    payload: {
                        scriptResult: commitPrefix
                    }
                })
            )
        } catch (error) {
            logError(error);
            result.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [],
                    errors: [error],
                })
            )
        }
        return result;
    }

}

export function buildCommitPrefix(
    branchName: string,
    transforms: string,
    onUnknownTransform?: (transform: string) => void,
): string {
    return transforms
        .split(',')
        .map((transform) => transform.trim())
        .reduce((result, transform) => applyCommitPrefixTransform(result, transform, onUnknownTransform), branchName);
}
