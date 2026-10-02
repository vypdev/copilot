import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SID_PATTERN = /S-\d+(?:-\d+)+/;

function systemTool(name: string): string {
    const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
    return join(systemRoot, 'System32', name);
}

function runIcacls(args: string[]): void {
    execFileSync(systemTool('icacls.exe'), args, {
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

function savedDacl(path: string): string {
    const directory = mkdtempSync(join(tmpdir(), 'copilot-acl-inspect-'));
    const snapshot = join(directory, 'acl.txt');
    try {
        runIcacls([path, '/save', snapshot]);
        const data = readFileSync(snapshot);
        const contents = data.includes(0) ? data.toString('utf16le') : data.toString('utf8');
        const lines = contents.replace(/^\uFEFF/, '').split(/\r?\n/);
        const dacl = lines[1]?.trim();
        if (!dacl) throw new Error('Could not read the Windows runtime ACL.');
        return dacl;
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}

function assertOwnerOnlyDacl(sddl: string, sid: string, directory: boolean): void {
    const owner = /^O:([^:]+?)(?=G:|D:|S:|$)/.exec(sddl)?.[1];
    const dacl = /D:.*?(?=S:|$)/.exec(sddl)?.[0] ?? '';
    const firstAce = dacl.indexOf('(');
    const flags = firstAce < 0 ? '' : dacl.slice(0, firstAce);
    const entries = firstAce < 0 ? '' : dacl.slice(firstAce);
    const ace = /^\(([^()]*)\)$/.exec(entries)?.[1];
    const fields = ace?.split(';');
    const inheritance = fields?.[1] ?? '';
    const rights = fields?.[2] ?? '';
    if ((owner !== undefined && owner !== sid) || !flags.startsWith('D:') || !flags.slice(2).includes('P') || !fields || fields.length !== 6
        || fields[0] !== 'A' || fields[3] !== '' || fields[4] !== ''
        || fields[5] !== sid || rights !== 'FA'
        || (directory && (!inheritance.includes('OI') || !inheritance.includes('CI')))
        || (!directory && inheritance !== '')) {
        throw new Error(`Unsafe managed runtime ACL (${JSON.stringify({
            ownerPresent: owner !== undefined,
            ownerMatches: owner === sid,
            flags,
            aceFields: fields?.length ?? 0,
            aceType: fields?.[0] ?? '',
            inheritance,
            rights,
            principalMatches: fields?.[5] === sid,
        })}).`);
    }
}

export function makeWindowsRuntimePathPrivate(path: string, directory: boolean): void {
    if (process.platform !== 'win32') return;
    const sid = currentUserSid();
    runIcacls([path, '/inheritance:r']);
    runIcacls([path, '/grant:r', `*${sid}:${directory ? '(OI)(CI)F' : 'F'}`]);
    verifyWindowsRuntimePathPrivate(path, directory);
}

export function verifyWindowsRuntimePathPrivate(path: string, directory: boolean): void {
    if (process.platform !== 'win32') return;
    const sid = currentUserSid();
    // Reassert ownership before reading the DACL: an owner can rewrite its ACL.
    runIcacls([path, '/setowner', `*${sid}`]);
    assertOwnerOnlyDacl(savedDacl(path), sid, directory);
}
