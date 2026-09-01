export type GithubExecutionAdmissionDecision = 'execute' | 'discard';
export interface GithubExecutionAdmissionInput {
    actor: string;
    tokenUser: string;
    isSingleAction: boolean;
    validSingleAction: boolean;
}
/**
 * Decides whether a GitHub Action should enter the mutation lifecycle.
 *
 * A run triggered by the account that owns the PAT must not react to its own
 * normal issue, pull-request, or push events. Explicit valid single actions
 * remain executable so release and deployment workflows keep working.
 */
export declare function resolveGithubExecutionAdmission(input: GithubExecutionAdmissionInput): GithubExecutionAdmissionDecision;
