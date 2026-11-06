import { vi } from 'vitest';
import { NativeSessionVault, NAMED_SESSIONS_KEY } from '../../src/application/native_session_vault.ts';
import { memoryStore } from './runtime.ts';
import { purposeVault } from './credential_roles.ts';

export function nativeSessionVaultFixture(present = true) {
    const h = memoryStore(); const protection = vi.fn(async () => true); const owner = new NativeSessionVault(h.port, protection);
    if (present) h.values.set(NAMED_SESSIONS_KEY, purposeVault());
    const current = vi.fn(() => true);
    return { ...h, owner, protection, current, proposed: { ...purposeVault(), revision: 5 }, read: () => owner.read() };
}
