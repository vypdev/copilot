import { Result } from '../../data/model/result';
import type { Execution } from '../../data/model/execution';
import type { ActorAuthorizationPort } from '../ports/actor_authorization_ports';
import type { CommentAutomationOptions } from './comment_automation_contracts';
import type { ParsedCopilotCommand } from '../../domain/copilot_command';
import { buildCopilotStatusResult } from '../policies/status_command_policy';
import { buildCopilotHelpMessage } from '../policies/copilot_interaction_policy';

/** Executes deterministic /copilot commands without routing them through intent detection. */
export async function runExplicitCommentCommand(
    param: Execution,
    options: CommentAutomationOptions,
    command: ParsedCopilotCommand,
    actorAuthorizationPort: ActorAuthorizationPort,
): Promise<Result[] | undefined> {
    if (command.name === 'help') return runHelpCommand(param, options);
    if (command.name === 'status') return [buildCopilotStatusResult(param, options.taskId)];
    if (command.name === 'dismiss') return runDismissCommand(param, options, command, actorAuthorizationPort);
    if (command.name === 'description') return runDescriptionCommand(param, options);
    if (['analyze', 'review', 'findings', 'recheck'].includes(command.name)) return runReviewCommand(param, options, command);
    if (command.name === 'fix' || command.name === 'implement') return undefined;
    return runThinkCommand(param, options, command);
}

function runHelpCommand(
    param: Execution,
    options: CommentAutomationOptions,
): Result[] {
    return [new Result({
        id: `${options.taskId}.Help`,
        success: true,
        executed: true,
        stepFormat: 'markdown',
        steps: [buildCopilotHelpMessage(param.tokenUser)],
    })];
}

async function runDescriptionCommand(
    param: Execution,
    options: CommentAutomationOptions,
): Promise<Result[]> {
    if (!options.updatePullRequestDescriptionUseCase) {
        return [new Result({
            id: `${options.taskId}.Description`,
            success: false,
            executed: false,
            errors: ['Explicit pull-request description command is not available in this composition.'],
        })];
    }
    return options.updatePullRequestDescriptionUseCase.invokeExplicit(param);
}

async function runDismissCommand(
    param: Execution,
    options: CommentAutomationOptions,
    command: ParsedCopilotCommand,
    actorAuthorizationPort: ActorAuthorizationPort,
): Promise<Result[]> {
    const allowed = await actorAuthorizationPort.isActorAllowedToModifyFiles(
        param.owner,
        param.repo,
        param.actor,
        param.tokens.token,
    );
    if (!allowed || !options.dismissBugbotFindingsUseCase) {
        return [new Result({
            id: options.taskId,
            success: true,
            executed: false,
            steps: ['Explicit dismiss command skipped because the actor is not authorized or dismissal is unavailable.'],
        })];
    }
    return options.dismissBugbotFindingsUseCase.invoke({
        execution: param,
        findingIds: command.arguments,
    });
}

async function runReviewCommand(
    param: Execution,
    options: CommentAutomationOptions,
    command: ParsedCopilotCommand,
): Promise<Result[]> {
    const results = [new Result({
        id: `${options.taskId}.ExplicitCommand`,
        success: true,
        executed: true,
        steps: [`Executing explicit /copilot ${command.name} command.`],
        payload: { explicitCommand: command.name },
    })];
    if (!options.reviewPotentialProblemsUseCase) {
        results.push(new Result({
            id: `${options.taskId}.Review`,
            success: false,
            executed: true,
            errors: ['Explicit review command is not available in this composition.'],
        }));
        return results;
    }
    results.push(...(await options.reviewPotentialProblemsUseCase.invoke(param)));
    return results;
}

function runThinkCommand(
    param: Execution,
    options: CommentAutomationOptions,
    command: ParsedCopilotCommand,
): Promise<Result[]> {
    return options.thinkUseCase.invoke(param).then(results => [
        new Result({
            id: `${options.taskId}.ExplicitCommand`,
            success: true,
            executed: true,
            steps: [`Executing explicit /copilot ${command.name} command.`],
            payload: { explicitCommand: command.name },
        }),
        ...results,
    ]);
}

export function invalidCommentCommandResult(taskId: string, reason: string): Result {
    return new Result({
        id: taskId,
        success: false,
        executed: false,
        errors: [reason],
    });
}
