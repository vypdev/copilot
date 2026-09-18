import type { PullRequestApprovalPolicy } from './pull_request_approval_policy';

const WORKFLOW_PLACEHOLDER = '__PR_APPROVAL_WORKFLOW_NAMES__';

/** Only exact, validated workflow names enter the event filter. */
export function renderApprovalObserverWorkflow(template: string, policy: PullRequestApprovalPolicy): string {
    if (!template.includes(WORKFLOW_PLACEHOLDER)) throw new Error('Approval observer template is missing its workflow filter.');
    const names = [...new Set(['Copilot - Pull Request', ...policy.testChecks.map(check => check.workflowName)])];
    if (names.some(name => !name || name.length > 100 || /[\r\n${}<>]/u.test(name))) {
        throw new Error('Approval producer workflow names must be exact safe single-line names.');
    }
    return template.replace(WORKFLOW_PLACEHOLDER, JSON.stringify(names));
}
