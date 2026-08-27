import { createActorAuthorizationClient } from './github_identity_client_factory';
import { ActorAuthorizationRepository } from '../../data/repository/organization/actor_authorization_repository';

export function createActorAuthorizationRepository(): ActorAuthorizationRepository {
    return new ActorAuthorizationRepository(createActorAuthorizationClient());
}
