import type { SetupFeature, SetupFeatures } from './setup';

interface SetupWorkflowDefinition {
    readonly file: string;
    readonly feature: SetupFeature;
}

const SETUP_WORKFLOWS: readonly SetupWorkflowDefinition[] = [
    { file: 'copilot_issue.yml', feature: 'issues' },
    { file: 'copilot_pull_request.yml', feature: 'pullRequests' },
    { file: 'copilot_commit.yml', feature: 'commits' },
    { file: 'copilot_branch_sync.yml', feature: 'commits' },
    { file: 'copilot_issue_comment.yml', feature: 'issueComments' },
    { file: 'copilot_pull_request_comment.yml', feature: 'pullRequestComments' },
    { file: 'release_workflow.yml', feature: 'release' },
    { file: 'hotfix_workflow.yml', feature: 'hotfix' },
    { file: 'agent-cli-provisioning.yml', feature: 'agentProvisioning' },
    { file: 'copilot_credential_health.yml', feature: 'credentialHealth' },
    { file: 'copilot_close_inactive_issues.yml', feature: 'inactiveIssueClosure' },
];

export function enabledSetupWorkflowFiles(features: SetupFeatures): string[] {
    return SETUP_WORKFLOWS
        .filter(({ feature }) => features[feature] !== false)
        .map(({ file }) => file);
}

export function isSetupWorkflowEnabled(file: string, features?: SetupFeatures): boolean {
    if (!features) return true;
    const definition = SETUP_WORKFLOWS.find((candidate) => candidate.file === file);
    return !definition || features[definition.feature] !== false;
}
