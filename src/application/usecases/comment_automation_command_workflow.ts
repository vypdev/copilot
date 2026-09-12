import { Result } from '../../data/model/result';
import type { BoundActorAuthorizationPort } from '../ports/actor_authorization_ports';
import type { CommentAutomationOptions } from './comment_automation_contracts';
import type { CommentAutomationContext } from './comment_automation_context';
import type { ParsedCopilotCommand } from '../../domain/copilot_command';
import { buildCopilotStatusResult } from '../policies/status_command_policy';
import { buildCopilotHelpMessage } from '../policies/copilot_interaction_policy';
import { parseBugbotReviewCommandOptions } from '../../domain/bugbot/review_command';
import { commitUserRequestIfSuccessful } from './steps/commit/bugbot/commit_user_request_workflow';
import { finalizeWorkspaceMutation, prepareWorkspaceMutation } from './steps/commit/workspace_mutation_guard';
import { runBranchSyncCommand } from './branch_sync/branch_sync_comment_command';
import { ApplicationError, toApplicationError } from '../errors/application_error';
import {
    withBugbotReviewOverrides,
} from './steps/commit/bugbot/bugbot_review_operation_context';

const LEARNED_BUGBOT_RULE_PATH = '.copilot/BUGBOT.learned.md';

/** Executes deterministic /copilot commands without routing them through intent detection. */
export async function runExplicitCommentCommand(
    param: CommentAutomationContext,
    options: CommentAutomationOptions,
    command: ParsedCopilotCommand,
    actorAuthorizationPort: BoundActorAuthorizationPort,
): Promise<Result[] | undefined> {
    if (command.name === 'help') return runHelpCommand(param, options);
    if (command.name === 'status') return [buildCopilotStatusResult(param.status, options.taskId)];
    if (command.name === 'dismiss') return runDismissCommand(param, options, command, actorAuthorizationPort);
    if (command.name === 'remember') return runRememberCommand(param, options, command, actorAuthorizationPort);
    if (command.name === 'description') return runDescriptionCommand(param, options, actorAuthorizationPort);
    if (command.name === 'sync-branch') {
        return runBranchSyncCommand(param, options, command.arguments, actorAuthorizationPort);
    }
    if (['analyze', 'review', 'findings', 'recheck'].includes(command.name)) return runReviewCommand(param, options, command);
    if (command.name === 'fix' || command.name === 'implement') return undefined;
    return runThinkCommand(param, options, command);
}

async function runRememberCommand(
    param: CommentAutomationContext,
    options: CommentAutomationOptions,
    command: ParsedCopilotCommand,
    actorAuthorizationPort: BoundActorAuthorizationPort,
): Promise<Result[]> {
    const allowed = await actorAuthorizationPort.isActorAllowedToModifyFiles(param.actor);
    if (!allowed || !options.rememberBugbotRuleUseCase) {
        return [new Result({
            id: `${options.taskId}.Remember`,
            success: true,
            executed: false,
            steps: ['Learned rule skipped because the actor is not authorized or rule storage is unavailable.'],
        })];
    }
    let mutation;
    try {
        mutation = await prepareWorkspaceMutation(options.bugbotGitMutationPort, {
            operation: 'Remember Bugbot rule',
        });
    } catch (error) {
        return [rememberFailure(error)];
    }
    const results = await options.rememberBugbotRuleUseCase.invoke({ rule: command.arguments.join(' ') });
    if (!results.some((result) => result.executed)) return results;
    try {
        const { workspacePaths } = await finalizeWorkspaceMutation(
            options.bugbotGitMutationPort,
            mutation.workspacePathsBefore,
            'Remember Bugbot rule',
        );
        if (workspacePaths.length !== 1 || workspacePaths[0] !== LEARNED_BUGBOT_RULE_PATH) {
            return [...results, rememberFailure(new ApplicationError(
                'agent.policy-rejected',
                `Remember Bugbot rule refused unexpected workspace paths: ${workspacePaths.join(', ')}`,
            ))];
        }
        const last = results.at(-1);
        if (last) last.payload = { workspacePaths };
    } catch (error) {
        return [...results, rememberFailure(error)];
    }
    const commitResults = await commitUserRequestIfSuccessful(
        param.bugbot.commit,
        undefined,
        results,
        options.bugbotGitMutationPort,
    );
    return [...results, ...commitResults];
}

