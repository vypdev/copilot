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

    return {
        ...context.payload,
        eventName: context.eventName,
        actor: context.actor,
        repo: repository,
    };
}
