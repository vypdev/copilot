import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    assertAgentExecutableMetadata, classifyWindowsExecutableAclFailure, validateAgentExecutableFile,
} from '../agent_executable_file';
import * as windowsRuntimeAcl from '../windows_runtime_acl';

const regularFile = { isFile: true, mode: 0o700, ownerUid: 123 };

describe('agent executable file trust', () => {
    it('classifies Windows ACL failures without returning path or principal data', () => {
        const privatePath = 'C:\\private\\codex.exe';
        const cases: Array<[Error, string]> = [
            [new Error(`Unsafe executable ACL owner (S-1-1-0) at ${privatePath}`), 'acl-file-owner'],
            [new Error(`Unsafe Windows executable ancestor ${privatePath}: Unsafe executable ACL owner (S-1-1-0)`), 'acl-ancestor-owner'],
            [new Error(`Unsafe Windows executable ancestor ${privatePath}: Agent executable is writable by another principal (WD:FA)`), 'acl-writable'],
            [new Error(`Unrecognized executable ACL at ${privatePath}`), 'acl-format'],
            [Object.assign(new Error(`PowerShell failed at ${privatePath}`), { code: 'ETIMEDOUT' }), 'acl-query-timeout'],
            [Object.assign(new Error(`PowerShell failed at ${privatePath}`), { status: 1 }), 'acl-query-failed'],
            [new Error(`Could not identify the Windows runtime owner at ${privatePath}`), 'acl-identity'],
            [new Error(`Other failure at ${privatePath}`), 'acl-unavailable'],
        ];
        for (const [error, expected] of cases) {
            const diagnostic = classifyWindowsExecutableAclFailure(error);
            expect(diagnostic).toBe(expected);
            expect(diagnostic).not.toContain(privatePath);
        }
    });

    it('rejects a non-file on every platform', () => {
        expect(() => assertAgentExecutableMetadata({ ...regularFile, isFile: false }, 'win32'))
            .toThrow('regular file');
    });

    it('does not interpret Unix mode bits as Windows ACLs', () => {
        expect(() => assertAgentExecutableMetadata({ ...regularFile, mode: 0o777 }, 'win32'))
            .not.toThrow();
    });

    it('rejects Unix group or world writes and foreign ownership', () => {
        expect(() => assertAgentExecutableMetadata({ ...regularFile, mode: 0o722 }, 'linux', 123))
            .toThrow('group- or world-writable');
        expect(() => assertAgentExecutableMetadata({ ...regularFile, ownerUid: 456 }, 'linux', 123))
            .toThrow('owned by the runner user or root');
    });

    it('accepts owner and root-owned private Unix files', () => {
        expect(() => assertAgentExecutableMetadata(regularFile, 'linux', 123)).not.toThrow();
        expect(() => assertAgentExecutableMetadata({ ...regularFile, ownerUid: 0 }, 'linux', 123))
            .not.toThrow();
        expect(() => assertAgentExecutableMetadata(regularFile, 'linux')).not.toThrow();
    });

    it('reads a local executable and rejects an inaccessible path', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-agent-file-trust-'));
        const executable = join(directory, process.platform === 'win32' ? 'agent.cmd' : 'agent');
        writeFileSync(executable, process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\nexit 0\n');
        if (process.platform !== 'win32') chmodSync(executable, 0o700);
        try {
            if (process.platform === 'win32') {
                expect(() => windowsRuntimeAcl.verifyWindowsAgentExecutableAcl(executable)).not.toThrow();
            }
            expect(() => validateAgentExecutableFile(executable)).not.toThrow();
            expect(() => validateAgentExecutableFile(join(directory, 'missing')))
                .toThrow('accessible executable file');
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    it('requires a readable safe Windows ACL and reports its failure without leaking details', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-agent-windows-acl-'));
        const executable = join(directory, 'agent.exe');
        writeFileSync(executable, 'fixture');
        if (process.platform !== 'win32') chmodSync(executable, 0o700);
        const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
        const acl = jest.spyOn(windowsRuntimeAcl, 'verifyWindowsAgentExecutableAcl').mockImplementation();
        Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
        try {
            expect(() => validateAgentExecutableFile(executable)).not.toThrow();
            expect(acl).toHaveBeenCalledWith(executable);
            acl.mockImplementation(() => { throw new Error('private fixture ACL details'); });
            try {
                validateAgentExecutableFile(executable);
                throw new Error('Expected an ACL rejection.');
            } catch (error) {
                expect(error).toMatchObject({
                    message: 'Agent executable has an unsafe or unreadable Windows ACL.',
                    preflightDiagnostic: 'acl-unavailable',
                });
                expect(JSON.stringify(error)).not.toContain('private fixture ACL details');
            }
        } finally {
            Object.defineProperty(process, 'platform', platform);
            acl.mockRestore();
            rmSync(directory, { recursive: true, force: true });
        }
    });

    (process.platform === 'win32' ? it : it.skip)('rejects a replaceable ancestor even when the executable and its parent are private', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-agent-parent-acl-'));
        const parent = join(directory, 'private-bin');
        const executable = join(parent, 'agent.exe');
        try {
            mkdirSync(parent);
            writeFileSync(executable, 'fixture');
            windowsRuntimeAcl.makeWindowsRuntimePathPrivate(directory, true);
            windowsRuntimeAcl.makeWindowsRuntimePathPrivate(parent, true);
            windowsRuntimeAcl.makeWindowsRuntimePathPrivate(executable, false);
            expect(() => validateAgentExecutableFile(executable)).not.toThrow();
            execFileSync('icacls.exe', [directory, '/grant', '*S-1-1-0:F'], { stdio: 'ignore' });
            expect(() => validateAgentExecutableFile(executable))
                .toThrow('unsafe or unreadable Windows ACL');
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
});
