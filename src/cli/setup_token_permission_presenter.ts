import { stdout } from 'node:process';
import type { SetupTokenPermissionPresenterPort } from '../application/ports/setup_token_permission_ports';
import type {
    SetupTokenPermissionCheck,
    SetupTokenPermissionReport,
    SetupTokenPermissionRequirement,
    SetupTokenRole,
} from '../domain/setup_token_permissions';
import { renderBox } from './setup_prompt_rendering';

export class ConsoleSetupTokenPermissionPresenter implements SetupTokenPermissionPresenterPort {
    showRequirements(role: SetupTokenRole, requirements: readonly SetupTokenPermissionRequirement[]): void {
        console.log(renderSetupTokenPermissionRequirements(role, requirements));
    }

    showReport(report: SetupTokenPermissionReport): void {
        console.log(renderSetupTokenPermissionReport(report));
    }
}

export function renderSetupTokenPermissionRequirements(
    role: SetupTokenRole,
    requirements: readonly SetupTokenPermissionRequirement[],
    maximumWidth = stdout.columns ?? 120,
): string {
    const rows = maximumWidth >= 88
        ? renderWideRequirements(requirements)
        : requirements.flatMap(requirement => [
            `${requirement.permission} (${requirement.scope}) — ${capitalize(requirement.level)} — ${capitalize(requirement.applicability)}`,
            `  ${requirement.reason}${requirement.condition ? ` Required when: ${requirement.condition}.` : ''}`,
        ]);
    return renderBox(
        [
            'Configure this PAT with the least-privilege permissions below before entering it.',
            '',
            ...rows,
        ].join('\n'),
        `${roleTitle(role)} PAT permissions required`,
        36,
        maximumWidth,
    );
}

export function renderSetupTokenPermissionReport(
    report: SetupTokenPermissionReport,
    maximumWidth = stdout.columns ?? 120,
): string {
    const rows = maximumWidth >= 88
        ? renderWideChecks(report.checks)
        : report.checks.flatMap(check => [
            `${statusLabel(check)} — ${check.permission} (${check.scope}) — ${capitalize(check.level)}`,
            `  ${check.message}`,
        ]);
    const missing = report.checks.filter(check => check.applicability === 'required' && check.status === 'missing');
    const unverifiableRequiredReads = report.checks.filter(check => check.applicability === 'required'
        && check.level === 'read'
        && check.status === 'unverifiable'
        && check.operationallyAvailable !== true);
    const usablePublicReads = report.checks.filter(check => check.applicability === 'required'
        && check.level === 'read' && check.status === 'unverifiable'
        && check.operationallyAvailable === true);
    const unverifiable = report.checks.filter(check => check.status === 'unverifiable');
    const action = missing.length > 0
        ? `Action required: grant ${missing.map(check => `${check.permission} ${check.level}`).join(', ')} and retry. No dependent mutation started.`
        : unverifiableRequiredReads.length > 0
            ? `Action required: retry the unverifiable read checks for ${unverifiableRequiredReads.map(check => check.permission).join(', ')}. No dependent mutation started.`
            : report.confirmationRequired
                ? 'Confirmation required: inspect the PAT settings for every Unverifiable write row. Continue only by explicitly confirming the displayed access; no test mutation was performed.'
        : unverifiable.length > 0
            ? 'Some access is unverifiable because GitHub offers no safe read-only proof. No test mutation was performed.'
            : 'All safely verifiable required permissions are available.';
    const publicReadLimitation = usablePublicReads.length > 0
        ? 'Public repository reads are usable for setup, but do not prove the PAT has those permissions. Protected operations remain independently checked.'
        : undefined;
    return renderBox(
        [
            `Identity: ${capitalize(report.identityStatus)}${report.account ? ` as @${report.account}` : ''} — ${report.identityMessage}`,
            '',
            ...rows,
            '',
            action,
            ...(publicReadLimitation ? [publicReadLimitation] : []),
        ].join('\n'),
        `${roleTitle(report.role)} PAT permission check`,
        report.ready ? 32 : report.confirmationRequired ? 33 : 31,
        maximumWidth,
    );
}

function renderWideRequirements(requirements: readonly SetupTokenPermissionRequirement[]): string[] {
    const header = row('Permission', 'Scope', 'Access', 'Applies');
    return [
        header,
        row('─'.repeat(20), '─'.repeat(12), '─'.repeat(8), '─'.repeat(11)),
        ...requirements.flatMap(requirement => [
            row(requirement.permission, requirement.scope, capitalize(requirement.level), capitalize(requirement.applicability)),
            `  ${requirement.reason}${requirement.condition ? ` Required when: ${requirement.condition}.` : ''}`,
        ]),
    ];
}

function renderWideChecks(checks: readonly SetupTokenPermissionCheck[]): string[] {
    return [
        row('Status', 'Permission', 'Scope', 'Access'),
        row('─'.repeat(16), '─'.repeat(20), '─'.repeat(12), '─'.repeat(8)),
        ...checks.flatMap(check => [
            row(statusLabel(check), check.permission, check.scope, capitalize(check.level)),
            `  ${check.message}`,
        ]),
    ];
}

function row(first: string, second: string, third: string, fourth: string): string {
    return `${first.padEnd(20)} ${second.padEnd(20)} ${third.padEnd(12)} ${fourth}`;
}

function statusLabel(check: SetupTokenPermissionCheck): string {
    if (check.status === 'verified') return '✅ Verified';
    if (check.status === 'missing') return '❌ Missing';
    return '? Unverifiable';
}

function roleTitle(role: SetupTokenRole): string {
    return role === 'setup' ? 'Setup' : 'Workflow';
}

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}
