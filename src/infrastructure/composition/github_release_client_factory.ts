import { OctokitReleaseClientAdapter } from "../github/octokit_release_adapters";
export const createReleaseClient = () => new OctokitReleaseClientAdapter();
