import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("pull request port boundaries", () => {
  const portsDirectory = join(__dirname, "..");

  it("does not retain universal or mixed review abstractions", () => {
    expect(existsSync(join(portsDirectory, "pull_request_ports.ts"))).toBe(
      false,
    );
    expect(
      existsSync(join(portsDirectory, "pull_request_review_ports.ts")),
    ).toBe(false);
    expect(
      existsSync(
        join(
          portsDirectory,
          "../../data/repository/pull_request/pull_request_review_repository.ts",
        ),
      ),
    ).toBe(false);
  });

  it("keeps provider review protocols outside the application layer", () => {
    expect(
      existsSync(
        join(
          portsDirectory,
          "../../infrastructure/github/ports/github_pull_request_review_protocol.ts",
        ),
      ),
    ).toBe(true);
  });

  it("keeps provider identities and SDK concepts out of semantic review ports", () => {
    for (const file of [
      "pull_request_review_comment_ports.ts",
      "pull_request_reviewer_ports.ts",
    ]) {
      const source = readFileSync(join(portsDirectory, file), "utf8");
      expect(source).not.toMatch(
        /\b(?:nodeId|node_id|GraphQL|Octokit|Github[A-Z])/,
      );
    }
  });

  it("keeps pull request contracts separated by capability", () => {
    for (const file of [
      "pull_request_branch_ports.ts",
      "pull_request_description_ports.ts",
      "pull_request_issue_link_ports.ts",
      "pull_request_review_comment_ports.ts",
      "pull_request_reviewer_ports.ts",
    ]) {
      expect(existsSync(join(portsDirectory, file))).toBe(true);
    }
  });
});
