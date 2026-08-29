import { Execution } from "../../../../data/model/execution";
import { Result } from "../../../../data/model/result";
import { logDebugInfo, logError, logInfo } from "../../../ports/logging_ports";
import { getTaskEmoji } from "../../../../utils/task_emoji";
import { ParamUseCase } from "../../base/param_usecase";

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
        .reduce((result, transform) => applyTransform(result, transform, onUnknownTransform), branchName);
}

function applyTransform(
    input: string,
    transform: string,
    onUnknownTransform?: (transform: string) => void,
): string {
    switch (transform) {
        case "replace-slash":
            return input.replace("/", "-");
        case "replace-all":
            return input.replace(/[^a-zA-Z0-9-]/g, "-");
        case "lowercase":
            return input.toLowerCase();
        case "uppercase":
            return input.toUpperCase();
        case "kebab-case":
            return input
                .replace(/[^a-zA-Z0-9-]/g, "-")
                .replace(/-+/g, "-")
                .replace(/^-|-$/g, "")
                .toLowerCase();
        case "snake-case":
            return input
                .replace(/[^a-zA-Z0-9-]/g, "_")
                .replace(/_+/g, "_")
                .replace(/^_|_$/g, "")
                .toLowerCase();
        case "camel-case":
            return input
                .replace(/[^a-zA-Z0-9-]/g, "-")
                .split("-")
                .map((word, index) => index === 0
                    ? word.toLowerCase()
                    : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join("");
        case "trim":
            return input.trim();
        case "remove-numbers":
            return input.replace(/\d+/g, "");
        case "remove-special":
            return input.replace(/[^a-zA-Z0-9]/g, "");
        case "remove-spaces":
            return input.replace(/\s+/g, "");
        case "remove-dashes":
            return input.replace(/-+/g, "");
        case "remove-underscores":
            return input.replace(/_+/g, "");
        case "clean-dashes":
            return input.replace(/-+/g, "-").replace(/^-|-$/g, "");
        case "clean-underscores":
            return input.replace(/_+/g, "_").replace(/^_|_$/g, "");
        case "prefix":
            return `prefix-${input}`;
        case "suffix":
            return `${input}-suffix`;
        default:
            onUnknownTransform?.(transform);
            return input;
    }
}
