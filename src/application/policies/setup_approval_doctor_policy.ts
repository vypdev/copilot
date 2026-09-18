import type { ApprovalReadinessFacts } from '../ports/setup_approval_readiness_port';
import type { DoctorCheck, SetupConfiguration, SetupRemoteConfiguration, SetupWorkflowComparison } from '../../domain/setup';
import { parsePullRequestApprovalPolicy } from '../../domain/pull_request_approval_policy';
import { resolveStaticSetupDoctorCatalog, type SetupDoctorMessageCatalog, type SetupDoctorMessageId } from './setup_doctor_message_catalog';

/** Stable ordered checks; unknown prerequisites never project native-approval readiness. */
export function buildApprovalDoctorChecks(input: {
    readonly configuration: SetupConfiguration;
    readonly remote?: SetupRemoteConfiguration;
    readonly workflow?: SetupWorkflowComparison;
    readonly facts?: ApprovalReadinessFacts;
    readonly botCredential?: DoctorCheck;
    readonly catalog?: SetupDoctorMessageCatalog;
}): DoctorCheck[] {
    const checks: DoctorCheck[] = [];
    const catalog = input.catalog ?? resolveStaticSetupDoctorCatalog();
    const message = (id: SetupDoctorMessageId, variables?: Readonly<Record<string, string | number>>): string => catalog.message(id, variables);
    const observed = [...(input.remote?.organizationVariables ?? []), ...(input.remote?.repositoryVariables ?? [])]
        .filter(variable => variable.name === 'PR_APPROVAL_POLICY').at(-1)?.value;
    let policy;
    try { policy = parsePullRequestApprovalPolicy(observed); } catch {
        checks.push(check('approval.policy', 'fail', message('doctor.approval.policyInvalid'), message('doctor.approval.policyInvalidAction')));
        return [...checks, check('approval.overall', 'fail', message('doctor.approval.overallInvalid'), message('doctor.approval.overallInvalidAction'))];
    }
    if (!input.remote) {
        checks.push(check('approval.policy', 'skipped', message('doctor.approval.policyUnverified'), message('doctor.approval.policyUnverifiedAction'), ['credentials.setup-pat']));
    } else if (!observed) {
        checks.push(check('approval.policy', 'warn', message('doctor.approval.policyMissing'), message('doctor.approval.policyMissingAction')));
    } else if (policy.mode === 'off') {
        checks.push(check('approval.policy', 'warn', message('doctor.approval.policyOff'), message('doctor.approval.policyOffAction')));
    } else {
        checks.push(check('approval.policy', 'pass', message('doctor.approval.policyInstalled', { mode: policy.mode })));
    }
    if (!observed || policy.mode === 'off') {
        for (const id of ['approval.workflow', 'approval.bot', 'approval.rules', 'approval.producers', 'approval.bugbot']) {
            checks.push(check(id, 'skipped', message('doctor.approval.dependencySkipped'), message('doctor.approval.dependencySkippedAction'), ['approval.policy']));
        }
        checks.push(check('approval.overall', 'warn', message('doctor.approval.overallOff'), message('doctor.approval.overallOffAction')));
        return checks;
    }
    const workflowState = input.facts?.defaultBranchWorkflow;
    checks.push(check('approval.workflow', workflowState === 'matching' && input.workflow?.status === 'unchanged' ? 'pass'
        : workflowState === 'missing' || workflowState === 'unavailable' ? 'warn' : 'fail',
    workflowState === 'matching' && input.workflow?.status === 'unchanged'
        ? message('doctor.approval.workflowReady')
        : message('doctor.approval.workflowMissing'),
    workflowState === 'matching' && input.workflow?.status === 'unchanged' ? undefined : message('doctor.approval.workflowAction')));
    const present = [...(input.remote?.repositorySecrets ?? []), ...(input.remote?.organizationSecrets ?? [])].includes('PAT');
    // Credential health proves token availability, not Pull requests:write. No read-only API
    // can safely prove that a future APPROVE mutation will be authorized.
    const botStatus = !present ? 'fail' : 'warn';
    checks.push(check('approval.bot', botStatus, !present ? message('doctor.approval.botMissing')
        : input.botCredential?.status === 'pass'
            ? message('doctor.approval.botHealthyUnverified')
            : message('doctor.approval.botUnverified'),
    message('doctor.approval.botAction')));
    const rules = input.facts?.rules ?? [];
    const rulesStatus = rules.length !== policy.targetRoles.length || rules.some(rule => !rule.readable) ? 'skipped'
        : rules.some(rule => !rule.dismissesStaleReviews || rule.approvalCheckCycle) ? 'fail' : 'pass';
    checks.push(check('approval.rules', rulesStatus, rulesStatus === 'pass'
        ? message('doctor.approval.rulesReady')
        : message('doctor.approval.rulesUnsafe'),
    rulesStatus === 'pass' ? undefined : message('doctor.approval.rulesAction')));
    const producersStatus = !input.facts ? 'skipped'
        : input.facts.missingWorkflowNames.length > 0 || policy.testChecks.length === 0 ? 'fail'
            : policy.producerAttested ? 'pass' : 'warn';
    checks.push(check('approval.producers', producersStatus, producersStatus === 'pass'
        ? message('doctor.approval.producersReady')
        : message('doctor.approval.producersUnsafe'),
    producersStatus === 'pass' ? undefined : message('doctor.approval.producersAction')));
    if (policy.coverage.mode === 'numeric') {
        checks.push(check('approval.coverage', policy.coverage.reporterAttested ? 'warn' : 'fail',
            policy.coverage.reporterAttested
                ? message('doctor.approval.numericAttested')
                : message('doctor.approval.numericUnattested'),
            message('doctor.approval.numericAction')));
    }
    const bugbotStatus = input.configuration.ai.bugbotSeverity === 'info'
        && input.configuration.ai.bugbotTelemetry && !input.configuration.ai.bugbotDryRun ? 'pass' : 'fail';
    checks.push(check('approval.bugbot', bugbotStatus, bugbotStatus === 'pass'
        ? message('doctor.approval.bugbotReady')
        : message('doctor.approval.bugbotUnsafe'),
    bugbotStatus === 'pass' ? undefined : message('doctor.approval.bugbotAction')));
    const blockers = checks.filter(item => item.status !== 'pass').map(item => item.id);
    checks.push(check('approval.overall', blockers.length === 0 ? 'pass'
        : checks.some(item => item.status === 'fail') ? 'fail' : 'warn',
    blockers.length === 0 ? message('doctor.approval.overallReady')
        : message('doctor.approval.overallNotReady'),
    blockers.length === 0 ? undefined : message('doctor.approval.overallAction'), blockers));
    return checks;
}

function check(id: string, status: DoctorCheck['status'], summary: string, action?: string, blockedBy: readonly string[] = []): DoctorCheck {
    return { id, status, summary, ...(action ? { action } : {}), evidence: {}, blockedBy };
}
