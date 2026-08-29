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
export function buildDeploymentMergePlan(
    configuration: DeploymentBranchConfiguration,
): DeploymentMergeTarget[] {
    if (configuration.releaseBranch) {
        return [
            { source: configuration.releaseBranch, target: configuration.defaultBranch },
            { source: configuration.releaseBranch, target: configuration.developmentBranch },
        ];
    }
    if (configuration.hotfixBranch) {
        return [
            { source: configuration.hotfixBranch, target: configuration.defaultBranch },
            { source: configuration.defaultBranch, target: configuration.developmentBranch },
        ];
    }
    return [];
}
