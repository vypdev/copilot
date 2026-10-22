import { existsSync, lstatSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { VerificationSetupError } from '../application/policies/verification_setup_policy';

/** Only source workflows use this snapshot; installed remote Actions already live outside the candidate. */
export function cleanupNativeSourceRuntime(root: string, workspace: string): void {
    if (!root || !existsSync(root)) return;
    const allowed = ['.copilot-native-runtime', '.copilot-native-fixture-runtime'].map(name => join(dirname(workspace), name));
    if (!allowed.includes(root) || lstatSync(root).isSymbolicLink() || realpathSync(root) !== root) throw new VerificationSetupError('handoff-invalid');
    let receipt: {kind?: string; workspace?: string};
    try { receipt = JSON.parse(readFileSync(join(root, '.copilot-runtime-snapshot.json'), 'utf8')) as typeof receipt; }
    catch { throw new VerificationSetupError('handoff-invalid'); }
    if (receipt?.kind !== 'copilot-native-runtime' || receipt.workspace !== workspace) throw new VerificationSetupError('handoff-invalid');
    rmSync(root, { recursive: true, force: true });
}
