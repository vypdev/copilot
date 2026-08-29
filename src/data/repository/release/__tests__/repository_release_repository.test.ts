import { OctokitReleaseClientAdapter } from "../../../../infrastructure/github/octokit_release_adapters";
import { RepositoryDefaultBranchRepository } from "../repository_default_branch_repository";
import { RepositoryReleasePublicationRepository } from "../repository_release_publication_repository";
import { RepositoryTagRepository } from "../repository_tag_repository";

const mockGetRef = jest.fn();
const mockCreateRef = jest.fn();
const mockUpdateRef = jest.fn();
const mockGetRepo = jest.fn();
const mockCreateRelease = jest.fn();
const mockGetReleaseByTag = jest.fn();
const mockListReleases = jest.fn();
const mockUpdateRelease = jest.fn();

jest.mock("@actions/github", () => ({
    getOctokit: jest.fn(() => ({
        rest: {
            git: {
                getRef: (...args: unknown[]) => mockGetRef(...args),
                createRef: (...args: unknown[]) => mockCreateRef(...args),
                updateRef: (...args: unknown[]) => mockUpdateRef(...args),
            },
            repos: {
                get: (...args: unknown[]) => mockGetRepo(...args),
                createRelease: (...args: unknown[]) => mockCreateRelease(...args),
                getReleaseByTag: (...args: unknown[]) => mockGetReleaseByTag(...args),
                listReleases: (...args: unknown[]) => mockListReleases(...args),
                updateRelease: (...args: unknown[]) => mockUpdateRelease(...args),
            },
        },
    })),
}));

jest.mock("../../../../utils/logger", () => ({
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

    it("propagates default branch lookup failures", async () => {
        mockGetRepo.mockRejectedValueOnce(new Error("repository access denied"));

        await expect(defaultBranchRepository.getDefaultBranch("owner", "repo", "token"))
            .rejects.toThrow("repository access denied");
    });

    it("does not create an existing tag", async () => {
        mockGetRef.mockResolvedValue({ data: { object: { sha: "existing-sha" } } });

        await expect(tagRepository.createTag("owner", "repo", "main", "v1.0.0", "token")).resolves.toBe("existing-sha");
        expect(mockCreateRef).not.toHaveBeenCalled();
    });

    it("creates a tag from the branch ref when it does not exist", async () => {
        mockGetRef
            .mockRejectedValueOnce({ status: 404 })
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

    it("does not treat authorization failures as a missing tag", async () => {
        mockGetRef.mockRejectedValue({ status: 403, message: "forbidden" });

        await expect(tagRepository.createTag("owner", "repo", "main", "v1.0.0", "token")).rejects.toMatchObject({ status: 403 });
        expect(mockCreateRef).not.toHaveBeenCalled();
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

    it("reads every release page when updating a release", async () => {
        mockGetReleaseByTag.mockResolvedValue({
            data: { name: "Source", body: "Changes", draft: false, prerelease: false },
        });
        mockListReleases
            .mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, id) => ({ id, tag_name: `other-${id}` })) })
            .mockResolvedValueOnce({ data: [{ id: 101, tag_name: "v2.0.0" }] });
        mockUpdateRelease.mockResolvedValue({});

        await expect(releaseRepository.updateRelease("owner", "repo", "v1.0.0", "v2.0.0", "token"))
            .resolves.toBe("101");
        expect(mockListReleases).toHaveBeenNthCalledWith(2, { owner: "owner", repo: "repo", per_page: 100, page: 2 });
        expect(mockUpdateRelease).toHaveBeenCalledWith(expect.objectContaining({ release_id: 101 }));
    });
});
