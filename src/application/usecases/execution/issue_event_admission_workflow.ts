import { ApplicationError } from '../../errors/application_error';
import { coalescibleIssueReconciliation, isIssueReconciliationEvent, discardIssueSelfEvent, issueAdmissionReceiptName, issueReconciliationIdentity } from '../../policies/issue_event_admission_policy';
import type { IssueEventAdmissionContext, IssueEventAdmissionDecision, IssueEventAdmissionPort } from '../../ports/issue_event_admission_ports';

export async function inspectIssueEvent(
    context: IssueEventAdmissionContext, port: IssueEventAdmissionPort, digest: (value: string) => string,
): Promise<IssueEventAdmissionDecision> {
    validateContext(context);
    const login = await port.authenticatedLogin();
    if (!login.trim()) throw new ApplicationError('authorization.credential-invalid', 'Issue event admission could not verify the product account.');
    if (discardIssueSelfEvent(context, login)) return { execute: false, reason: 'self-event' };
    if (!isIssueReconciliationEvent(context)) return { execute: true, reason: 'lifecycle-event' };
    let issue;
    try { issue = await port.readIssue(context.issueNumber); }
    catch { return { execute: true, reason: 'reconciliation-needed' }; }
    if (!coalescibleIssueReconciliation(context, issue)) return { execute: true, reason: 'lifecycle-event' };
    const receiptKey = digest(issueReconciliationIdentity(context, issue, login));
    let completed = false;
    try { completed = await port.hasSuccessfulReceipt(issueAdmissionReceiptName(context.issueNumber, receiptKey), context); }
    catch { /* Optimization unavailable: retain the full guarded pipeline. */ }
    return { execute: !completed, reason: completed ? 'already-reconciled' : 'reconciliation-needed', receiptKey };
}

export async function recordIssueEvent(
    context: IssueEventAdmissionContext, expectedKey: string, port: IssueEventAdmissionPort, digest: (value: string) => string,
): Promise<string | undefined> {
    validateContext(context);
    if (!/^[a-f0-9]{64}$/u.test(expectedKey)) return undefined;
    const login = await port.authenticatedLogin();
    if (!login.trim() || discardIssueSelfEvent(context, login)) return undefined;
    const issue = await port.readIssue(context.issueNumber);
    if (!coalescibleIssueReconciliation(context, issue)) return undefined;
    const currentKey = digest(issueReconciliationIdentity(context, issue, login));
    return currentKey === expectedKey ? issueAdmissionReceiptName(context.issueNumber, currentKey) : undefined;
}

function validateContext(context: IssueEventAdmissionContext): void {
    if (context.eventName !== 'issues' || !['opened', 'reopened', 'closed', 'edited', 'labeled', 'unlabeled', 'assigned', 'unassigned'].includes(context.action)
        || !/^[\w.-]+$/u.test(context.owner) || !/^[\w.-]+$/u.test(context.repository)
        || !/^[a-z0-9][a-z0-9-]*(?:\[bot\])?$/iu.test(context.actor)
        || !Number.isSafeInteger(context.issueNumber) || context.issueNumber <= 0
        || !Number.isSafeInteger(context.runId) || context.runId <= 0
        || !/^[a-f0-9]{40}$/u.test(context.workflowRevision) || !/^[a-f0-9]{64}$/u.test(context.runtimeRevision)
        || Buffer.byteLength(context.configuration, 'utf8') > 1048576) {
        throw new ApplicationError('configuration.invalid', 'Issue event admission requires a valid native issue, workflow revision, and bounded configuration.');
    }
}
