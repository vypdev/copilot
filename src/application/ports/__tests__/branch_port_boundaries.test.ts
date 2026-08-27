import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("branch port boundaries", () => {
  const portsDirectory = join(__dirname, "..");

  it("does not retain a universal branch ports module", () => {
    expect(existsSync(join(portsDirectory, "branch_ports.ts"))).toBe(false);
  });

  it("keeps branch contracts separated by capability", () => {
    for (const file of [
      "branch_tag_ports.ts",
      "branch_change_ports.ts",
      "branch_lifecycle_ports.ts",
      "branch_preparation_ports.ts",
      "branch_workflow_ports.ts",
      "branch_merge_ports.ts",
    ]) {
      expect(existsSync(join(portsDirectory, file))).toBe(true);
    }
  });

  it("keeps branch preparation as independent capabilities instead of an aggregate port", () => {
    const source = readFileSync(
      join(portsDirectory, "branch_preparation_ports.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/interface\s+BranchPreparationPort\b/);
    expect(source).not.toMatch(/\bextends\b/);
    for (const capability of [
      "RemoteBranchSyncPort",
      "CommitTagQueryPort",
      "LinkedBranchCommandPort",
      "BranchPropagationDelayPort",
    ]) {
      expect(source).toMatch(new RegExp(`interface\\s+${capability}\\b`));
    }
  });
});
