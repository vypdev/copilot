import { vi } from 'vitest';
import { PurposeIdentityVerifier } from '../../src/application/purpose_identity_verifier.ts';
import { sessionHarness } from './runtime.ts';
import { purposeEntry } from './credential_roles.ts';

export function purposeIdentityFixture() {
    const h = sessionHarness(); const verifier = new PurposeIdentityVerifier(h.scheduler, h.ports); const current = vi.fn(() => true);
    const entry = purposeEntry('issues-write');
    return { ...h, verifier, current, entry, verify: () => verifier.verify('issues-write', entry.connection.secret, entry.connection.repository, current) };
}
