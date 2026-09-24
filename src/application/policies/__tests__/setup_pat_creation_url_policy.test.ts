import { buildSetupPatCreationUrl, UnsupportedSetupPatLinkError } from '../setup_pat_creation_url_policy';
import type { SetupTokenPermissionRequirement } from '../../../domain/setup_token_permissions';

const permission = (
    role: 'setup' | 'workflow',
    scope: 'repository' | 'organization',
    name: string,
    level: 'read' | 'write',
    applicability: 'required' | 'conditional' = 'required',
): SetupTokenPermissionRequirement => ({
    id: `${role}.${scope}.${name}`, role, scope, permission: name, level, applicability,
    reason: 'test', probe: 'metadata',
});

describe('buildSetupPatCreationUrl', () => {
    it('fills only required setup grants, owner, role, and one-day expiry', () => {
        const url = new URL(buildSetupPatCreationUrl({
            role: 'setup', owner: 'vypdev', repository: 'copilot', expiresIn: 1,
            requirements: [
                permission('setup', 'repository', 'Metadata', 'read'),
                permission('setup', 'repository', 'Contents', 'read'),
                permission('setup', 'repository', 'Secrets', 'write', 'conditional'),
            ],
        }));
        expect(`${url.origin}${url.pathname}`).toBe('https://github.com/settings/personal-access-tokens/new');
        expect(Object.fromEntries(url.searchParams)).toEqual({
            name: 'Copilot setup copilot',
            description: 'Copilot repository setup for vypdev/copilot',
            target_name: 'vypdev', expires_in: '1', contents: 'read', metadata: 'read',
        });
        expect(url.searchParams.has('repository')).toBe(false);
    });

    it('maps repository and organization bot grants without conflating scopes', () => {
        const url = new URL(buildSetupPatCreationUrl({
            role: 'workflow', owner: 'vypdev', repository: 'copilot', expiresIn: 90,
            requirements: [
                permission('workflow', 'repository', 'Variables', 'read'),
                permission('workflow', 'repository', 'Pull requests', 'write'),
                permission('workflow', 'organization', 'Variables', 'read'),
                permission('workflow', 'organization', 'Projects', 'write'),
                permission('workflow', 'organization', 'Members', 'read'),
            ],
        }));
        expect(url.searchParams.get('actions_variables')).toBe('read');
        expect(url.searchParams.get('organization_actions_variables')).toBe('read');
        expect(url.searchParams.get('organization_projects')).toBe('write');
        expect(url.searchParams.get('pull_requests')).toBe('write');
        expect(url.searchParams.get('members')).toBe('read');
        expect(url.searchParams.get('expires_in')).toBe('90');
    });

    it('keeps the strongest duplicate grant', () => {
        const url = new URL(buildSetupPatCreationUrl({
            role: 'setup', owner: 'vypdev', repository: 'copilot', expiresIn: 1,
            requirements: [permission('setup', 'repository', 'Contents', 'write'), permission('setup', 'repository', 'Contents', 'read')],
        }));
        expect(url.searchParams.get('contents')).toBe('write');
    });

    it('rejects unsupported Checks instead of producing an incomplete guarded link', () => {
        expect(() => buildSetupPatCreationUrl({
            role: 'workflow', owner: 'vypdev', repository: 'copilot', expiresIn: 90,
            requirements: [permission('workflow', 'repository', 'Checks', 'read')],
        })).toThrow(UnsupportedSetupPatLinkError);
    });

    it.each(['bad/owner', '', 'a'.repeat(40)])('rejects unsafe or invalid owner %s', owner => {
        expect(() => buildSetupPatCreationUrl({ role: 'setup', owner, repository: 'copilot', expiresIn: 1, requirements: [] })).toThrow();
    });

    it.each([0, 367, 1.5])('rejects invalid expiration %s', expiresIn => {
        expect(() => buildSetupPatCreationUrl({ role: 'setup', owner: 'vypdev', repository: 'copilot', expiresIn, requirements: [] })).toThrow();
    });

    it('rejects a mixed-role permission list', () => {
        expect(() => buildSetupPatCreationUrl({
            role: 'setup', owner: 'vypdev', repository: 'copilot', expiresIn: 1,
            requirements: [permission('workflow', 'repository', 'Contents', 'read')],
        })).toThrow('role');
    });
});