function rememberFailure(error: unknown): Result {
    return new Result({
        id: 'CommentAutomation.Remember',
        success: false,
        executed: true,
        errors: [toApplicationError(error, 'workflow.failed', 'Remembering the Bugbot rule failed.')],
    });
}

function runHelpCommand(
    param: CommentAutomationContext,
    options: CommentAutomationOptions,
): Result[] {
    return [new Result({
        id: `${options.taskId}.Help`,
        success: true,
        executed: true,
        stepFormat: 'markdown',
        steps: [buildCopilotHelpMessage(param.trustedBotLogin)],
    })];
}

async function runDescriptionCommand(
    param: CommentAutomationContext,
    options: CommentAutomationOptions,
    actorAuthorizationPort: BoundActorAuthorizationPort,
): Promise<Result[]> {
    if (!options.updatePullRequestDescriptionUseCase) {
        return [new Result({
            id: `${options.taskId}.Description`,
            success: false,
            executed: false,
            errors: [new ApplicationError('configuration.unsupported', 'Explicit pull-request description command is not available in this composition.')],
        })];
    }
    const allowed = await actorAuthorizationPort.isActorAllowedToModifyFiles(param.actor);
    if (!allowed) {
        return [new Result({
            id: `${options.taskId}.Description`,
            success: true,
            executed: false,
            steps: ['Explicit pull-request description command skipped because the actor is not authorized to modify it.'],
        })];
    }
    return options.updatePullRequestDescriptionUseCase.invoke();
}

async function runDismissCommand(
    param: CommentAutomationContext,
    options: CommentAutomationOptions,
    command: ParsedCopilotCommand,
    actorAuthorizationPort: BoundActorAuthorizationPort,
): Promise<Result[]> {
    const allowed = await actorAuthorizationPort.isActorAllowedToModifyFiles(param.actor);
    if (!allowed || !options.dismissBugbotFindingsUseCase) {
        return [new Result({
            id: options.taskId,
            success: true,
            executed: false,
            steps: ['Explicit dismiss command skipped because the actor is not authorized or dismissal is unavailable.'],
        })];
    }
    return options.dismissBugbotFindingsUseCase.invoke({
        operation: param.bugbot.fixIntent,
        findingIds: command.arguments,
    });
}

async function runReviewCommand(
    param: CommentAutomationContext,
    options: CommentAutomationOptions,
    command: ParsedCopilotCommand,
): Promise<Result[]> {
    const parsedOptions = parseBugbotReviewCommandOptions(command.arguments);
    if (!parsedOptions.valid) return [invalidCommentCommandResult(options.taskId, parsedOptions.reason)];
    const results = [new Result({
        id: `${options.taskId}.ExplicitCommand`,
        success: true,
        executed: true,
        steps: [`Executing explicit /copilot ${command.name} command.`],
        payload: { explicitCommand: command.name, reviewOptions: parsedOptions.overrides },
    })];
    if (!options.reviewPotentialProblemsUseCase) {
        results.push(new Result({
            id: `${options.taskId}.Review`,
            success: false,
            executed: true,
            errors: [new ApplicationError('configuration.unsupported', 'Explicit review command is not available in this composition.')],
        }));
        return results;
    }
    const invokeReview = () => options.reviewPotentialProblemsUseCase!.invoke(
        withBugbotReviewOverrides(param.bugbot.review, parsedOptions.overrides),
    );
    const reviewResults = await invokeReview();
    results.push(...reviewResults);
    return results;
}

function runThinkCommand(
    param: CommentAutomationContext,
    options: CommentAutomationOptions,
    command: ParsedCopilotCommand,
): Promise<Result[]> {
    return options.thinkUseCase.invoke(param.think).then(results => [
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
        errors: [new ApplicationError('validation.invalid-input', reason)],
    });
}
