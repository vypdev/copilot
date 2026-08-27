import { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { logDebugInfo, logError, logInfo, logWarn } from "../../utils/logger";
import { getTaskEmoji } from "../../utils/task_emoji";
import { ParamUseCase } from "./base/param_usecase";

export class SingleActionUseCase implements ParamUseCase<Execution, Result[]> {
    taskId: string = 'SingleActionUseCase';

    constructor(
        private readonly deployedActionUseCase: ParamUseCase<Execution, Result[]>,
        private readonly publishGithubActionUseCase: ParamUseCase<Execution, Result[]>,
        private readonly createReleaseUseCase: ParamUseCase<Execution, Result[]>,
        private readonly createTagUseCase: ParamUseCase<Execution, Result[]>,
        private readonly thinkUseCase: ParamUseCase<Execution, Result[]>,
        private readonly initialSetupUseCase: ParamUseCase<Execution, Result[]>,
        private readonly checkProgressUseCase: ParamUseCase<Execution, Result[]>,
        private readonly detectPotentialProblemsUseCase: ParamUseCase<Execution, Result[]>,
        private readonly recommendStepsUseCase: ParamUseCase<Execution, Result[]>,
    ) {}

    async invoke(param: Execution): Promise<Result[]> {
        logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`)

        const results: Result[] = []
        try {
            if (!param.singleAction.validSingleAction) {
                logWarn(`Single action invoked but not a valid single action: ${param.singleAction.currentSingleAction}. Skipping.`);
                return results;
            }

            logDebugInfo(`SingleAction: dispatching to handler for action: ${param.singleAction.currentSingleAction}.`);

            if (param.singleAction.isDeployedAction) {
                results.push(...await this.deployedActionUseCase.invoke(param));
            } else if (param.singleAction.isPublishGithubAction) {
                results.push(...await this.publishGithubActionUseCase.invoke(param));
            } else if (param.singleAction.isCreateReleaseAction) {
                results.push(...await this.createReleaseUseCase.invoke(param));
            } else if (param.singleAction.isCreateTagAction) {
                results.push(...await this.createTagUseCase.invoke(param));
            } else if (param.singleAction.isThinkAction) {
                results.push(...await this.thinkUseCase.invoke(param));
            } else if (param.singleAction.isInitialSetupAction) {
                results.push(...await this.initialSetupUseCase.invoke(param));
            } else if (param.singleAction.isCheckProgressAction) {
                results.push(...await this.checkProgressUseCase.invoke(param));
            } else if (param.singleAction.isDetectPotentialProblemsAction) {
                results.push(...await this.detectPotentialProblemsUseCase.invoke(param));
            } else if (param.singleAction.isRecommendStepsAction) {
                results.push(...await this.recommendStepsUseCase.invoke(param));
            }
        } catch (error) {
            logError(error);
            results.push(
                new Result({
                    id: this.taskId,
                    success: false,
                    executed: true,
                    steps: [
                        `Error executing single action: ${param.singleAction.currentSingleAction}.`,
                    ],
                    error: error,
                })
            )
        }
        return results;
    }
}