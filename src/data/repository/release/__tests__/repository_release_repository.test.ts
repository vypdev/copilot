import { OctokitReleaseClientAdapter } from "../../../../infrastructure/github/octokit_release_adapters";
import { RepositoryDefaultBranchRepository } from "../repository_default_branch_repository";
import { RepositoryReleasePublicationRepository } from "../repository_release_publication_repository";
import { RepositoryTagRepository } from "../repository_tag_repository";

const mockGetRef = jest.fn();
const mockGetTag = jest.fn();
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
                getTag: (...args: unknown[]) => mockGetTag(...args),
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
        mockGetRef.mockReset();
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

    it("recovers an immutable tag after an uncertain create response", async () => {
        mockGetRef
            .mockRejectedValueOnce({ status: 404 })
            .mockResolvedValueOnce({ data: { object: { sha: "a".repeat(40), type: "commit" } } });
        mockCreateRef.mockRejectedValueOnce(new Error("request timed out"));
        await expect(tagRepository.createOrVerifyTagAtSha(
            "owner", "repo", "a".repeat(40), "v1.0.0", "token",
        )).resolves.toBe("a".repeat(40));
    });

    it("verifies an annotated immutable tag at its commit target", async () => {
        mockGetRef.mockResolvedValueOnce({ data: { object: { sha: "tag-object", type: "tag" } } });
        mockGetTag.mockResolvedValueOnce({ data: { object: { sha: "a".repeat(40), type: "commit" } } });
        await expect(tagRepository.createOrVerifyTagAtSha(
            "owner", "repo", "a".repeat(40), "v1.0.0", "token",
        )).resolves.toBe("a".repeat(40));
    });

    it("updates an existing tag from the source tag", async () => {
        mockGetRef
            .mockResolvedValueOnce({ data: { object: { sha: "source-sha" } } })
            .mockResolvedValueOnce({ data: { object: { sha: "old-target-sha" } } })
            .mockResolvedValueOnce({ data: { object: { sha: "source-sha" } } });
        mockUpdateRef.mockResolvedValue(undefined);

        await tagRepository.updateTag("owner", "repo", "source", "target", "token");

        expect(mockUpdateRef).toHaveBeenCalledWith({
            owner: "owner",
            repo: "repo",
            ref: "tags/target",
            sha: "source-sha",
            force: true,
        });
        expect(mockCreateRef).not.toHaveBeenCalled();
    });

    it("creates the target tag when it does not exist", async () => {
        mockGetRef
            .mockResolvedValueOnce({ data: { object: { sha: "source-sha" } } })
            .mockRejectedValueOnce({ status: 404 })
            .mockResolvedValueOnce({ data: { object: { sha: "source-sha" } } });
        mockCreateRef.mockResolvedValue(undefined);

        await tagRepository.updateTag("owner", "repo", "source", "target", "token");

        expect(mockCreateRef).toHaveBeenCalledWith({
            owner: "owner",
            repo: "repo",
            ref: "refs/tags/target",
            sha: "source-sha",
        });
    });

    it("rejects tag updates when the source tag is missing", async () => {
        mockGetRef.mockRejectedValueOnce({ status: 404 });

        await expect(tagRepository.updateTag("owner", "repo", "source", "target", "token"))
            .rejects.toThrow("does not exist");

        expect(mockUpdateRef).not.toHaveBeenCalled();
        expect(mockCreateRef).not.toHaveBeenCalled();
    });

    it("maps release creation to the release capability result", async () => {
        const marker = '<!-- copilot-deployment-publication operation-id="operation-12345678" production-sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" -->';
        mockGetReleaseByTag
            .mockRejectedValueOnce({ status: 404 })
            .mockResolvedValueOnce({ data: {
                html_url: "https://github.com/owner/repo/releases/tag/v1.0.0",
                tag_name: "v1.0.0",
                name: "v1.0.0 - Release",
                body: `${marker}\nChanges`,
                draft: false,
                prerelease: false,
            } });
        mockCreateRelease.mockResolvedValue({ data: { id: 1, html_url: "https://github.com/owner/repo/releases/tag/v1.0.0" } });

        await expect(releaseRepository.createRelease(
            "owner", "repo", "v1.0.0", "Release", "Changes", "operation-12345678", "a".repeat(40), "token",
        ))
            .resolves.toBe("https://github.com/owner/repo/releases/tag/v1.0.0");
        expect(mockCreateRelease).toHaveBeenCalledWith({
            owner: "owner",
            repo: "repo",
            tag_name: "v1.0.0",
            name: "v1.0.0 - Release",
            body: `${marker}\nChanges`,
            draft: false,
            prerelease: false,
        });
    });

    it("recovers an exact release receipt after an uncertain create response", async () => {
        const body = '<!-- copilot-deployment-publication operation-id="operation-12345678" production-sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" -->\nChanges';
        mockGetReleaseByTag
            .mockRejectedValueOnce({ status: 404 })
            .mockResolvedValueOnce({ data: {
                html_url: "https://github.com/owner/repo/releases/tag/v1.0.0",
                tag_name: "v1.0.0",
                name: "v1.0.0 - Release",
                body,
                draft: false,
                prerelease: false,
            } });
        mockCreateRelease.mockRejectedValueOnce(new Error("request timed out"));
        await expect(releaseRepository.createRelease(
            "owner", "repo", "v1.0.0", "Release", "Changes", "operation-12345678", "a".repeat(40), "token",
        )).resolves.toContain("/v1.0.0");
    });

    it("rejects an existing release with a different operation receipt", async () => {
        mockGetReleaseByTag.mockResolvedValueOnce({ data: {
            html_url: "https://github.com/owner/repo/releases/tag/v1.0.0",
            tag_name: "v1.0.0",
            name: "v1.0.0 - Release",
            body: "Changes",
            draft: false,
            prerelease: false,
        } });
        await expect(releaseRepository.createRelease(
            "owner", "repo", "v1.0.0", "Release", "Changes", "operation-12345678", "a".repeat(40), "token",
        )).rejects.toThrow("conflicting publication content");
        expect(mockCreateRelease).not.toHaveBeenCalled();
    });

    it("verifies tag and GitHub Release as one publication receipt", async () => {
        mockGetRef.mockResolvedValueOnce({ data: { object: { sha: "a".repeat(40), type: "commit" } } });
        mockGetReleaseByTag.mockResolvedValueOnce({ data: {
            html_url: "https://github.com/owner/repo/releases/tag/v1.0.0",
            tag_name: "v1.0.0",
            name: "v1.0.0 - Release",
            body: '<!-- copilot-deployment-publication operation-id="operation-12345678" production-sha="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" -->\nChanges',
            draft: false,
            prerelease: false,
        } });
        await expect(releaseRepository.inspect({
            owner: "owner",
            repository: "repo",
            tag: "v1.0.0",
            operationId: "operation-12345678",
            productionSha: "a".repeat(40),
            token: "token",
        })).resolves.toEqual(expect.objectContaining({ kind: "verified" }));
    });

    it("reads every release page when updating a release", async () => {
        mockGetReleaseByTag
            .mockResolvedValueOnce({ data: { name: "Source", body: "Changes", draft: false, prerelease: false } })
            .mockResolvedValueOnce({ data: { name: "Old", body: "Old", draft: false, prerelease: false } })
            .mockResolvedValueOnce({ data: { name: "Source", body: "Changes", draft: false, prerelease: false } });
        mockListReleases
            .mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, id) => ({ id, tag_name: `other-${id}` })) })
            .mockResolvedValueOnce({ data: [{ id: 101, tag_name: "v2.0.0" }] });
        mockUpdateRelease.mockResolvedValue({});

        await expect(releaseRepository.updateRelease("owner", "repo", "v1.0.0", "v2.0.0", "token"))
            .resolves.toBe("101");
        expect(mockListReleases).toHaveBeenNthCalledWith(2, { owner: "owner", repo: "repo", per_page: 100, page: 2 });
        expect(mockUpdateRelease).toHaveBeenCalledWith(expect.objectContaining({ release_id: 101 }));
    });

    it("creates a target release when updating a release that does not exist", async () => {
        mockGetReleaseByTag
            .mockResolvedValueOnce({ data: { name: "Source", body: "Changes", draft: false, prerelease: true } })
            .mockResolvedValueOnce({ data: { name: "Source", body: "Changes", draft: false, prerelease: true } });
        mockListReleases.mockResolvedValue({ data: [] });
        mockCreateRelease.mockResolvedValue({ data: { id: 202 } });

        await expect(releaseRepository.updateRelease("owner", "repo", "v1.0.0", "v2.0.0", "token"))
            .resolves.toBe("202");
        expect(mockCreateRelease).toHaveBeenCalledWith({
            owner: "owner",
            repo: "repo",
            tag_name: "v2.0.0",
            name: "Source",
            body: "Changes",
            draft: false,
            prerelease: true,
        });
    });

    it("does not rewrite an already matching release alias", async () => {
        const exact = { name: "Source", body: "Changes", draft: false, prerelease: false };
        mockGetReleaseByTag
            .mockResolvedValueOnce({ data: exact })
            .mockResolvedValueOnce({ data: exact })
            .mockResolvedValueOnce({ data: exact });
        mockListReleases.mockResolvedValue({ data: [{ id: 101, tag_name: "v2.0.0" }] });
        await expect(releaseRepository.updateRelease("owner", "repo", "v1.0.0", "v2.0.0", "token"))
            .resolves.toBe("101");
        expect(mockUpdateRelease).not.toHaveBeenCalled();
    });

    it("rejects release updates when the source has no content", async () => {
        mockGetReleaseByTag.mockResolvedValue({ data: { name: "", body: "" } });

        await expect(releaseRepository.updateRelease("owner", "repo", "missing", "target", "token"))
            .resolves.toBeUndefined();
        expect(mockListReleases).not.toHaveBeenCalled();
    });
});
