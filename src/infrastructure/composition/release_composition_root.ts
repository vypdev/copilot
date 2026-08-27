import { createReleaseClient } from './github_release_client_factory';
import type { RepositoryReleasePublicationPort } from "../../application/ports/repository_release_ports";
import { RepositoryReleasePublicationRepository } from "../../data/repository/release/repository_release_publication_repository";

export function createRepositoryReleasePort(): RepositoryReleasePublicationPort {
    return new RepositoryReleasePublicationRepository(createReleaseClient());
}
