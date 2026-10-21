import { realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PreparedVerificationSetup } from '../application/ports/verification_setup_ports';
import { VerificationSetupError } from '../application/policies/verification_setup_policy';
import { applyVerificationSetupResult } from './verification_setup_result';
import { runVerificationSetupProcess } from './verification_setup_process';
import { logInfo } from '../application/ports/logging_ports';
import { VERIFICATION_SETUP_PATH } from '../application/policies/verification_setup_policy';

/** Called once per verification command, on its fresh private profile, before runtime probes. */
export async function prepareRepositoryVerification(setup: PreparedVerificationSetup, environment: Record<string, string>): Promise<void> {
    if (setup.kind === 'disabled') return;
    if (setup.kind === 'blocked') throw new VerificationSetupError(setup.reason, setup.sourceSha);
    try {
        if (realpathSync(process.cwd()) !== setup.workspace) throw new VerificationSetupError('workspace-changed', setup.sourceSha);
        const profile = realpathSync(environment.HOME);
        const script = join(profile, 'verification-setup.mjs');
        const result = join(profile, 'verification-setup-result.json');
        writeFileSync(script, setup.script, { mode: 0o600, flag: 'wx' });
        await runVerificationSetupProcess(setup.node, script, setup.workspace, {
            ...environment,
            COPILOT_VERIFICATION_SETUP_PROTOCOL: '1',
            COPILOT_VERIFICATION_SETUP_RESULT: result,
            COPILOT_VERIFICATION_SETUP_SOURCE_SHA: setup.sourceSha,
        }, setup.sourceSha);
        applyVerificationSetupResult(result, environment, [setup.workspace, profile, ...(setup.toolRoot ? [setup.toolRoot] : [])]);
        logInfo(`Repository setup prepared (${VERIFICATION_SETUP_PATH}; trusted source SHA: ${setup.sourceSha}).`);
    } catch (error) {
        throw new VerificationSetupError(error instanceof VerificationSetupError ? error.reason : 'process-failed', setup.sourceSha,
            error instanceof VerificationSetupError ? error.exitCode : undefined);
    }
}
