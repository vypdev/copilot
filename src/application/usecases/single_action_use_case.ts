import type { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { logInfo, logWarn } from "../ports/logging_ports";
import { getTaskEmoji } from "../../utils/task_emoji";
import { ParamUseCase } from "./base/param_usecase";
import { runSingleActionWorkflow } from "./single_action_workflow";
import type { ActorAuthorizationPort } from "../ports/actor_authorization_ports";

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
    private readonly actorAuthorizationPort?: ActorAuthorizationPort,
    private readonly publishIssueCommentUseCase?: ParamUseCase<Execution, Result[]>,
  ) {}

  async invoke(param: Execution): Promise<Result[]> {
    logInfo(`${getTaskEmoji(this.taskId)} Executing ${this.taskId}.`);
    if (!param.singleAction.validSingleAction) {
      logWarn(`Single action invoked but not a valid single action: ${param.singleAction.currentSingleAction}. Skipping.`);
      return [];
    }
    if (isAgentBackedSingleAction(param) && param.ai?.getAiMembersOnly?.()) {
      const allowed = Boolean(this.actorAuthorizationPort && await this.actorAuthorizationPort.isActorAllowedToModifyFiles(
        param.owner,
        param.repo,
        param.actor,
        param.tokens.token,
      ));
      if (!allowed) {
        logInfo('Skipping agent-backed single action because ai-members-only is enabled and the actor is not authorized.');
        return [];
      }
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
      publishIssueCommentUseCase: this.publishIssueCommentUseCase,
    });
  }
}

function isAgentBackedSingleAction(param: Execution): boolean {
  return param.singleAction.isThinkAction
    || param.singleAction.isCheckProgressAction
    || param.singleAction.isDetectPotentialProblemsAction
    || param.singleAction.isRecommendStepsAction;
}
