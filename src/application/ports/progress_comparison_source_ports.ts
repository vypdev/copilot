/** Native, repository-bound PR ownership. No issue/model text or mutable writes. */
export type ProgressPullRequestSource =
    | { readonly kind: 'none' }
    | { readonly kind: 'ambiguous' }
    | { readonly kind: 'pull-request'; readonly number: number; readonly headSha: string; readonly baseBranch: string };
export interface BoundProgressComparisonSourceQueryPort {
    getSource(branch: string): Promise<ProgressPullRequestSource>;
}
export type ProgressComparisonSource =
    | { readonly kind: 'development'; readonly baseBranch: string }
    | { readonly kind: 'pull-request'; readonly baseBranch: string; readonly pullRequestNumber: number; readonly headSha: string };
