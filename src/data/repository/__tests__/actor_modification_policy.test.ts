import { authorizationForFileModification } from '../actor_modification_policy';

describe('authorizationForFileModification', () => {
    it('requires organization membership for organization owners', () => {
        expect(authorizationForFileModification('acme', 'alice', 'Organization')).toEqual({
            kind: 'organization-membership', organization: 'acme', actor: 'alice',
        });
    });

    it('identifies the owner and collaborators for user-owned repositories', () => {
        expect(authorizationForFileModification('alice', 'alice', 'User')).toEqual({
            kind: 'user-repository-collaborator', owner: 'alice', actor: 'alice', ownerMatches: true,
        });
        expect(authorizationForFileModification('alice', 'bob', 'User')).toEqual({
            kind: 'user-repository-collaborator', owner: 'alice', actor: 'bob', ownerMatches: false,
        });
    });
});
