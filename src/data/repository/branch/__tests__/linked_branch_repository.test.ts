import type { GithubClientPort } from "../../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubGraphqlTransportClient } from "../../../../infrastructure/github/ports/github_graphql_transport_port";
import { LinkedBranchRepository } from "../linked_branch_repository";

jest.mock("../../../../utils/logger", () => ({
  logDebugInfo: jest.fn(),
  logError: jest.fn(),
  logInfo: jest.fn(),
}));

interface HarnessOptions {
  repository?: {
    id?: string;
    issue?: { id?: string } | null;
    ref?: { target?: { oid?: string } | null } | null;
  } | null;
  mutation?: unknown;
  queryError?: unknown;
  mutationError?: unknown;
}

function createHarness(options: HarnessOptions = {}) {
  const repositoryData =
    options.repository === undefined
      ? {
          id: "R_repo",
          issue: { id: "I_issue" },
          ref: { target: { oid: "base-oid" } },
        }
      : options.repository;
  const mutationData =
    options.mutation === undefined
      ? {
          createLinkedBranch: {
            linkedBranch: {
              id: "LB_branch",
              ref: { name: "bugfix/42-new" },
            },
          },
        }
      : options.mutation;
  const graphql = jest.fn(
    async (document: string, _variables?: Record<string, unknown>) => {
      if (document.includes("mutation")) {
        if (options.mutationError !== undefined) throw options.mutationError;
        return mutationData;
      }
      if (options.queryError !== undefined) throw options.queryError;
      return { repository: repositoryData };
    },
  );
  const transport = { graphql } as unknown as GithubGraphqlTransportClient;
  const provider: GithubClientPort<GithubGraphqlTransportClient> = {
    getClient: jest.fn(() => transport),
  };
  return {
    repository: new LinkedBranchRepository(provider),
    graphql,
    provider,
  };
}

const request = {
  owner: "owner",
  repo: "repo",
  baseBranch: "develop",
  newBranch: "bugfix/42-new",
  issueNumber: 42,
  oid: undefined as string | undefined,
  token: "token",
};

async function createLinkedBranch(
  harness: ReturnType<typeof createHarness>,
  overrides: Partial<typeof request> = {},
) {
  const value = { ...request, ...overrides };
  return harness.repository.createLinkedBranch(
    value.owner,
    value.repo,
    value.baseBranch,
    value.newBranch,
    value.issueNumber,
    value.oid,
    value.token,
  );
}

describe("LinkedBranchRepository", () => {
  it("passes a quoted and backslashed head ref as an exact GraphQL variable and resolves the client once", async () => {
    const harness = createHarness();

    await createLinkedBranch(harness, {
      baseBranch: 'feature/"quoted\\branch',
    });

    expect(harness.graphql.mock.calls[0][0]).toContain("qualifiedName: $ref");
    expect(harness.graphql.mock.calls[0][1]).toEqual({
      repo: "repo",
      owner: "owner",
      issueNumber: 42,
      ref: 'refs/heads/feature/"quoted\\branch',
    });
    expect(harness.provider.getClient).toHaveBeenCalledTimes(1);
  });

  it("qualifies a tag ref without treating an embedded tags segment as a tag", async () => {
    const tagHarness = createHarness();
    const headHarness = createHarness();

    await createLinkedBranch(tagHarness, { baseBranch: "tags/v1.2.3" });
    await createLinkedBranch(headHarness, {
      baseBranch: "feature/tags/example",
    });

    expect(tagHarness.graphql.mock.calls[0][1]).toMatchObject({
      ref: "refs/tags/v1.2.3",
    });
    expect(headHarness.graphql.mock.calls[0][1]).toMatchObject({
      ref: "refs/heads/feature/tags/example",
    });
  });

  it("uses an explicit OID override in the mutation", async () => {
    const harness = createHarness();

    await createLinkedBranch(harness, { oid: "explicit-oid" });

    expect(harness.graphql.mock.calls[1][1]).toMatchObject({
      oid: "explicit-oid",
    });
  });

  it.each([
    [
      "repository ID",
      {
        id: undefined,
        issue: { id: "I_issue" },
        ref: { target: { oid: "base-oid" } },
      },
    ],
    [
      "issue ID",
      { id: "R_repo", issue: null, ref: { target: { oid: "base-oid" } } },
    ],
    ["base OID", { id: "R_repo", issue: { id: "I_issue" }, ref: null }],
  ])(
    "returns a failure without mutating when %s is absent",
    async (_label, repository) => {
      const harness = createHarness({ repository });

      const results = await createLinkedBranch(harness);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ success: false, executed: true });
      expect(harness.graphql).toHaveBeenCalledTimes(1);
    },
  );

  it("returns the exact successful branch payload after mutation", async () => {
    const harness = createHarness();

    const results = await createLinkedBranch(harness);

    expect(harness.graphql.mock.calls[1][1]).toEqual({
      issueId: "I_issue",
      name: "/bugfix/42-new",
      repositoryId: "R_repo",
      oid: "base-oid",
    });
    expect(results).toEqual([
      expect.objectContaining({
        success: true,
        executed: true,
        payload: {
          baseBranchName: "develop",
          baseBranchUrl: "https://github.com/owner/repo/tree/develop",
          newBranchName: "bugfix/42-new",
          newBranchUrl: "https://github.com/owner/repo/tree/bugfix/42-new",
        },
      }),
    ]);
  });

  it("fails closed when the mutation returns no linked branch", async () => {
    const harness = createHarness({ mutation: { createLinkedBranch: null } });

    const results = await createLinkedBranch(harness);

    expect(results).toEqual([
      expect.objectContaining({
        success: false,
        executed: true,
        steps: expect.arrayContaining([
          expect.stringContaining("returned no linked branch"),
        ]),
      }),
    ]);
  });

  it.each([
    ["no ref", { id: "LB_branch", ref: null }],
    ["a different ref", { id: "LB_branch", ref: { name: "other" } }],
  ])(
    "fails closed when the mutation returns %s",
    async (_label, linkedBranch) => {
      const harness = createHarness({
        mutation: { createLinkedBranch: { linkedBranch } },
      });

      const results = await createLinkedBranch(harness);

      expect(results).toEqual([
        expect.objectContaining({
          success: false,
          executed: true,
          steps: expect.arrayContaining([
            expect.stringContaining("returned an unexpected branch ref"),
          ]),
        }),
      ]);
    },
  );

  it.each([
    ["query", { queryError: new Error("query failed") }],
    ["mutation", { mutationError: new Error("mutation failed") }],
    ["non-Error query", { queryError: "query failed as text" }],
  ])("maps a %s failure to one failed result", async (_label, options) => {
    const harness = createHarness(options);

    const results = await createLinkedBranch(harness);

    expect(results).toEqual([
      expect.objectContaining({
        success: false,
        executed: true,
        errors: [expect.any(Error)],
      }),
    ]);
  });

  it("treats GitHub's already-exists mutation response as an idempotent success", async () => {
    const harness = createHarness({
      mutationError: {
        status: 422,
        message: "Validation Failed",
        response: { data: { errors: [{ code: "already_exists" }] } },
      },
    });

    const results = await createLinkedBranch(harness);

    expect(results).toEqual([
      expect.objectContaining({ success: true, executed: false }),
    ]);
  });
});
