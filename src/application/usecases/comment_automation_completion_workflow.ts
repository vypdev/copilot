import { Result } from '../../data/model/result';
import type { Execution } from '../../data/model/execution';
import type { AuthenticatedUserPort } from '../ports/authenticated_user_ports';
import type { BugbotFindingResolutionPorts } from '../ports/bugbot_finding_resolution_ports';
import type { CommentAutomationDecision } from './comment_automation_decision_workflow';
import type { CommentAutomationOptions } from './comment_automation_contracts';
import { canRunBugbotAutofix, canRunDoUserRequest } from './steps/commit/bugbot/bugbot_fix_intent_payload';
import { logInfo } from '../ports/logging_ports';
import { runCommentAutomationAction } from './comment_automation_action_workflow';

export async function completeCommentAutomation(
  param: Execution,
  options: CommentAutomationOptions,
  decision: CommentAutomationDecision,
  ports: { authenticatedUserPort: AuthenticatedUserPort; bugbotResolutionPorts: BugbotFindingResolutionPorts },
): Promise<Result[]> {
  logUnauthorizedActionSkip(decision);
  if (decision.route === 'think') {
    logInfo('Skipping bugbot autofix (no fix request, no targets, or no context).');
    logInfo('Running ThinkUseCase (no file-modifying action ran).');
    return options.thinkUseCase.invoke(param);
  }
  return runCommentAutomationAction(param, options, decision.route, decision.intentPayload, {
    ...ports,
    gitCommitPort: options.gitCommitPort,
  });
}

function logUnauthorizedActionSkip(decision: CommentAutomationDecision): void {
  const payload = decision.intentPayload;
  if (decision.route === 'think' && payload && (canRunBugbotAutofix(payload) || canRunDoUserRequest(payload))) {
    logInfo('Skipping file-modifying use cases: user is not an org member or repo owner.');
  }
}
