import type { ProjectBoardContentQueryPort } from "../../../../application/ports/project_board_query_ports";
import type { GithubClientPort } from "../../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../../infrastructure/github/ports/github_graphql_transport_port";
import { ProjectDetail } from "../../../model/project_detail";
import { ProjectBoardCommandRepository } from "../project_board_command_repository";

jest.mock("../../../../utils/logger", () => ({
  logDebugInfo: jest.fn(),
  logError: jest.fn(),
}));

type FieldNode = {
  id: string;
  name: string;
  options?: Array<{ id: string; name: string }>;
};
type ItemNode = {
  id: string;
  fieldValues?: {
    nodes: Array<{ field?: { name: string }; optionId?: string }>;
  };
};
type Page<T> = {
  nodes: T[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

const terminalPage = <T>(nodes: T[]): Page<T> => ({
  nodes,
  pageInfo: { hasNextPage: false, endCursor: null },
});

const statusField: FieldNode = {
  id: "PVTSSF_status",
  name: "Status",
  options: [
    { id: "option_todo", name: "Todo" },
    { id: "option_in_progress", name: "In progress" },
  ],
};

const priorityField: FieldNode = {
  id: "PVTSSF_priority",
  name: "Priority",
  options: [{ id: "option_high", name: "High" }],
};

const sizeField: FieldNode = {
  id: "PVTSSF_size",
  name: "Size",
  options: [{ id: "option_medium", name: "M" }],
};

const projectItem = (
  fieldName = "Status",
  optionId = "option_todo",
): ItemNode => ({
  id: "PVTI_item",
  fieldValues: { nodes: [{ field: { name: fieldName }, optionId }] },
});

interface HarnessOptions {
  contentId?: string;
  fieldPages?: Page<FieldNode>[];
  itemPages?: Page<ItemNode>[];
  fieldNode?: "present" | "null";
  itemNode?: "present" | "null";
  fieldConnection?: "present" | "missing";
  itemConnection?: "present" | "missing";
  mutationItemId?: string;
}

function createHarness(options: HarnessOptions = {}) {
  const contentQuery: jest.Mocked<ProjectBoardContentQueryPort> = {
    getProjectItemId: jest
      .fn()
      .mockResolvedValue(
        options.contentId === undefined ? "PVTI_item" : options.contentId,
      ),
  };
  const fieldPages = options.fieldPages ?? [terminalPage([statusField])];
  const itemPages = options.itemPages ?? [terminalPage([projectItem()])];

  const pageForCursor = <T>(pages: Page<T>[], cursor: unknown): Page<T> => {
    if (cursor === null || cursor === undefined) return pages[0];
    const index = Number(String(cursor).replace("cursor-", ""));
    return pages[index];
  };

  const graphql = jest.fn(
    async (document: string, variables?: Record<string, unknown>) => {
      if (document.includes("mutation(")) {
        return options.mutationItemId === undefined
          ? {
              updateProjectV2ItemFieldValue: {
                projectV2Item: { id: "PVTI_item" },
              },
            }
          : options.mutationItemId
            ? {
                updateProjectV2ItemFieldValue: {
                  projectV2Item: { id: options.mutationItemId },
                },
              }
            : { updateProjectV2ItemFieldValue: null };
      }

      if (document.includes("fields(first")) {
        return {
          node:
            options.fieldNode === "null"
              ? null
              : {
                  fields:
                    options.fieldConnection === "missing"
                      ? undefined
                      : pageForCursor(fieldPages, variables?.after),
                },
        };
      }
      return {
        node:
          options.itemNode === "null"
            ? null
            : {
                items:
                  options.itemConnection === "missing"
                    ? undefined
                    : pageForCursor(itemPages, variables?.after),
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
    contentQuery,
    graphql,
    graphqlClient,
    repository: new ProjectBoardCommandRepository(contentQuery, graphqlClient),
  };
}

describe("ProjectBoardCommandRepository", () => {
  const project = new ProjectDetail({
    id: "PVT_project",
    title: "Board",
    url: "https://github.com/orgs/owner/projects/1",
    type: "organization",
    owner: "owner",
    number: 1,
  });

  it("rejects a missing content ID before resolving a GraphQL client", async () => {
    const harness = createHarness({ contentId: "" });

    await expect(
      harness.repository.moveIssueToColumn(
        project,
        "owner",
        "repo",
        42,
        "In progress",
        "token",
      ),
    ).rejects.toThrow("Content ID not found for issue or pull request #42.");
    expect(harness.graphqlClient.getClient).not.toHaveBeenCalled();
    expect(harness.graphql).not.toHaveBeenCalled();
  });

  it("rejects a missing single-select field without mutating", async () => {
    const harness = createHarness({ fieldPages: [terminalPage([])] });

    await expect(
      harness.repository.moveIssueToColumn(
        project,
        "owner",
        "repo",
        42,
        "In progress",
        "token",
      ),
    ).rejects.toThrow(
      "Field 'Status' not found or is not a single-select field.",
    );
    expect(
      harness.graphql.mock.calls.some(([document]) =>
        String(document).includes("mutation("),
      ),
    ).toBe(false);
  });

  it("treats an omitted fields connection as an empty catalog", async () => {
    const harness = createHarness({ fieldConnection: "missing" });

    await expect(
      harness.repository.moveIssueToColumn(
        project,
        "owner",
        "repo",
        42,
        "In progress",
        "token",
      ),
    ).rejects.toThrow(
      "Field 'Status' not found or is not a single-select field.",
    );
  });

  it("rejects a same-name field that is not single-select", async () => {
    const harness = createHarness({
      fieldPages: [terminalPage([{ id: "PVTF_text", name: "Status" }])],
    });

    await expect(
      harness.repository.moveIssueToColumn(
        project,
        "owner",
        "repo",
        42,
        "In progress",
        "token",
      ),
    ).rejects.toThrow(
      "Field 'Status' not found or is not a single-select field.",
    );
  });

  it("rejects a missing field option without mutating", async () => {
    const harness = createHarness();

    await expect(
      harness.repository.moveIssueToColumn(
        project,
        "owner",
        "repo",
        42,
        "Blocked",
        "token",
      ),
    ).rejects.toThrow("Option 'Blocked' not found for field 'Status'.");
    expect(
      harness.graphql.mock.calls.some(([document]) =>
        String(document).includes("mutation("),
      ),
    ).toBe(false);
  });

  it("returns false without mutating when the option is already selected", async () => {
    const harness = createHarness({
      itemPages: [terminalPage([projectItem("Status", "option_in_progress")])],
    });

    await expect(
      harness.repository.moveIssueToColumn(
        project,
        "owner",
        "repo",
        42,
        "In progress",
        "token",
      ),
    ).resolves.toBe(false);
    expect(
      harness.graphql.mock.calls.some(([document]) =>
        String(document).includes("mutation("),
      ),
    ).toBe(false);
  });

  it("updates an item found on the first page with the project item ID", async () => {
    const harness = createHarness();

    await expect(
      harness.repository.moveIssueToColumn(
        project,
        "owner",
        "repo",
        42,
        "In progress",
        "token",
      ),
    ).resolves.toBe(true);
    const mutationCall = harness.graphql.mock.calls.find(([document]) =>
      String(document).includes("mutation("),
    );
    expect(mutationCall?.[1]).toMatchObject({
      projectId: "PVT_project",
      itemId: "PVTI_item",
      fieldId: "PVTSSF_status",
      optionId: "option_in_progress",
    });
  });

  it("finds an item on a later page", async () => {
    const harness = createHarness({
      itemPages: [
        { nodes: [], pageInfo: { hasNextPage: true, endCursor: "cursor-1" } },
        terminalPage([projectItem()]),
      ],
    });

    await expect(
      harness.repository.moveIssueToColumn(
        project,
        "owner",
        "repo",
        42,
        "In progress",
        "token",
      ),
    ).resolves.toBe(true);
    expect(
      harness.graphql.mock.calls.filter(([document]) =>
        String(document).includes("items(first"),
      ),
    ).toHaveLength(2);
  });

  it("finds an item beyond the generic 100-page pagination boundary", async () => {
    const itemPages = Array.from({ length: 101 }, (_, index) =>
      index === 100
        ? terminalPage([projectItem()])
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
      harness.repository.moveIssueToColumn(
        project,
        "owner",
        "repo",
        42,
        "In progress",
        "token",
      ),
    ).resolves.toBe(true);
  });

  it("does not mutate when the project item disappears before the field update", async () => {
    const harness = createHarness({ itemPages: [terminalPage([])] });

    await expect(
      harness.repository.moveIssueToColumn(
        project,
        "owner",
        "repo",
        42,
        "In progress",
        "token",
      ),
    ).rejects.toThrow(
      "Project item PVTI_item was not found while updating field 'Status'.",
    );
    expect(
      harness.graphql.mock.calls.some(([document]) =>
        String(document).includes("mutation("),
      ),
    ).toBe(false);
  });

  it("fails closed when pagination requests another page without a cursor", async () => {
    const harness = createHarness({
      itemPages: [
        { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } },
      ],
    });
    const implementation = harness.graphql.getMockImplementation()!;
    harness.graphql.mockImplementation((...args) => {
      if (harness.graphql.mock.calls.length > 2) {
        throw new Error("unexpected extra request");
      }
      return implementation(...args);
    });

    await expect(
      harness.repository.moveIssueToColumn(
        project,
        "owner",
        "repo",
        42,
        "In progress",
        "token",
      ),
    ).rejects.toThrow(
      "project board items: hasNextPage is true but endCursor is null (page 1).",
    );
  });

  it("paginates fields until the requested field is found", async () => {
    const harness = createHarness({
      fieldPages: [
        { nodes: [], pageInfo: { hasNextPage: true, endCursor: "cursor-1" } },
        terminalPage([statusField]),
      ],
    });

    await expect(
      harness.repository.moveIssueToColumn(
        project,
        "owner",
        "repo",
        42,
        "In progress",
        "token",
      ),
    ).resolves.toBe(true);
    expect(
      harness.graphql.mock.calls.filter(([document]) =>
        String(document).includes("fields(first"),
      ),
    ).toHaveLength(2);
  });

  it("reports a null project node as a semantic provider error", async () => {
    const harness = createHarness({ fieldNode: "null" });

    await expect(
      harness.repository.moveIssueToColumn(
        project,
        "owner",
        "repo",
        42,
        "In progress",
        "token",
      ),
    ).rejects.toThrow(
      "Project PVT_project was not found while reading single-select fields.",
    );
  });

  it("reports a null project node while reading project items", async () => {
    const harness = createHarness({ itemNode: "null" });

    await expect(
      harness.repository.moveIssueToColumn(
        project,
        "owner",
        "repo",
        42,
        "In progress",
        "token",
      ),
    ).rejects.toThrow(
      "Project PVT_project was not found while reading project items.",
    );
  });

  it("treats an omitted items connection as an empty board", async () => {
    const harness = createHarness({ itemConnection: "missing" });

    await expect(
      harness.repository.moveIssueToColumn(
        project,
        "owner",
        "repo",
        42,
        "In progress",
        "token",
      ),
    ).rejects.toThrow(
      "Project item PVTI_item was not found while updating field 'Status'.",
    );
  });

  it("returns false when the mutation does not return a project item", async () => {
    const harness = createHarness({ mutationItemId: "" });

    await expect(
      harness.repository.moveIssueToColumn(
        project,
        "owner",
        "repo",
        42,
        "In progress",
        "token",
      ),
    ).resolves.toBe(false);
  });

  it.each([
    ["setTaskPriority", priorityField, "High", "Priority", "option_high"],
    ["setTaskSize", sizeField, "M", "Size", "option_medium"],
    [
      "moveIssueToColumn",
      statusField,
      "In progress",
      "Status",
      "option_in_progress",
    ],
  ] as const)(
    "maps %s to its exact semantic field",
    async (method, field, value, fieldName, optionId) => {
      const harness = createHarness({
        fieldPages: [terminalPage([field])],
        itemPages: [terminalPage([projectItem(fieldName)])],
      });

      await expect(
        harness.repository[method](
          project,
          "owner",
          "repo",
          42,
          value,
          "token",
        ),
      ).resolves.toBe(true);
      const mutationCall = harness.graphql.mock.calls.find(([document]) =>
        String(document).includes("mutation("),
      );
      expect(mutationCall?.[1]).toMatchObject({ fieldId: field.id, optionId });
    },
  );

  it("resolves the token-bound GraphQL client once per command", async () => {
    const harness = createHarness();

    await harness.repository.moveIssueToColumn(
      project,
      "owner",
      "repo",
      42,
      "In progress",
      "token",
    );

    expect(harness.graphqlClient.getClient).toHaveBeenCalledTimes(1);
    expect(harness.graphqlClient.getClient).toHaveBeenCalledWith("token");
  });
});
