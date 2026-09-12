import type { Result } from '../../data/model/result';
import type { BoundActorAuthorizationPort } from '../ports/actor_authorization_ports';
import type { CommentAutomationOptions } from './comment_automation_contracts';
import type { CommentAutomationContext } from './comment_automation_context';
import { resolveCommentAutomationDecision } from './comment_automation_decision_workflow';
import { completeCommentAutomation } from './comment_automation_completion_workflow';

/** Runs the natural-language comment pipeline after deterministic commands are excluded. */
export async function runNaturalLanguageCommentAutomation(
    param: CommentAutomationContext,
    options: CommentAutomationOptions,
    actorAuthorizationPort: BoundActorAuthorizationPort,
    languageResults: readonly Result[],
): Promise<Result[]> {
    const decision = await resolveCommentAutomationDecision(
        param,
        options,
        actorAuthorizationPort,
    );
    return [
        ...languageResults,
        ...decision.intentResults,
        ...(await completeCommentAutomation(param, options, decision)),
    ];
}
