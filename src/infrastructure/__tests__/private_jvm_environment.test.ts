import fs from 'node:fs';
import * as privateRoots from '../agents/agent_private_install_root';
import { tmpdir } from 'node:os';
import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { prepareUntrustedCommandEnvironment } from '../untrusted_command_environment';
import { privateJvmHomeOption } from '../private_jvm_environment';

describe('JDK launcher private property grammar', () => {
    it.each([
        ['plain', '/tmp/plain', '-Duser.home=/tmp/plain'],
        ['space', '/tmp/private profile', '-Duser.home=/tmp/private" "profile'],
        ['single quote', "/tmp/with'single", "-Duser.home=/tmp/with\"'\"single"],
        ['double quote', '/tmp/with"double', "-Duser.home=/tmp/with'\"'double"],
        ['both quotes', '/tmp/a\'" b', '-Duser.home=/tmp/a' + "\"'\"" + "'\"'" + '" "b'],
        ['tab', '/tmp/a\tb', '-Duser.home=/tmp/a"\t"b'],
        ['form feed', '/tmp/a\fb', '-Duser.home=/tmp/a"\f"b'],
        ['Unicode', '/tmp/ñ東京', '-Duser.home=/tmp/ñ東京'],
        ['Windows separators', 'C:\\Users\\Fixture Name\\run', '-Duser.home=C:\\Users\\Fixture" "Name\\run'],
        ['trailing separator', 'C:\\private dir\\', '-Duser.home=C:\\private" "dir\\'],
        ['backslash beside quote', '/tmp/a\\"b', '-Duser.home=/tmp/a\\' + "'\"'" + 'b'],
        ['option-like suffix', '/tmp/a -DcopilotInjectedFlag=yes', '-Duser.home=/tmp/a" "-DcopilotInjectedFlag=yes'],
    ])('preserves %s as one property argument', (_name, home, expected) => {
        expect(privateJvmHomeOption(home)).toBe(expected);
    });
    it.each(['', '/tmp/a\0b', '/tmp/a\rb', '/tmp/a\nb'])('rejects an invalid home without disclosing it', home => {
        expect(() => privateJvmHomeOption(home)).toThrow('Private JVM home is invalid.');
    });
});

