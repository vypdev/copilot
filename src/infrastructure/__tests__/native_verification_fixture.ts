import { createPrivateVerificationRuntimeRoot } from '../agents/agent_private_install_root';
import { removeNativeVerificationProfiles } from '../native_verification_profiles';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { prepareUntrustedCommandEnvironment } from '../untrusted_command_environment';
import { writeNativeRecord, readNativeRecord, type NativeVerificationRequest } from '../native_verification_protocol';
import { VERIFICATION_SETUP_DIRECTORY } from '../../application/policies/verification_setup_policy';
import type { PreparedVerificationSetup } from '../../application/ports/verification_setup_ports';

export const COMPOSITE = 'name: Fixture\nruns:\n  using: composite\n  steps:\n    - run: echo reviewed\n      shell: bash\n';
export function nativeVerificationFixture() {
    const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'copilot-native-fixture-')));
    const runtime = prepareUntrustedCommandEnvironment();
    const session = fs.realpathSync(createPrivateVerificationRuntimeRoot());
    const previous = process.env.COPILOT_NATIVE_WORKER_SESSION;
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    git('init'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test');
    fs.writeFileSync(join(root, 'manifest'), 'initial'); git('add', '.'); git('commit', '-m', 'fixture');
    const cwd = jest.spyOn(process, 'cwd').mockReturnValue(root);
    process.env.COPILOT_NATIVE_WORKER_SESSION = session;
    writeNativeRecord(session, 'session.json', { schemaVersion: 1, workspace: root, run: process.env.GITHUB_RUN_ID ?? '',
        attempt: process.env.GITHUB_RUN_ATTEMPT ?? '', job: process.env.GITHUB_JOB ?? '', pid: process.pid });
    const setup: PreparedVerificationSetup = Object.freeze({ kind: 'ready', workspace: root, sourceSha: 'a'.repeat(40), files: Object.freeze([
        Object.freeze({ path: 'action.yml', base64: Buffer.from(COMPOSITE).toString('base64'), executable: false }),
        Object.freeze({ path: 'scripts/prepare.sh', base64: Buffer.from('echo reviewed').toString('base64'), executable: true }),
    ]) });
    const respond = (edit?: (request: NativeVerificationRequest) => Record<string, unknown>) => {
        const request = readNativeRecord<NativeVerificationRequest>(session, 'request.json', 32_768)!;
        if (!request) throw new Error('No pending native setup');
        writeNativeRecord(session, `response-${request.id}.json`, { id: request.id, success: true, path: request.environment.PATH ?? '', ...edit?.(request) });
    };
    return { root, runtime, session, git, setup, respond, action: join(root, VERIFICATION_SETUP_DIRECTORY), staged: join(root, '.git/copilot-verification-setup'),
        id: randomUUID(), cleanup: () => {
            cwd.mockRestore();
            if (previous === undefined) delete process.env.COPILOT_NATIVE_WORKER_SESSION; else process.env.COPILOT_NATIVE_WORKER_SESSION = previous;
            if (fs.existsSync(session)) removeNativeVerificationProfiles(session); fs.rmSync(session, { recursive: true, force: true }); runtime.cleanup(); fs.rmSync(root, { recursive: true, force: true });
        } };
}
