import type { SetupFeature, SetupFeatures } from './setup';

interface SetupWorkflowDefinition {
    readonly file: string;
    readonly feature: SetupFeature | readonly SetupFeature[];
}

export const SETUP_CREDENTIAL_HEALTH_WORKFLOW_FILE = 'copilot_credential_health.yml';

const SETUP_WORKFLOWS: readonly SetupWorkflowDefinition[] = [
    { file: 'copilot_issue.yml', feature: 'issues' },
    { file: 'copilot_pull_request.yml', feature: 'pullRequests' },
    { file: 'copilot_pull_request_review_state.yml', feature: 'pullRequests' },
    { file: 'copilot_pull_request_approval.yml', feature: 'pullRequests' },
    { file: 'copilot_pull_request_merge_queue.yml', feature: 'pullRequests' },
    { file: 'copilot_commit.yml', feature: 'commits' },
    { file: 'copilot_branch_sync.yml', feature: 'commits' },
    { file: 'copilot_issue_comment.yml', feature: 'issueComments' },
    { file: 'copilot_pull_request_comment.yml', feature: 'pullRequestComments' },
    { file: 'release_workflow.yml', feature: 'release' },
    { file: 'hotfix_workflow.yml', feature: 'hotfix' },
    { file: 'copilot_deployment_orchestration.yml', feature: ['release', 'hotfix'] },
    { file: 'agent-cli-provisioning.yml', feature: 'agentProvisioning' },
    { file: SETUP_CREDENTIAL_HEALTH_WORKFLOW_FILE, feature: 'credentialHealth' },
    { file: 'copilot_close_inactive_issues.yml', feature: 'inactiveIssueClosure' },
];

export function enabledSetupWorkflowFiles(features: SetupFeatures): string[] {
    return SETUP_WORKFLOWS
        .filter(({ feature }) => featureEnabled(feature, features))
        .map(({ file }) => file);
}

export function isSetupWorkflowEnabled(file: string, features?: SetupFeatures): boolean {
    if (!features) return true;
    const definition = SETUP_WORKFLOWS.find((candidate) => candidate.file === file);
    return !definition || featureEnabled(definition.feature, features);
}

function featureEnabled(feature: SetupWorkflowDefinition['feature'], features: SetupFeatures): boolean {
    const candidates = Array.isArray(feature) ? feature : [feature];
    return candidates.some((candidate) => features[candidate] !== false);
}
