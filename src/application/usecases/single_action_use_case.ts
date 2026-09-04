import type { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { logInfo, logWarn } from "../ports/logging_ports";
import { getTaskEmoji } from "../../utils/task_emoji";
import { ParamUseCase } from "./base/param_usecase";
import { runSingleActionWorkflow } from "./single_action_workflow";

export class SingleActionUseCase implements ParamUseCase<Execution, Result[]> {
  taskId: string = "SingleActionUseCase";

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
    private readonly closeInactiveIssuesUseCase?: ParamUseCase<Execution, Result[]>,
  ) {}

  async invoke(param: Execution): Promise<Result[]> {
    logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
    if (!param.singleAction.validSingleAction) {
      logWarn(`Single action invoked but not a valid single action: ${param.singleAction.currentSingleAction}. Skipping.`);
      return [];
    }
    return runSingleActionWorkflow(param, this.taskId, {
      deployedActionUseCase: this.deployedActionUseCase,
      publishGithubActionUseCase: this.publishGithubActionUseCase,
      createReleaseUseCase: this.createReleaseUseCase,
      createTagUseCase: this.createTagUseCase,
      thinkUseCase: this.thinkUseCase,
      initialSetupUseCase: this.initialSetupUseCase,
      checkProgressUseCase: this.checkProgressUseCase,
      detectPotentialProblemsUseCase: this.detectPotentialProblemsUseCase,
      recommendStepsUseCase: this.recommendStepsUseCase,
      closeInactiveIssuesUseCase: this.closeInactiveIssuesUseCase,
    });
  }
}
