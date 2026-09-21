import {
    authorizationForFileModification,
    authorizationForMemberOnlyAutomation,
} from '../actor_modification_policy';

describe('authorizationForFileModification', () => {
    it('requires repository write permission for organization-owned file changes', () => {
        expect(authorizationForFileModification('acme', 'alice', 'Organization')).toEqual({
            kind: 'repository-collaborator', owner: 'acme', actor: 'alice', ownerMatches: false,
        });
    });

    it('identifies the owner and collaborators for user-owned repositories', () => {
        expect(authorizationForFileModification('alice', 'alice', 'User')).toEqual({
            kind: 'repository-collaborator', owner: 'alice', actor: 'alice', ownerMatches: true,
        });
        expect(authorizationForFileModification('alice', 'bob', 'User')).toEqual({
            kind: 'repository-collaborator', owner: 'alice', actor: 'bob', ownerMatches: false,
        });
    });

    it('keeps member-only organization authorization distinct from file modification', () => {
        expect(authorizationForMemberOnlyAutomation('acme', 'alice', 'Organization')).toEqual({
            kind: 'organization-membership', organization: 'acme', actor: 'alice',
        });
        expect(authorizationForMemberOnlyAutomation('alice', 'bob', 'User')).toEqual({
            kind: 'user-repository-collaborator', owner: 'alice', actor: 'bob', ownerMatches: false,
        });
    });
});
