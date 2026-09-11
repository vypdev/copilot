import { DEFAULT_COPILOT_LIFECYCLE_LABELS } from "../../../domain/copilot_lifecycle";
import type { DeploymentOperationSnapshot } from "../../../domain/deployment_operation";
import { projectDeploymentLabels } from "../deployment_lifecycle_policy";

const labels = { deploy: "deploy", deployed: "deployed", lifecycle: DEFAULT_COPILOT_LIFECYCLE_LABELS };
const operation = (phase: DeploymentOperationSnapshot["phase"], overrides: Partial<DeploymentOperationSnapshot> = {}) => ({
  phase,
  prMode: "auto",
  publicationVerified: false,
  ...overrides,
}) as DeploymentOperationSnapshot;

describe("projectDeploymentLabels", () => {
  it.each([
    ["preparing", "state:in-progress"],
    ["publishing", "state:in-progress"],
    ["promotion_pr_pending", "state:reviewing"],
    ["reconciliation_pending", "state:reviewing"],
    ["completed", "state:verified"],
  ] as const)("projects %s to %s", (phase, expected) => {
    expect(projectDeploymentLabels(["release", "state:planned"], operation(phase), labels))
      .toEqual(["release", expected]);
  });

  it("projects a maintainer-owned PR as ready and awaiting a maintainer", () => {
    expect(projectDeploymentLabels([], operation("promotion_pr_pending", { selectedPrMode: "create-only" }), labels))
      .toEqual(["state:ready", "state:awaiting-maintainer"]);
  });

  it("projects blocked state without retaining an obsolete lifecycle label", () => {
    expect(projectDeploymentLabels(["state:reviewing"], operation("blocked"), labels))
      .toEqual(["state:blocked", "state:awaiting-maintainer"]);
  });

  it("replaces deploy with deployed immediately after publication verification", () => {
    expect(projectDeploymentLabels(["release", "deploy"], operation("reconciliation_pending", { publicationVerified: true }), labels))
      .toEqual(["release", "deployed", "state:reviewing"]);
  });

  it("is idempotent for an already projected label set", () => {
    const projected = projectDeploymentLabels(["release", "deployed", "state:verified"], operation("completed", { publicationVerified: true }), labels);
    expect(projectDeploymentLabels(projected, operation("completed", { publicationVerified: true }), labels)).toEqual(projected);
  });
});
