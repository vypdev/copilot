import { createOrganizationMembersClient } from './github_identity_client_factory';
import { OrganizationMembersRepository } from "../../data/repository/organization/organization_members_repository";

export function createOrganizationMembersCompositionRoot(): OrganizationMembersRepository {
    return new OrganizationMembersRepository(createOrganizationMembersClient());
}
