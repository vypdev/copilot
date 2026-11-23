import type { SetupBatchFile } from '../../domain/setup_batch';
import type { SetupInstallationReceipt } from '../contracts/setup_installation_delivery';
import { isSetupBatchInstallationReceipt } from './setup_batch_policy';

export const SETUP_INSTALLATION_MANIFEST_PATH = '.copilot/setup-manifest.json';

/** Shared formatter; callers decide whether an absent baseline is supported. */
export function setupInstallationFiles(files: readonly SetupBatchFile[], manifest: unknown,
  installation: SetupInstallationReceipt): readonly SetupBatchFile[] {
  if (!isSetupBatchInstallationReceipt(installation) || !manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Invalid Setup installation receipt or manifest.');
  }
  return [...files.filter(file => file.path !== SETUP_INSTALLATION_MANIFEST_PATH), {
    path: SETUP_INSTALLATION_MANIFEST_PATH,
    content: `${JSON.stringify({ ...manifest, installation }, null, 2)}\n`,
  }];
}
