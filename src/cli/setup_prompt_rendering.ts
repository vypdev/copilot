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
    return status === 'pass' ? '✓' : status === 'warn' ? '⚠' : status === 'skipped' ? '–' : '✗';
}

export function formatTask(task: string): string {
    return task.charAt(0).toUpperCase() + task.slice(1);
}

export function color(value: string, code: number): string {
    if (!stdout.isTTY || process.env.NO_COLOR !== undefined) return value;
    return `\u001b[${code}m${value}\u001b[0m`;
}

export function renderBox(content: string, title: string, borderCode = 36, maximumWidth = stdout.columns ?? 120): string {
    const contentWidth = Math.max(20, Math.min(120, maximumWidth) - 4);
    const wrapped = content.split('\n').flatMap((line) => wrapLine(line, contentWidth));
    const lines = [` ${title} `, ...wrapped.map(line => ` ${line}`)];
    const width = Math.max(...lines.map(displayWidth)) + 1;
    const border = color(`╭${'─'.repeat(width)}╮`, borderCode);
    const bottom = color(`╰${'─'.repeat(width)}╯`, borderCode);
    return [
        border,
        ...lines.map(line => `${color('│', borderCode)}${line}${' '.repeat(Math.max(0, width - displayWidth(line)))}${color('│', borderCode)}`),
        bottom,
    ].join('\n');
}

function wrapLine(line: string, maximumWidth: number): string[] {
    if (displayWidth(line) <= maximumWidth) return [line];
    const indent = line.match(/^\s*/)?.[0] ?? '';
    const words = line.trim().split(/\s+/);
    const lines: string[] = [];
    let current = indent;
    for (const word of words) {
        const candidate = current.trim() ? `${current} ${word}` : `${indent}${word}`;
        if (displayWidth(candidate) <= maximumWidth) {
            current = candidate;
            continue;
        }
        if (current.trim()) lines.push(current);
        const chunks = splitVisibleToken(word, Math.max(1, maximumWidth - displayWidth(indent)));
        for (const chunk of chunks.slice(0, -1)) lines.push(`${indent}${chunk}`);
        current = `${indent}${chunks.at(-1) ?? ''}`;
    }
    if (current.trim() || lines.length === 0) lines.push(current);
    return lines;
}

function splitVisibleToken(value: string, maximumWidth: number): string[] {
    const characters = [...stripAnsi(value)];
    const chunks: string[] = [];
    let current = '';
    let width = 0;
    for (const character of characters) {
        const characterWidth = displayWidth(character);
        if (current && width + characterWidth > maximumWidth) {
            chunks.push(current);
            current = '';
            width = 0;
        }
        current += character;
        width += characterWidth;
    }
    if (current || chunks.length === 0) chunks.push(current);
    return chunks;
}

export function displayWidth(value: string): number {
    return [...stripAnsi(value)].reduce((width, character) => {
        if (/\p{Mark}/u.test(character)) return width;
        const codePoint = character.codePointAt(0) ?? 0;
        if (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)) return width;
        return width + (isWideCodePoint(codePoint) ? 2 : 1);
    }, 0);
}

function isWideCodePoint(codePoint: number): boolean {
    return codePoint >= 0x1100 && (
        codePoint <= 0x115f
        || codePoint === 0x2329
        || codePoint === 0x232a
        || (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f)
        || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
        || (codePoint >= 0xf900 && codePoint <= 0xfaff)
        || (codePoint >= 0xfe10 && codePoint <= 0xfe19)
        || (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
        || (codePoint >= 0xff00 && codePoint <= 0xff60)
        || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
        || (codePoint >= 0x1f300 && codePoint <= 0x1faff)
        || (codePoint >= 0x20000 && codePoint <= 0x3fffd)
    );
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