describe('private verification JVM and Gradle discovery', () => {
    it.each<NodeJS.Platform>(['linux', 'darwin', 'win32'])('derives current private locations on %s instead of inheriting tool options', platform => {
        const runtime = prepareUntrustedCommandEnvironment({
            PATH: '/tools/bin', JAVA_HOME: '/tools/jdk17',
            JDK_JAVA_OPTIONS: '-javaagent:/foreign/agent.jar -Duser.home=/foreign/account',
            GRADLE_USER_HOME: '/foreign/gradle', JAVA_TOOL_OPTIONS: '-Dsecret=foreign',
            _JAVA_OPTIONS: '-Dsecret=foreign', GRADLE_OPTS: '-Dsecret=foreign',
        }, platform);
        const home = runtime.environment.HOME;
        try {
            expect(home).toBe(realpathSync(home));
            expect(runtime.environment.GRADLE_USER_HOME).toBe(join(home, '.gradle'));
            expect(existsSync(runtime.environment.GRADLE_USER_HOME)).toBe(true);
            expect(runtime.environment.JDK_JAVA_OPTIONS).toEqual(expect.stringMatching(/^-Duser\.home=/u));
            expect(JSON.stringify(runtime.environment)).not.toContain('foreign');
            for (const key of ['JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS', 'GRADLE_OPTS']) expect(runtime.environment).not.toHaveProperty(key);
        } finally { runtime.cleanup(); }
        expect(existsSync(home)).toBe(false);
    });
    it('does not share Gradle caches between commands using the same source metadata', () => {
        const source = { GRADLE_USER_HOME: '/foreign/gradle', JDK_JAVA_OPTIONS: '-Duser.home=/foreign' };
        const first = prepareUntrustedCommandEnvironment(source);
        const second = prepareUntrustedCommandEnvironment(source);
        try {
            fs.writeFileSync(join(first.environment.GRADLE_USER_HOME, 'owned-cache'), 'first');
            expect(second.environment.HOME).not.toBe(first.environment.HOME);
            expect(second.environment.GRADLE_USER_HOME).not.toBe(first.environment.GRADLE_USER_HOME);
            expect(existsSync(join(second.environment.GRADLE_USER_HOME, 'owned-cache'))).toBe(false);
            expect(second.environment.JDK_JAVA_OPTIONS).not.toBe(first.environment.JDK_JAVA_OPTIONS);
        } finally { first.cleanup(); second.cleanup(); }
    });
    it('derives values without mutating the frozen caller environment', () => {
        const source = Object.freeze({ JDK_JAVA_OPTIONS: '-Dforeign=true', GRADLE_USER_HOME: '/foreign', JAVA_HOME: '/jdk17' });
        const runtime = prepareUntrustedCommandEnvironment(source);
        try {
            expect(source).toEqual({ JDK_JAVA_OPTIONS: '-Dforeign=true', GRADLE_USER_HOME: '/foreign', JAVA_HOME: '/jdk17' });
            expect(runtime.environment.JAVA_HOME).toBe('/jdk17');
            expect(runtime.environment.JDK_JAVA_OPTIONS).not.toContain('foreign');
        } finally { runtime.cleanup(); }
    });
    it('removes only the newly owned root when JVM home encoding fails', () => {
        const parent = fs.mkdtempSync(join(tmpdir(), 'copilot-775-invalid-home-'));
        const root = join(parent, 'owned-profile');
        fs.mkdirSync(root);
        const mocked = jest.spyOn(privateRoots, 'createPrivateVerificationRuntimeRoot').mockReturnValue(root);
        const canonical = jest.spyOn(fs, 'realpathSync').mockImplementationOnce(() => root + '\ninvalid');
        try {
            expect(() => prepareUntrustedCommandEnvironment()).toThrow('Private JVM home is invalid.');
            expect(existsSync(root)).toBe(false);
            expect(existsSync(parent)).toBe(true);
        } finally { canonical.mockRestore(); mocked.mockRestore(); fs.rmSync(parent, { recursive: true, force: true }); }
    });
    it('removes the owned profile if creating private Gradle state fails', () => {
        const root = fs.mkdtempSync(join(tmpdir(), 'copilot-775-mkdir-'));
        const mocked = jest.spyOn(privateRoots, 'createPrivateVerificationRuntimeRoot').mockReturnValue(root);
        const failure = new Error('fixture-private-directory-failed');
        const mkdir = jest.spyOn(fs, 'mkdirSync').mockImplementationOnce(() => { throw failure; });
        try {
            expect(() => prepareUntrustedCommandEnvironment()).toThrow(failure);
            expect(existsSync(root)).toBe(false);
        } finally { mkdir.mockRestore(); mocked.mockRestore(); fs.rmSync(root, { recursive: true, force: true }); }
    });
    it('cleans Gradle state idempotently without following a link to other owned test data', () => {
        const outside = fs.mkdtempSync(join(tmpdir(), 'copilot-775-outside-'));
        fs.writeFileSync(join(outside, 'marker'), 'preserved');
        const runtime = prepareUntrustedCommandEnvironment();
        try {
            fs.symlinkSync(outside, join(runtime.environment.GRADLE_USER_HOME, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
            runtime.cleanup(); runtime.cleanup();
            expect(fs.readFileSync(join(outside, 'marker'), 'utf8')).toBe('preserved');
            expect(existsSync(runtime.environment.HOME)).toBe(false);
        } finally { runtime.cleanup(); fs.rmSync(outside, { recursive: true, force: true }); }
    });
});
