import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertAgentExecutableMetadata, validateAgentExecutableFile } from '../agent_executable_file';
import * as windowsRuntimeAcl from '../windows_runtime_acl';

const regularFile = { isFile: true, mode: 0o700, ownerUid: 123 };

describe('agent executable file trust', () => {
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
            expect(() => validateAgentExecutableFile(executable))
                .toThrow('Agent executable has an unsafe or unreadable Windows ACL.');
        } finally {
            Object.defineProperty(process, 'platform', platform);
            acl.mockRestore();
            rmSync(directory, { recursive: true, force: true });
        }
    });
});
