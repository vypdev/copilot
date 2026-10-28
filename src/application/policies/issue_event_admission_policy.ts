import { ISSUE_START_LABEL } from '../../domain/issue_start_policy';
import { githubUsersMatch } from '../../domain/github_user_policy';
import type { IssueAdmissionSnapshot, IssueEventAdmissionContext, IssueEventAdmissionDecision } from '../ports/issue_event_admission_ports';

export function isIssueReconciliationEvent(context: IssueEventAdmissionContext): boolean {
    return ['labeled', 'unlabeled'].includes(context.action) && context.changedLabel.length > 0
        && ![ISSUE_START_LABEL, context.deployLabel].map(label => label.toLowerCase()).includes(context.changedLabel.toLowerCase());
}

/** Initial routing labels have no event-specific effects in an unstarted issue. */
export function coalescibleIssueReconciliation(context: IssueEventAdmissionContext, issue: IssueAdmissionSnapshot): boolean {
    return isIssueReconciliationEvent(context) && issue.state === 'open'
        && !issue.labels.some(label => [ISSUE_START_LABEL, context.releaseLabel, context.hotfixLabel].map(name => name.toLowerCase()).includes(label.toLowerCase()));
}

export function discardIssueSelfEvent(context: IssueEventAdmissionContext, tokenUser: string): boolean {
    // Native closure cleanup deliberately remains runnable for the product account.
    return context.action !== 'closed' && githubUsersMatch(context.actor, tokenUser);
}

/** Every input that can change the meaning of a backlog reconciliation invalidates its receipt. */
export function issueReconciliationIdentity(context: IssueEventAdmissionContext, issue: IssueAdmissionSnapshot, productAccount: string): string {
    return JSON.stringify({
        schema: 1, productAccount: productAccount.toLowerCase(), repository: `${context.owner}/${context.repository}`, actor: context.actor.toLowerCase(),
        workflow: context.workflowRevision, runtime: context.runtimeRevision, configuration: context.configuration,
        deployLabel: context.deployLabel, releaseLabel: context.releaseLabel, hotfixLabel: context.hotfixLabel,
        issue: { ...issue, labels: [...issue.labels].sort(), assignees: [...issue.assignees].sort() },
    });
}

export function issueAdmissionReceiptName(issueNumber: number, key: string): string {
    return `copilot-issue-reconciliation-v1-${issueNumber}-${key}`;
}


export function issueEventAdmissionSummary(decision: IssueEventAdmissionDecision, locale: string): string {
    const spanish = /^es(?:-|$)/iu.test(locale);
    const states = spanish ? {
        'self-event': 'Evento interno omitido: lo generó la cuenta del producto. No se asignó el runner de trabajo.',
        'lifecycle-event': 'Evento admitido. El flujo normal verificará permisos y reconciliará la issue.',
        'reconciliation-needed': 'Reconciliación admitida: no se ha verificado una ejecución correcta que cubra este estado.',
        'already-reconciled': 'Estado ya reconciliado por una ejecución correcta del mismo flujo. Se omitió el runner de trabajo.',
    } : {
        'self-event': 'Internal event skipped: the product account generated it. No work runner was allocated.',
        'lifecycle-event': 'Event admitted. The normal pipeline will verify permissions and reconcile the issue.',
        'reconciliation-needed': 'Reconciliation admitted: no successful execution has been verified for this state.',
        'already-reconciled': 'State already reconciled by a successful execution of this workflow. The work runner was skipped.',
    };
    return `## ${spanish ? 'Admisión de la issue' : 'Issue event admission'}\n\n${states[decision.reason]}\n\n${spanish ? 'No se requiere intervención. Los fallos y efectos parciales conservan el flujo normal y no generan un recibo reutilizable.' : 'No action is required. Failed or partial work retains the normal pipeline and cannot produce a reusable receipt.'}\n`;
}
