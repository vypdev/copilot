export interface DeploymentBranchConfiguration {
    releaseBranch?: string;
    hotfixBranch?: string;
    defaultBranch: string;
    developmentBranch: string;
}
export interface DeploymentMergeTarget {
    source: string;
    target: string;
}
/** Returns the ordered merge operations required after a successful deployment. */
export declare function buildDeploymentMergePlan(configuration: DeploymentBranchConfiguration): DeploymentMergeTarget[];
