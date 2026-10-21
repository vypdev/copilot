import { verificationSetupDigest } from './verification_setup_snapshot';
import { registerNativeVerificationProfile, nativeVerificationProfilePaths } from './native_verification_profiles';
import { realpathSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, join, relative, isAbsolute, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PreparedVerificationSetup } from '../application/ports/verification_setup_ports';
import { VerificationSetupError, VERIFICATION_SETUP_LIMITS, VERIFICATION_SETUP_PATH } from '../application/policies/verification_setup_policy';
import { applyVerificationSetupResult } from './verification_setup_result';
import { logInfo } from '../application/ports/logging_ports';
import { nativePause, nativeSession, readNativeRecord, writeNativeRecord, type NativeVerificationResponse } from './native_verification_protocol';
import { stageNativeVerificationAction } from './native_verification_staging';
import { verificationCandidateIdentity } from './native_verification_candidate';


/** The runner executes YAML. This adapter pauses the admitted call stack at its verification boundary. */
export async function prepareRepositoryVerification(setup: PreparedVerificationSetup, environment: Record<string, string>): Promise<void> {
    if (setup.kind === 'disabled') return;
    if (setup.kind === 'blocked') throw new VerificationSetupError(setup.reason, setup.sourceSha);
    const session = process.env.COPILOT_NATIVE_WORKER_SESSION;
    if (!session) throw new VerificationSetupError('native-workflow-required', setup.sourceSha);
    try {
        nativeSession(session);
        const requests = readNativeRecord<{count: number}>(session, 'request-count.json')?.count ?? 0;
        if (requests >= VERIFICATION_SETUP_LIMITS.requests) throw new VerificationSetupError('handoff-invalid');
        writeNativeRecord(session, 'request-count.json', { count: requests + 1 });
        if (realpathSync(process.cwd()) !== setup.workspace) throw new VerificationSetupError('workspace-changed');
        registerNativeVerificationProfile(session, environment.HOME);
        const identity = verificationCandidateIdentity(setup.workspace, environment);
        stageNativeVerificationAction(setup, session);
        const id = randomUUID();
        writeNativeRecord(session, 'request.json', { id, sourceSha: setup.sourceSha, digest: verificationSetupDigest(setup), environment });
        logInfo(`Preparing repository verification (${VERIFICATION_SETUP_PATH}; trusted source SHA: ${setup.sourceSha}).`);
        const deadline = Date.now() + VERIFICATION_SETUP_LIMITS.timeoutMs;
        let response: NativeVerificationResponse | undefined;
        while (!(response = readNativeRecord<NativeVerificationResponse>(session, `response-${id}.json`))) {
            if (readNativeRecord(session, 'cancel.json')) throw new VerificationSetupError('cancelled');
            if (Date.now() >= deadline) throw new VerificationSetupError('timeout');
            await nativePause(100);
        }
        if (response.id !== id || response.success !== true) throw new VerificationSetupError('process-failed');
        if (verificationCandidateIdentity(setup.workspace, environment) !== identity) throw new VerificationSetupError('candidate-changed');
        if (typeof response.path !== 'string' || response.path.length > 16_384 || response.javaHome !== undefined && typeof response.javaHome !== 'string') throw new VerificationSetupError('result-invalid');
        const original = new Set((environment.PATH ?? '').split(delimiter));
        const previousProfiles = nativeVerificationProfilePaths(session).filter(profile => profile !== environment.HOME);
        const fromPreviousProfile = (path: string): boolean => previousProfiles.some(profile => {
            const part = relative(profile, path);
            return part === '' || part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part);
        });
        const additions = [...new Set(response.path.split(delimiter).filter(path => path && !original.has(path) && !fromPreviousProfile(path)))];
        const result = join(environment.HOME, 'native-setup-result.json');
        writeFileSync(result, JSON.stringify({ schemaVersion: 1, path: additions,
            environment: response.javaHome && response.javaHome !== environment.JAVA_HOME ? { JAVA_HOME: response.javaHome } : {} }), { mode: 0o600, flag: 'wx' });
        applyVerificationSetupResult(result, environment, [setup.workspace, environment.HOME, ...(setup.toolRoot ? [setup.toolRoot] : [])]);
        logInfo('Repository setup completed; runtime preflight and verification may proceed.');
    } catch (error) {
        throw new VerificationSetupError(error instanceof VerificationSetupError ? error.reason : 'handoff-invalid', setup.sourceSha);
    } finally {
        rmSync(join(session, 'request.json'), { force: true });
    }
}
