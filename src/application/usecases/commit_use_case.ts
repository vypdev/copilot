import { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { logDebugInfo, logError, logInfo } from "../ports/logging_ports";
import { getTaskEmoji } from "../../utils/task_emoji";
import { ParamUseCase } from "./base/param_usecase";
import { CheckProgressUseCase } from "./actions/check_progress_use_case";

export class CommitUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'CommitUseCase';

    constructor(
        private readonly notifyNewCommitUseCase: ParamUseCase<Execution, Result[]>,
        private readonly checkChangesIssueSizeUseCase: ParamUseCase<Execution, Result[]>,
        private readonly detectPotentialProblemsUseCase: ParamUseCase<Execution, Result[]>,
        private readonly checkProgressUseCase: CheckProgressUseCase,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);

        const results: Result[] = [];
        try {
            if (param.commit.commits.length === 0) {
                logDebugInfo('No commits found in this push.');
                return results;
            }

            logDebugInfo(`Branch: ${param.commit.branch}`);
            logDebugInfo(`Commits detected: ${param.commit.commits.length}`);
            logDebugInfo(`Issue number: ${param.issueNumber}`);

            results.push(...(await this.notifyNewCommitUseCase.invoke(param)));
            results.push(...(await this.checkChangesIssueSizeUseCase.invoke(param)));
            results.push(...(await this.checkProgressUseCase.invoke(param)));
            results.push(...(await this.detectPotentialProblemsUseCase.invoke(param)));
        } catch (error) {
            logError(error);
            results.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [
                        `Error processing the commits.`,
                    ],
                    errors: [error],
                })
            )
        }
        return results;
    }
}
