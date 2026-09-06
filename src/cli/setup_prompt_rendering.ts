import { stdout } from 'node:process';
import type {
    DoctorCheckStatus,
    SetupCredentialCheck,
    SetupCredentialRequirement,
    SetupRemoteConfiguration,
    SetupVariable,
} from '../domain/setup';

export function statusIcon(status: SetupCredentialCheck['status']): string {
    if (status === 'valid') return '✓';
    if (status === 'unverifiable') return '?';
    if (status === 'missing') return '!';
    if (status === 'not_required') return '–';
    return '✗';
}

export function doctorIcon(status: DoctorCheckStatus): string {
    return status === 'pass' ? '✓' : status === 'warn' ? '⚠' : '✗';
}

export function formatTask(task: string): string {
    return task.charAt(0).toUpperCase() + task.slice(1);
}

export function color(value: string, code: number): string {
    if (!stdout.isTTY) return value;
    return `\u001b[${code}m${value}\u001b[0m`;
}

export function renderBox(content: string, title: string, borderCode = 36): string {
    const lines = [` ${title} `, ...content.split('\n').map(line => ` ${line}`)];
    const width = Math.max(...lines.map(line => stripAnsi(line).length)) + 1;
    const border = color(`╭${'─'.repeat(width)}╮`, borderCode);
    const bottom = color(`╰${'─'.repeat(width)}╯`, borderCode);
    return [
        border,
        ...lines.map(line => `${color('│', borderCode)}${line}${' '.repeat(Math.max(0, width - stripAnsi(line).length))}${color('│', borderCode)}`),
        bottom,
    ].join('\n');
}

export function renderRemoteConfiguration(
    remote: SetupRemoteConfiguration,
    variables: readonly SetupVariable[],
    requirements: readonly SetupCredentialRequirement[],
): string {
    const lines = [
        `Target owner: ${remote.ownerType}; repository visibility: ${remote.repositoryVisibility}; repository ID: ${remote.repositoryId ?? 'unknown'}`,
        `Repository Secrets: ${remote.repositorySecrets.length > 0 ? remote.repositorySecrets.join(', ') : '(none detected)'}`,
        `Organization Secrets available here: ${remote.organizationSecrets.length > 0 ? remote.organizationSecrets.join(', ') : '(none detected)'}`,
        `Repository Variables: ${remote.repositoryVariables.length > 0 ? remote.repositoryVariables.map(variable => variable.name).join(', ') : '(none detected)'}`,
        `Organization Variables available here: ${remote.organizationVariables.length > 0 ? remote.organizationVariables.map(variable => variable.name).join(', ') : '(none detected)'}`,
        `Required Secrets: ${requirements.map(requirement => requirement.name).join(', ')}`,
        `Required Variables: ${variables.map(variable => variable.name).join(', ')}`,
        remote.organizationAccess === 'available'
            ? 'Organization resources can be inspected for this repository.'
            : `Organization resource inspection: ${remote.organizationAccess}.`,
        'Repository-level resources take precedence over organization-level resources. Secret values are never displayed.',
    ];
    return lines.join('\n');
}

function stripAnsi(value: string): string {
    return value.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '');
}
