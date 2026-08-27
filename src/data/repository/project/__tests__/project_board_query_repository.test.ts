import type { GithubClientPort } from "../../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../../infrastructure/github/ports/github_graphql_transport_port";
import type {
  GithubOwnerTypeClient,
  GithubRepositoryContextClient,
} from "../../../../infrastructure/github/ports/github_identity_provider_ports";
import { ProjectDetail } from "../../../model/project_detail";
import { ProjectBoardQueryRepository } from "../project_board_query_repository";

jest.mock("../../../../utils/logger", () => ({
  logDebugInfo: jest.fn(),
  logError: jest.fn(),
}));

type ProjectItem = { id: string; content?: { id?: string } };
type ItemPage = {
  nodes: ProjectItem[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

const terminalPage = (nodes: ProjectItem[]): ItemPage => ({
  nodes,
  pageInfo: { hasNextPage: false, endCursor: null },
});

interface HarnessOptions {
  owner?: string;
  ownerType?: string;
  ownerError?: unknown;
  projectData?: { id: string; title: string; url: string } | null;
  projectError?: unknown;
  contentId?: string;
  contentMissing?: boolean;
  itemPages?: ItemPage[];
  projectNode?: "present" | "null";
  itemConnection?: "present" | "missing";
}

function createHarness(options: HarnessOptions = {}) {
  const owner = options.owner ?? "owner";
  const repositoryContext = { context: { repo: { owner } } };
  const repositoryContextClient: GithubClientPort<GithubRepositoryContextClient> =
    {
      getClient: jest.fn().mockReturnValue(repositoryContext),
    };
  const getByUsername = options.ownerError
    ? jest.fn().mockRejectedValue(options.ownerError)
    : jest.fn().mockResolvedValue({
        data: { type: options.ownerType ?? "Organization" },
      });
  const ownerTypeProvider = { rest: { users: { getByUsername } } };
  const ownerTypeClient: GithubClientPort<GithubOwnerTypeClient> = {
    getClient: jest.fn().mockReturnValue(ownerTypeProvider),
  };
  const pages = options.itemPages ?? [
    terminalPage([{ id: "PVTI_item", content: { id: "CONTENT_1" } }]),
  ];
  const pageForCursor = (cursor: unknown): ItemPage => {
    if (cursor === null || cursor === undefined) return pages[0];
    return pages[Number(String(cursor).replace("cursor-", ""))];
  };
  const graphql = jest.fn(
    async (document: string, variables?: Record<string, unknown>) => {
      if (document.includes("projectV2(number:")) {
        if (options.projectError) throw options.projectError;
        const projectData =
          options.projectData === undefined
            ? {
                id: "PVT_project",
                title: "Board",
                url:
                  options.ownerType === "User"
                    ? "https://github.com/users/owner/projects/1"
                    : "https://github.com/orgs/owner/projects/1",
              }
            : options.projectData;
        return options.ownerType === "User"
          ? { user: { projectV2: projectData } }
          : { organization: { projectV2: projectData } };
      }
      if (document.includes("issueOrPullRequest(number:")) {
        return {
          repository: options.contentMissing
            ? { issueOrPullRequest: null }
            : { issueOrPullRequest: { id: options.contentId ?? "CONTENT_1" } },
        };
      }
      return {
        node:
          options.projectNode === "null"
            ? null
            : {
                items:
                  options.itemConnection === "missing"
                    ? undefined
                    : pageForCursor(variables?.cursor ?? variables?.after),
              },
      };
    },
  );
  const graphqlTransport: GithubGraphqlTransportClient = {
    graphql: graphql as unknown as GithubGraphqlTransportClient["graphql"],
  };
  const graphqlClient: GithubClientPort<GithubGraphqlTransportClient> = {
    getClient: jest.fn().mockReturnValue(graphqlTransport),
  };

  return {
    getByUsername,
    graphql,
    graphqlClient,
    ownerTypeClient,
    repositoryContextClient,
    repository: new ProjectBoardQueryRepository(
      repositoryContextClient,
      ownerTypeClient,
      graphqlClient,
    ),
  };
}

const project = new ProjectDetail({
  id: "PVT_project",
  title: "Board",
  url: "https://github.com/orgs/owner/projects/1",
  type: "organization",
  owner: "owner",
  number: 1,
});

describe("ProjectBoardQueryRepository", () => {
  it.each(["", "0", "-1", "1abc", "1.5"])(
    "rejects invalid project number %j before resolving provider clients",
    async (projectId) => {
      const harness = createHarness();

      await expect(
        harness.repository.getProjectDetail(projectId, "token"),
      ).rejects.toThrow(
        `Invalid project ID: ${projectId}. Must be a positive integer.`,
      );
      expect(harness.repositoryContextClient.getClient).not.toHaveBeenCalled();
      expect(harness.ownerTypeClient.getClient).not.toHaveBeenCalled();
      expect(harness.graphqlClient.getClient).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      "Organization",
      "organization",
      "https://github.com/orgs/owner/projects/1",
    ],
    ["User", "user", "https://github.com/users/owner/projects/1"],
  ])(
    "loads a project owned by a %s",
    async (ownerType, expectedType, expectedUrl) => {
      const harness = createHarness({ ownerType });

      await expect(
        harness.repository.getProjectDetail("1", "token"),
      ).resolves.toMatchObject({
        id: "PVT_project",
        title: "Board",
        type: expectedType,
        owner: "owner",
        url: expectedUrl,
        number: 1,
      });
      expect(harness.getByUsername).toHaveBeenCalledWith({ username: "owner" });
    },
  );

  it("preserves owner lookup failure context", async () => {
    const harness = createHarness({ ownerError: new Error("forbidden") });

    await expect(
      harness.repository.getProjectDetail("1", "token"),
    ).rejects.toThrow("Failed to get owner information: forbidden");
  });

  it("normalizes non-Error owner lookup failures", async () => {
    const harness = createHarness({ ownerError: "forbidden" });

    await expect(
      harness.repository.getProjectDetail("1", "token"),
    ).rejects.toThrow("Failed to get owner information: forbidden");
  });

  it("rejects an unsupported owner type before querying a project", async () => {
    const harness = createHarness({ ownerType: "Enterprise" });

    await expect(
      harness.repository.getProjectDetail("1", "token"),
    ).rejects.toThrow(
      "Unsupported GitHub owner type 'Enterprise' for owner owner.",
    );
    expect(harness.graphql).not.toHaveBeenCalled();
  });

  it("preserves project query failure context", async () => {
    const harness = createHarness({
      projectError: new Error("network unavailable"),
    });

    await expect(
      harness.repository.getProjectDetail("1", "token"),
    ).rejects.toThrow("Failed to fetch project data: network unavailable");
  });

  it("rejects a project absent from the resolved owner", async () => {
    const harness = createHarness({ projectData: null });

    await expect(
      harness.repository.getProjectDetail("1", "token"),
    ).rejects.toThrow(
      "Project not found: https://github.com/orgs/owner/projects/1",
    );
  });

  it("resolves each token-bound provider once while loading project details", async () => {
    const harness = createHarness();

    await harness.repository.getProjectDetail("1", "token");

    expect(harness.repositoryContextClient.getClient).toHaveBeenCalledTimes(1);
    expect(harness.ownerTypeClient.getClient).toHaveBeenCalledTimes(1);
    expect(harness.graphqlClient.getClient).toHaveBeenCalledTimes(1);
  });

  it("returns undefined without scanning the board when repository content is absent", async () => {
    const harness = createHarness({ contentMissing: true });

    await expect(
      harness.repository.getProjectItemId(
        project,
        "owner",
        "repo",
        42,
        "token",
      ),
    ).resolves.toBeUndefined();
    expect(harness.graphql).toHaveBeenCalledTimes(1);
  });

  it("returns the project item ID from the first page", async () => {
    const harness = createHarness();

    await expect(
      harness.repository.getProjectItemId(
        project,
        "owner",
        "repo",
        42,
        "token",
      ),
    ).resolves.toBe("PVTI_item");
  });

  it("returns the project item ID from a later page", async () => {
    const harness = createHarness({
      itemPages: [
        { nodes: [], pageInfo: { hasNextPage: true, endCursor: "cursor-1" } },
        terminalPage([{ id: "PVTI_item", content: { id: "CONTENT_1" } }]),
      ],
    });

    await expect(
      harness.repository.getProjectItemId(
        project,
        "owner",
        "repo",
        42,
        "token",
      ),
    ).resolves.toBe("PVTI_item");
  });

  it("finds content beyond the generic 100-page pagination boundary", async () => {
    const itemPages = Array.from({ length: 101 }, (_, index) =>
      index === 100
        ? terminalPage([{ id: "PVTI_item", content: { id: "CONTENT_1" } }])
        : {
            nodes: [],
            pageInfo: {
              hasNextPage: true,
              endCursor: `cursor-${index + 1}`,
            },
          },
    );
    const harness = createHarness({ itemPages });

    await expect(
      harness.repository.isContentLinked(project, "CONTENT_1", "token"),
    ).resolves.toBe(true);
  });

  it("rejects when repository content is not linked after all project pages", async () => {
    const harness = createHarness({ itemPages: [terminalPage([])] });

    await expect(
      harness.repository.getProjectItemId(
        project,
        "owner",
        "repo",
        42,
        "token",
      ),
    ).rejects.toThrow(
      "Issue or pull request #42 is not in project PVT_project.",
    );
  });

  it("fails closed on an invalid project item cursor", async () => {
    const harness = createHarness({
      itemPages: [
        { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } },
      ],
    });

    await expect(
      harness.repository.getProjectItemId(
        project,
        "owner",
        "repo",
        42,
        "token",
      ),
    ).rejects.toThrow(
      "project board content: hasNextPage is true but endCursor is null (page 1).",
    );
  });

  it("reports a null project node while resolving board content", async () => {
    const harness = createHarness({ projectNode: "null" });

    await expect(
      harness.repository.getProjectItemId(
        project,
        "owner",
        "repo",
        42,
        "token",
      ),
    ).rejects.toThrow(
      "Project PVT_project was not found while reading project items.",
    );
  });

  it("reports linked content on the first or a later page", async () => {
    const firstPage = createHarness();
    const laterPage = createHarness({
      itemPages: [
        { nodes: [], pageInfo: { hasNextPage: true, endCursor: "cursor-1" } },
        terminalPage([{ id: "PVTI_item", content: { id: "CONTENT_1" } }]),
      ],
    });

    await expect(
      firstPage.repository.isContentLinked(project, "CONTENT_1", "token"),
    ).resolves.toBe(true);
    await expect(
      laterPage.repository.isContentLinked(project, "CONTENT_1", "token"),
    ).resolves.toBe(true);
  });

  it("returns false when content is absent after all pages", async () => {
    const harness = createHarness({ itemPages: [terminalPage([])] });

    await expect(
      harness.repository.isContentLinked(project, "CONTENT_1", "token"),
    ).resolves.toBe(false);
  });

  it("treats an omitted project items connection as an empty board", async () => {
    const harness = createHarness({ itemConnection: "missing" });

    await expect(
      harness.repository.isContentLinked(project, "CONTENT_1", "token"),
    ).resolves.toBe(false);
  });

  it("fails closed on malformed linked-content pagination and null projects", async () => {
    const malformed = createHarness({
      itemPages: [
        { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } },
      ],
    });
    const nullProject = createHarness({ projectNode: "null" });

    await expect(
      malformed.repository.isContentLinked(project, "CONTENT_1", "token"),
    ).rejects.toThrow(
      "project board content: hasNextPage is true but endCursor is null (page 1).",
    );
    await expect(
      nullProject.repository.isContentLinked(project, "CONTENT_1", "token"),
    ).rejects.toThrow(
      "Project PVT_project was not found while reading project items.",
    );
  });

  it("resolves the token-bound GraphQL client once per content query", async () => {
    const harness = createHarness();

    await harness.repository.getProjectItemId(
      project,
      "owner",
      "repo",
      42,
      "token",
    );

    expect(harness.graphqlClient.getClient).toHaveBeenCalledTimes(1);
  });
});
