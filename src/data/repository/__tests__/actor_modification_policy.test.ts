import { authorizationForFileModification } from '../actor_modification_policy';

describe('authorizationForFileModification', () => {
    it('requires organization membership for organization owners', () => {
        expect(authorizationForFileModification('acme', 'alice', 'Organization')).toEqual({
            kind: 'organization-membership', organization: 'acme', actor: 'alice',
        });
    });

    it('allows only the owner for user-owned repositories', () => {
        expect(authorizationForFileModification('alice', 'alice', 'User')).toEqual({ kind: 'owner', allowed: true });
        expect(authorizationForFileModification('alice', 'bob', 'User')).toEqual({ kind: 'owner', allowed: false });
    });
});
