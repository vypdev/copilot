import { OctokitReleaseClientAdapter } from "../../../infrastructure/github/octokit_release_adapters";
import { RepositoryDefaultBranchRepository } from "./repository_default_branch_repository";
import { RepositoryReleasePublicationRepository } from "./repository_release_publication_repository";
import { RepositoryTagRepository } from "./repository_tag_repository";

const mockGetRef = jest.fn();
const mockCreateRef = jest.fn();
const mockGetRepo = jest.fn();
const mockCreateRelease = jest.fn();

jest.mock("@actions/github", () => ({
    getOctokit: jest.fn(() => ({
        rest: {
            git: {
                getRef: (...args: unknown[]) => mockGetRef(...args),
                createRef: (...args: unknown[]) => mockCreateRef(...args),
                updateRef: jest.fn(),
            },
            repos: {
                get: (...args: unknown[]) => mockGetRepo(...args),
                createRelease: (...args: unknown[]) => mockCreateRelease(...args),
            },
        },
    })),
}));

jest.mock("../../../utils/logger", () => ({
    logDebugInfo: jest.fn(),
    logError: jest.fn(),
    logInfo: jest.fn(),
}));

describe("Project release capability repositories", () => {
    const defaultBranchRepository = new RepositoryDefaultBranchRepository(new OctokitReleaseClientAdapter());
    const releaseRepository = new RepositoryReleasePublicationRepository(new OctokitReleaseClientAdapter());
    const tagRepository = new RepositoryTagRepository(new OctokitReleaseClientAdapter());

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns the default branch through the repository metadata capability", async () => {
        mockGetRepo.mockResolvedValue({ data: { default_branch: "main" } });

        await expect(defaultBranchRepository.getDefaultBranch("owner", "repo", "token")).resolves.toBe("main");
        expect(mockGetRepo).toHaveBeenCalledWith({ owner: "owner", repo: "repo" });
    });

    it("does not create an existing tag", async () => {
        mockGetRef.mockResolvedValue({ data: { object: { sha: "existing-sha" } } });

        await expect(tagRepository.createTag("owner", "repo", "main", "v1.0.0", "token")).resolves.toBe("existing-sha");
        expect(mockCreateRef).not.toHaveBeenCalled();
    });

    it("creates a tag from the branch ref when it does not exist", async () => {
        mockGetRef
            .mockRejectedValueOnce(new Error("not found"))
            .mockResolvedValueOnce({ data: { object: { sha: "branch-sha" } } });
        mockCreateRef.mockResolvedValue(undefined);

        await expect(tagRepository.createTag("owner", "repo", "main", "v1.0.0", "token")).resolves.toBe("branch-sha");
        expect(mockCreateRef).toHaveBeenCalledWith({
            owner: "owner",
            repo: "repo",
            ref: "refs/tags/v1.0.0",
            sha: "branch-sha",
        });
    });

    it("maps release creation to the release capability result", async () => {
        mockCreateRelease.mockResolvedValue({ data: { html_url: "https://github.com/owner/repo/releases/tag/v1.0.0" } });

        await expect(releaseRepository.createRelease("owner", "repo", "v1.0.0", "Release", "Changes", "token"))
            .resolves.toBe("https://github.com/owner/repo/releases/tag/v1.0.0");
        expect(mockCreateRelease).toHaveBeenCalledWith({
            owner: "owner",
            repo: "repo",
            tag_name: "v1.0.0",
            name: "v1.0.0 - Release",
            body: "Changes",
            draft: false,
            prerelease: false,
        });
    });
});
