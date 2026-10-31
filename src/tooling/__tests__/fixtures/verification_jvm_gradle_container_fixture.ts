/** Real production adapter acceptance; this is not an Actions YAML emulator. */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GitCommitAdapter } from '../../../infrastructure/git_commit_adapter';

let stage = 'account';
async function verify(): Promise<void> {
    assert.equal(process.platform, 'linux');
    assert.equal(process.getuid?.(), 1000);
    const candidate = '/tmp/copilot-candidate';
    mkdirSync(join(candidate, '.copilot'), { recursive: true });
    writeFileSync(join(candidate, '.copilot/verification-prerequisites.json'), JSON.stringify({ schemaVersion: 1, runtimes: { java: '17' } }));
    writeFileSync(join(candidate, 'candidate-marker'), 'unchanged');
    process.chdir(candidate);
    for (const name of ['JDK_JAVA_OPTIONS', 'JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS', 'GRADLE_OPTS', 'MAVEN_OPTS', 'NODE_OPTIONS']) {
        process.env[name] = '-DcopilotForeignInjection=true';
    }
    process.env.GRADLE_USER_HOME = '/foreign/unapproved-gradle';
    const reports: string[] = [];
    stage = 'adapter-construct';
    const adapter = new GitCommitAdapter();
    for (let index = 0; index < 2; index++) {
        stage = 'adapter-execute';
        let output = '';
        try {
            await adapter.execute(process.execPath, ['/fixture/probe.cjs', process.argv[2] ?? 'private'], {
                untrusted: true, verifyRuntimePrerequisites: true,
                stdout: bytes => { output += bytes.toString('utf8'); },
            });
        } catch (error) {
            const reason = /^FIXTURE_FAILURE:fixture-[a-z-]+$/mu.exec(output)?.[0];
            if (reason) process.stderr.write(reason + '\n');
            throw error;
        }
        assert.equal(readFileSync(join(candidate, 'candidate-marker'), 'utf8'), 'unchanged');
        reports.push(output.trim());
    }
    for (const report of reports) process.stdout.write(report + '\n');
    process.stdout.write('PRODUCTION_ADAPTER_TWO_FRESH_VERIFICATIONS:true\n');
}

void verify().catch((error: unknown) => {
    const name = error instanceof Error && /^[A-Za-z]{1,64}$/u.test(error.name) ? error.name : 'Unknown';
    const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        && /^[A-Za-z0-9.-]{1,64}$/u.test(error.code) ? error.code : 'none';
    process.stderr.write('Production JVM/Gradle acceptance failed: ' + stage + '/' + name + '/' + code + '; no publication authorized.\n');
    process.exitCode = 1;
});
