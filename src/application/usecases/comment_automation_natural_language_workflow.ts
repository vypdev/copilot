import type { Execution } from '../../data/model/execution';
import type { Result } from '../../data/model/result';
import type { ActorAuthorizationPort } from '../ports/actor_authorization_ports';
import type { AuthenticatedUserPort } from '../ports/authenticated_user_ports';
import type { CommentAutomationOptions } from './comment_automation_contracts';
import { resolveCommentAutomationDecision } from './comment_automation_decision_workflow';
import { completeCommentAutomation } from './comment_automation_completion_workflow';

/** Runs the natural-language comment pipeline after deterministic commands are excluded. */
export async function runNaturalLanguageCommentAutomation(
    param: Execution,
    options: CommentAutomationOptions,
    actorAuthorizationPort: ActorAuthorizationPort,
    languageResults: readonly Result[],
    ports: {
        authenticatedUserPort: AuthenticatedUserPort;
    },
): Promise<Result[]> {
    const decision = await resolveCommentAutomationDecision(
        param,
        options,
        actorAuthorizationPort,
    );
    return [
        ...languageResults,
        ...decision.intentResults,
        ...(await completeCommentAutomation(param, options, decision, ports)),
    ];
}
