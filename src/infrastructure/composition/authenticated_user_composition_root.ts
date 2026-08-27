import { createAuthenticatedUserClient } from './github_identity_client_factory';
import { AuthenticatedUserRepository } from "../../data/repository/organization/authenticated_user_repository";

export function createAuthenticatedUserCompositionRoot(): AuthenticatedUserRepository {
    return new AuthenticatedUserRepository(createAuthenticatedUserClient());
}
