import { requireRepositoryCoordinates } from './repository_context';
import type { ExecutionInputs } from '../data/model/execution_inputs';

export interface GithubRepositoryCoordinates {
    owner: string;
    repo: string;
}

export interface GithubActionEventContext {
    payload: Record<string, unknown>;
    eventName: string;
    actor: string;
    repo: GithubRepositoryCoordinates;
}

export type GithubActionEventInputs = ExecutionInputs & {
    eventName: string;
    actor: string;
    repo: GithubRepositoryCoordinates;
};

/** Maps the GitHub Actions runtime context to the shape consumed by Execution. */
export function buildGithubActionEventInputs(
    context: GithubActionEventContext,
): GithubActionEventInputs {
    const repository = requireRepositoryCoordinates(context.repo);
    const eventName = requireNonEmptyContextValue(context.eventName, 'event name');
    const actor = requireNonEmptyContextValue(context.actor, 'actor');

    return {
        ...context.payload,
        eventName,
        actor,
        repo: repository,
    };
}

function requireNonEmptyContextValue(value: unknown, label: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`GitHub event context requires a non-empty ${label}.`);
    }
    return value.trim();
}
