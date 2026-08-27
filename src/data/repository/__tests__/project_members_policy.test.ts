import {
  collectOrganizationMembers,
  selectAvailableMembers,
} from "../project_members_policy";

describe("project members policy", () => {
  it("collects unique members across teams", async () => {
    const result = await collectOrganizationMembers(
      [{ slug: "one" }, { slug: "two" }],
      async (slug) =>
        slug === "one"
          ? [{ login: "alice" }, { login: "bob" }]
          : [{ login: "bob" }, { login: "carol" }],
    );
    expect(result).toEqual(["alice", "bob", "carol"]);
  });

  it("deduplicates organization logins case-insensitively", async () => {
    const result = await collectOrganizationMembers(
      [{ slug: "one" }, { slug: "two" }],
      async (slug) =>
        slug === "one"
          ? [{ login: "Alice" }, { login: "alice" }]
          : [{ login: "ALICE" }, { login: "Bob" }],
    );

    expect(result).toEqual(["Alice", "Bob"]);
  });

  it("filters and deduplicates member identities case-insensitively", () => {
    expect(
      selectAvailableMembers(["Alice", "alice", "Bob", "BOB"], ["ALICE"], 10),
    ).toEqual(["Bob"]);
  });

  it("filters current members and limits selection", () => {
    jest.spyOn(Math, "random").mockReturnValue(0.1);
    expect(
      selectAvailableMembers(["alice", "bob", "carol"], ["alice"], 1),
    ).toHaveLength(1);
    jest.restoreAllMocks();
  });
});
