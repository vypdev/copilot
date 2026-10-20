import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync, linkSync } from 'node:fs';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { assertVerificationRuntimePrerequisites, type VerificationRuntimeProbe, type VerificationRuntimeProbeRunner } from '../verification_runtime_preflight';
import { readVerificationRuntimeManifest } from '../verification_runtime_manifest';
import { VerificationPrerequisiteError } from '../../application/policies/verification_runtime_policy';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'copilot-runtime-check-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
function declare(runtimes: Record<string, string>) {
    mkdirSync(join(root, '.copilot'), { recursive: true });
    writeFileSync(join(root, '.copilot/verification-prerequisites.json'), JSON.stringify({ schemaVersion: 1, runtimes }));
}
const ready = () => ({ status: 0, output: 'openjdk version "17.0.13"' });
const fakeProbe = (result: VerificationRuntimeProbe = ready()) =>
    jest.fn<VerificationRuntimeProbe, Parameters<VerificationRuntimeProbeRunner>>(() => result);

describe('repository verification runtime preflight', () => {
    test('uses the installed Node runtime through the actual bounded process adapter', () => {
        declare({ node: process.versions.node.split('.')[0] });
        expect(() => assertVerificationRuntimePrerequisites({ PATH: dirname(process.execPath) }, root)).not.toThrow();
    });
    test('maps an actual unavailable Java process to a safe prerequisite result', () => {
        declare({ java: '17' });
        expect(() => assertVerificationRuntimePrerequisites({ JAVA_HOME: join(root, 'missing-jdk') }, root)).toThrow('Java 17 is unavailable');
    });
    test('legacy and non-JVM repositories impose no Java requirement', () => {
        const run = jest.fn();
        assertVerificationRuntimePrerequisites({}, root, run);
        expect(run).not.toHaveBeenCalled();
        mkdirSync(join(root, '.copilot'));
        expect(readVerificationRuntimeManifest(root)).toEqual([]);
    });
    test('a Node-only repository checks Node without selecting Java', () => {
        declare({ node: '24' });
        const run = jest.fn(() => ({ status: 0, output: 'v24.4.0' }));
        assertVerificationRuntimePrerequisites({}, root, run);
        expect(run).toHaveBeenCalledWith('node', ['--version'], {});
        expect(run).toHaveBeenCalledTimes(1);
    });
    test('a correctly provisioned JVM consumer passes with fixed version arguments', () => {
        declare({ java: '17' });
        const run = fakeProbe();
        assertVerificationRuntimePrerequisites({ PATH: '/tools/bin' }, root, run, 'linux');
        expect(run).toHaveBeenCalledWith('java', ['-version'], { PATH: '/tools/bin' });
    });
    test('JAVA_HOME-only provisioning works without java on PATH', () => {
        declare({ java: '17' });
        const run = fakeProbe();
        assertVerificationRuntimePrerequisites({ JAVA_HOME: '/tools/jdk-17' }, root, run, 'linux');
        expect(run).toHaveBeenCalledWith('/tools/jdk-17/bin/java', ['-version'], { JAVA_HOME: '/tools/jdk-17' });
    });
    test('uses the Windows Java installation path without executing a shell', () => {
        declare({ java: '17' });
        const run = fakeProbe();
        assertVerificationRuntimePrerequisites({ JAVA_HOME: 'C:\\Tools\\JDK17' }, root, run, 'win32');
        expect(run.mock.calls[0][0]).toBe('C:\\Tools\\JDK17\\bin\\java.exe');
    });
    test('selects POSIX path semantics explicitly, independent of the test host', () => {
        declare({ java: '17' });
        const run = fakeProbe();
        for (const platform of ['linux', 'darwin'] as const) {
            assertVerificationRuntimePrerequisites({ JAVA_HOME: '/tools/jdk-17' }, root, run, platform);
            expect(() => assertVerificationRuntimePrerequisites({ JAVA_HOME: 'C:\\Tools\\JDK17' }, root, run, platform))
                .toThrow(VerificationPrerequisiteError);
        }
        expect(run).toHaveBeenCalledTimes(2);
        expect(run.mock.calls.every(([program]) => program === '/tools/jdk-17/bin/java')).toBe(true);
    });
    test('uses fixed Windows cmd arguments for the installed pnpm command shim', () => {
        declare({ pnpm: '10' });
        const run = fakeProbe({ status: 0, output: '10.12.4' });
        assertVerificationRuntimePrerequisites({ SystemRoot: 'C:\\Windows' }, root, run, 'win32');
        expect(run.mock.calls[0].slice(0, 2)).toEqual(['C:\\Windows\\System32\\cmd.exe', ['/d', '/s', '/c', 'pnpm --version']]);
    });
    test('uses the Windows Python executable', () => {
        declare({ python: '3.12' });
        const run = fakeProbe({ status: 0, output: 'Python 3.12.4' });
        assertVerificationRuntimePrerequisites({}, root, run, 'win32');
        expect(run.mock.calls[0][0]).toBe('python');
    });
    test.each([
        { status: null, output: 'private-secret', failed: true },
        { status: 1, output: 'private-secret' },
        { status: 0, output: 'private-secret' },
        { status: 0, output: 'x'.repeat(8193) },
        { status: 0, output: 'openjdk version "21.0.1"' },
    ])('blocks missing, failed, unreadable, oversized or incompatible runtime evidence: %p', result => {
        declare({ java: '17' });
        expect(() => assertVerificationRuntimePrerequisites({}, root, () => result)).toThrow(VerificationPrerequisiteError);
        try { assertVerificationRuntimePrerequisites({}, root, () => result); }
        catch (error) { expect(String(error)).not.toContain('private-secret'); }
    });
    test('does not leak a thrown process error', () => {
        declare({ java: '17' });
        expect(() => assertVerificationRuntimePrerequisites({}, root, () => { throw new Error('private-secret'); })).toThrow('Java 17 is unavailable');
    });
    test.each(['relative/jdk', '/tools/jdk\nprivate-secret'])('rejects unsafe JAVA_HOME %p before a probe', javaHome => {
        declare({ java: '17' });
        const run = jest.fn();
        expect(() => assertVerificationRuntimePrerequisites({ JAVA_HOME: javaHome }, root, run, 'linux')).toThrow(VerificationPrerequisiteError);
        expect(run).not.toHaveBeenCalled();
    });
    test('requires an absolute Windows system directory for the fixed pnpm shim', () => {
        declare({ pnpm: '10' });
        expect(() => assertVerificationRuntimePrerequisites({}, root, jest.fn(), 'win32')).toThrow(VerificationPrerequisiteError);
    });
    test.each(['directory', 'file'] as const)('fails closed on %s metadata access denial without exposing the filesystem error', target => {
        declare({ java: '17' });
        const directory = fs.lstatSync(join(root, '.copilot'));
        const read = jest.spyOn(fs, 'lstatSync');
        if (target === 'file') read.mockReturnValueOnce(directory);
        read.mockImplementationOnce(() => { throw Object.assign(new Error('private-secret'), { code: 'EACCES' }); });
        try {
            expect(() => readVerificationRuntimeManifest(root)).toThrow('invalid or unsafe');
        } finally { read.mockRestore(); }
    });
    test('rejects a manifest replaced between metadata inspection and opening', () => {
        declare({ java: '17' });
        const changed = fs.lstatSync(join(root, '.copilot/verification-prerequisites.json'));
        changed.ino++;
        const read = jest.spyOn(fs, 'fstatSync').mockReturnValueOnce(changed);
        try { expect(() => readVerificationRuntimeManifest(root)).toThrow(VerificationPrerequisiteError); }
        finally { read.mockRestore(); }
    });
    test('keeps the read bounded if the file grows after inspection', () => {
        declare({ java: '17' });
        const read = jest.spyOn(fs, 'readSync').mockReturnValueOnce(16 * 1024 + 1);
        try { expect(() => readVerificationRuntimeManifest(root)).toThrow(VerificationPrerequisiteError); }
        finally { read.mockRestore(); }
    });
    test.each(['file-symlink', 'parent-symlink', 'hardlink', 'directory', 'oversized', 'malformed', 'unknown-schema'] as const)(
        'rejects an unsafe declaration: %s', scenario => {
            declare({ java: '17' });
            const path = join(root, '.copilot/verification-prerequisites.json');
            if (scenario === 'parent-symlink') {
                rmSync(join(root, '.copilot'), { recursive: true });
                mkdirSync(join(root, 'outside'));
                symlinkSync(join(root, 'outside'), join(root, '.copilot'), 'junction');
            } else if (scenario === 'hardlink') linkSync(path, join(root, 'other.json'));
            else if (scenario === 'file-symlink') {
                rmSync(path); writeFileSync(join(root, 'other.json'), 'private-secret');
                symlinkSync(join(root, 'other.json'), path);
            } else if (scenario === 'directory') { rmSync(path); mkdirSync(path); }
            else writeFileSync(path, scenario === 'oversized' ? ' '.repeat(16385)
                : scenario === 'malformed' ? 'private-secret' : '{"schemaVersion":2,"runtimes":{}}');
            expect(() => readVerificationRuntimeManifest(root)).toThrow(VerificationPrerequisiteError);
        },
    );
});
