import {
    renderSetupTokenPermissionReport,
    renderSetupTokenPermissionRequirements,
} from '../setup_token_permission_presenter';
import type { SetupTokenPermissionRequirement } from '../../domain/setup_token_permissions';

const metadata: SetupTokenPermissionRequirement = {
    id: 'setup.repository.metadata', role: 'setup', scope: 'repository', permission: 'Metadata',
    level: 'read', applicability: 'required', reason: 'Resolve repository identity.', probe: 'metadata',
};
const secrets: SetupTokenPermissionRequirement = {
    id: 'setup.repository.secrets', role: 'setup', scope: 'repository', permission: 'Secrets',
    level: 'write', applicability: 'conditional', condition: 'Secret provisioning enabled',
    reason: 'Provision Actions Secrets.', probe: 'secrets',
};

describe('setup token permission presenter', () => {
    it('renders the requirement matrix before setup PAT input', () => {
        const output = renderSetupTokenPermissionRequirements('setup', [metadata, secrets], 120);
        expect(output).toContain('Setup PAT permissions required');
        expect(output).toContain('Permission');
        expect(output).toContain('Metadata');
        expect(output).toContain('Secret provisioning enabled');
    });

    it('renders verified, missing, and unverifiable states with text and symbols', () => {
        const output = renderSetupTokenPermissionReport({
            role: 'workflow', identityStatus: 'valid', identityMessage: 'ok', ready: false,
            checks: [
                { ...metadata, role: 'workflow', status: 'verified', message: 'available' },
                { ...secrets, role: 'workflow', applicability: 'required', status: 'missing', message: 'denied' },
                { ...metadata, id: 'workflow.repository.contents', role: 'workflow', permission: 'Contents', status: 'unverifiable', message: 'unknown' },
            ],
        }, 120);
        expect(output).toContain('✅ Verified');
        expect(output).toContain('❌ Missing');
        expect(output).toContain('? Unverifiable');
        expect(output).toContain('Action required');
    });

    it('uses a stacked readable layout at narrow terminal widths', () => {
        const output = renderSetupTokenPermissionRequirements('workflow', [metadata, secrets], 40);
        expect(output).toContain('Metadata (repository) — Read —');
        expect(output).toContain('Required');
        expect(output).toContain('Provision Actions');
        expect(output.split('\n').every(line => line.length <= 42)).toBe(true);
    });

    it('never renders a token value from permission-safe models', () => {
        const output = renderSetupTokenPermissionReport({
            role: 'setup', account: 'operator', identityStatus: 'valid', identityMessage: 'verified', ready: true,
            checks: [{ ...metadata, status: 'verified', message: 'available' }],
        }, 80);
        expect(output).not.toContain('github_pat_');
        expect(output).toContain('All safely verifiable required permissions are available.');
    });
});
