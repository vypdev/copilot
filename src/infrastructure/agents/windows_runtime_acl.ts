import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

const SID_PATTERN = /S-\d+(?:-\d+)+/;

function systemTool(name: string): string {
    const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
    return join(systemRoot, 'System32', name);
}

function runIcacls(args: string[], cwd?: string): void {
    execFileSync(systemTool('icacls.exe'), args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15_000,
        windowsHide: true,
    });
}

interface WindowsUserIdentity {
    readonly sid: string;
    readonly localAdministrator: boolean;
}

export function matchesWindowsRuntimePrincipal(principal: string, identity: WindowsUserIdentity): boolean {
    return principal === identity.sid || (principal === 'LA' && identity.localAdministrator);
}

export function isLocalWindowsAdministrator(sid: string, accountDomain: string | undefined, computerName: string): boolean {
    return sid.endsWith('-500') && accountDomain?.toLowerCase() === computerName.toLowerCase();
}

function currentUserIdentity(): WindowsUserIdentity {
    const identity = execFileSync(systemTool('whoami.exe'), ['/user', '/fo', 'csv', '/nh'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15_000,
        windowsHide: true,
    });
    const sid = identity.match(SID_PATTERN)?.[0];
    if (!sid) throw new Error('Could not identify the Windows runtime owner.');
    const account = /^\uFEFF?"([^"\r\n]+)"\s*,/.exec(identity)?.[1];
    const accountDomain = account?.split('\\')[0];
    return {
        sid,
        localAdministrator: isLocalWindowsAdministrator(sid, accountDomain, hostname()),
    };
}

function withSavedAcl<T>(path: string, use: (snapshot: string, lines: string[]) => T): T {
    const directory = mkdtempSync(join(tmpdir(), 'copilot-acl-inspect-'));
    const snapshot = join(directory, 'acl.txt');
    try {
        runIcacls([basename(path), '/save', snapshot], dirname(path));
        const data = readFileSync(snapshot);
        const contents = data.includes(0) ? data.toString('utf16le') : data.toString('utf8');
        const lines = contents.replace(/^\uFEFF/, '').split(/\r?\n/);
        if (!lines[0] || !lines[1]) throw new Error('Could not read the Windows runtime ACL.');
        return use(snapshot, lines);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}

function savedDacl(path: string): string {
    return withSavedAcl(path, (_snapshot, lines) => lines[1].trim());
}

function assertOwnerOnlyDacl(sddl: string, identity: WindowsUserIdentity, directory: boolean): void {
    const isCurrentUser = (principal: string): boolean => matchesWindowsRuntimePrincipal(principal, identity);
    const owner = /^O:([^:]+?)(?=G:|D:|S:|$)/.exec(sddl)?.[1];
    const dacl = /D:.*?(?=S:|$)/.exec(sddl)?.[0] ?? '';
    const firstAce = dacl.indexOf('(');
    const flags = firstAce < 0 ? '' : dacl.slice(0, firstAce);
    const entries = firstAce < 0 ? '' : dacl.slice(firstAce);
    const aces = [...entries.matchAll(/\(([^()]*)\)/g)].map(match => match[1].split(';'));
    const noUnparsedEntries = entries.replace(/\([^()]*\)/g, '') === '';
    const validOwnerAce = (fields: string[]): boolean => fields.length === 6
        && fields[0] === 'A' && fields[2] === 'FA'
        && fields[3] === '' && fields[4] === '' && isCurrentUser(fields[5]);
    const appliesToPath = (fields: string[]): boolean => !fields[1].includes('IO');
    const inheritsToChildren = (fields: string[]): boolean => fields[1].includes('OI') && fields[1].includes('CI');
    if ((owner !== undefined && !isCurrentUser(owner)) || !flags.startsWith('D:') || !flags.slice(2).includes('P')
        || !noUnparsedEntries || aces.length === 0 || !aces.every(validOwnerAce)
        || !aces.some(appliesToPath)
        || (directory && !aces.some(inheritsToChildren))
        || (!directory && !aces.every(fields => fields[1] === ''))) {
        throw new Error('Unsafe managed runtime ACL.');
    }
}

export function makeWindowsRuntimePathPrivate(path: string, directory: boolean): void {
    if (process.platform !== 'win32') return;
    const { sid } = currentUserIdentity();
    runIcacls([path, '/setowner', `*${sid}`]);
    withSavedAcl(path, (snapshot, lines) => {
        lines[1] = `D:P(A;${directory ? 'OICI' : ''};FA;;;${sid})`;
        writeFileSync(snapshot, `\uFEFF${lines.join('\r\n')}`, 'utf16le');
        runIcacls([dirname(path), '/restore', snapshot]);
    });
    verifyWindowsRuntimePathPrivate(path, directory);
}

export function verifyWindowsRuntimePathPrivate(path: string, directory: boolean): void {
    if (process.platform !== 'win32') return;
    const identity = currentUserIdentity();
    const { sid } = identity;
    // Reassert ownership before reading the DACL: an owner can rewrite its ACL.
    runIcacls([path, '/setowner', `*${sid}`]);
    assertOwnerOnlyDacl(savedDacl(path), identity, directory);
}
