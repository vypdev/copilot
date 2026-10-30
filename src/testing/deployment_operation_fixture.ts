import type { DeploymentOperationSnapshot } from '../domain/deployment_operation';

/** Complete synthetic state shared only by deployment boundary regression tests. */
export function deploymentOperationFixture(overrides: Partial<DeploymentOperationSnapshot> = {}): DeploymentOperationSnapshot {
    return { stateVersion: 1, revision: 1, operationId: 'operation-12345678',
        locale: { repository: 'en-US', issue: 'en-US', pullRequest: 'en-US' },
        kind: 'release', version: '3.4.0', title: 'Release', changelog: 'Synthetic changes',
        phase: 'preparing', strategy: 'production-lineage', prMode: 'auto', backmergeMode: 'auto',
        hotfixActiveReleasePolicy: 'prefer-release', cleanup: 'all', issueCompletion: 'close',
        presentationMode: 'guided', diagrams: true, commentMode: 'update', sourceBranch: 'release/3.4.0',
        sourceSha: 'a'.repeat(40), originBranch: 'develop', originSha: 'b'.repeat(40),
        productionBranch: 'master', developmentBranch: 'develop', reconciliationTree: 'sync',
        tag: 'v3.4.0', publicationWorkflow: 'release_workflow.yml', publicationVerified: false,
        reconciliationTargets: [], lastFailure: null, ...overrides };
}

export function completedDeploymentFixture(overrides: Partial<DeploymentOperationSnapshot> = {}): DeploymentOperationSnapshot {
    return deploymentOperationFixture({ phase: 'completed', productionSha: 'c'.repeat(40), publicationVerified: true,
        publicationReceipt: { tag: 'v3.4.0', productionSha: 'c'.repeat(40), operationId: 'operation-12345678',
            releaseUrl: 'https://github.com/owner/repo/releases/tag/v3.4.0' }, ...overrides });
}
