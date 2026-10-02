import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

function currentUserSid(): string {
    const identity = execFileSync(systemTool('whoami.exe'), ['/user', '/fo', 'csv', '/nh'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15_000,
        windowsHide: true,
    });
    const sid = identity.match(SID_PATTERN)?.[0];
    if (!sid) throw new Error('Could not identify the Windows runtime owner.');
    return sid;
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

function assertOwnerOnlyDacl(sddl: string, sid: string, directory: boolean): void {
    const owner = /^O:([^:]+?)(?=G:|D:|S:|$)/.exec(sddl)?.[1];
    const dacl = /D:.*?(?=S:|$)/.exec(sddl)?.[0] ?? '';
    const firstAce = dacl.indexOf('(');
    const flags = firstAce < 0 ? '' : dacl.slice(0, firstAce);
    const entries = firstAce < 0 ? '' : dacl.slice(firstAce);
    const aces = [...entries.matchAll(/\(([^()]*)\)/g)].map(match => match[1].split(';'));
    const noUnparsedEntries = entries.replace(/\([^()]*\)/g, '') === '';
    const validOwnerAce = (fields: string[]): boolean => fields.length === 6
        && fields[0] === 'A' && fields[2] === 'FA'
        && fields[3] === '' && fields[4] === '' && fields[5] === sid;
    const appliesToPath = (fields: string[]): boolean => !fields[1].includes('IO');
    const inheritsToChildren = (fields: string[]): boolean => fields[1].includes('OI') && fields[1].includes('CI');
    if ((owner !== undefined && owner !== sid) || !flags.startsWith('D:') || !flags.slice(2).includes('P')
        || !noUnparsedEntries || aces.length === 0 || !aces.every(validOwnerAce)
        || !aces.some(appliesToPath)
        || (directory && !aces.some(inheritsToChildren))
        || (!directory && !aces.every(fields => fields[1] === ''))) {
        throw new Error(`Unsafe managed runtime ACL (${JSON.stringify({
            ownerPresent: owner !== undefined,
            ownerMatches: owner === sid,
            flags,
            aceCount: aces.length,
            noUnparsedEntries,
            aces: aces.map(fields => ({
                fields: fields.length,
                type: fields[0],
                inheritance: fields[1],
                rights: fields[2],
                principalMatches: fields[5] === sid,
            })),
        })}).`);
    }
}

export function makeWindowsRuntimePathPrivate(path: string, directory: boolean): void {
    if (process.platform !== 'win32') return;
    const sid = currentUserSid();
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
    const sid = currentUserSid();
    // Reassert ownership before reading the DACL: an owner can rewrite its ACL.
    runIcacls([path, '/setowner', `*${sid}`]);
    assertOwnerOnlyDacl(savedDacl(path), sid, directory);
}
