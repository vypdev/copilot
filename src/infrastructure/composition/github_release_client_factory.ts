import { OctokitReleaseClientAdapter, OctokitRepositoryVersionTagsClientAdapter } from "../github/octokit_release_adapters";
export const createReleaseClient = () => new OctokitReleaseClientAdapter();
export const createRepositoryVersionTagsClient = () => new OctokitRepositoryVersionTagsClientAdapter();
