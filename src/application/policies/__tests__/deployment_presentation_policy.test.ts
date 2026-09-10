import type { DeploymentOperationSnapshot, DeploymentPhase } from "../../../domain/deployment_operation";
import {
  deploymentDashboardMarker,
  normalizeLocale,
  renderDeploymentDashboard,
  renderDeploymentJobSummary,
  renderPromotionPullRequest,
  renderReconciliationPullRequest,
} from "../deployment_presentation_policy";

const operation = (phase: DeploymentPhase = "promotion_pr_pending", overrides: Partial<DeploymentOperationSnapshot> = {}): DeploymentOperationSnapshot => ({
  operationId: "operation-12345678",
  kind: "release",
  version: "3.4.0",
  title: "Release",
  changelog: "Changes",
  phase,
  strategy: "production-lineage",
  prMode: "auto",
  selectedPrMode: "auto-merge",
  backmergeMode: "auto",
  hotfixActiveReleasePolicy: "prefer-release",
  cleanup: "all",
  issueCompletion: "close",
  presentationMode: "guided",
  diagrams: true,
  commentMode: "update",
  sourceBranch: "release/3.4.0",
  sourceSha: "a".repeat(40),
  originBranch: "develop",
  originSha: "b".repeat(40),
  productionBranch: "master",
  developmentBranch: "develop",
  reconciliationTree: "sync",
  promotionPullRequest: 401,
  productionSha: undefined,
  tag: "v3.4.0",
  publicationWorkflow: "release_workflow.yml",
  publicationVerified: false,
  reconciliationTargets: [],
  lastFailure: null,
  ...overrides,
});

const context = {
  owner: "vypdev",
  repository: "copilot",
  issue: 355,
  issueLocale: "en-US",
  pullRequestLocale: "en-US",
  workflowRunUrl: "https://github.com/vypdev/copilot/actions/runs/1",
  packageName: "@vypdev/copilot",
};

describe("deployment presentation policy", () => {
  it("uses a stable operation-scoped dashboard marker", () => {
    expect(deploymentDashboardMarker("operation-12345678", 355))
      .toBe('<!-- copilot-deployment-dashboard operation-id="operation-12345678" issue="355" -->');
  });

  it("orders guided status before progress and technical detail", () => {
    const body = renderDeploymentDashboard(operation(), context);
    expect(body.indexOf("Current status")).toBeLessThan(body.indexOf("## Progress"));
    expect(body.indexOf("## Progress")).toBeLessThan(body.indexOf("Technical details"));
  });

  it("renders a fixed-label Mermaid diagram plus text fallback", () => {
    const body = renderDeploymentDashboard(operation(), context);
    expect(body).toContain("```mermaid");
    expect(body).toContain("prepared -> production PR -> accepted -> published -> reconciled -> complete");
    expect(body).not.toContain("release/3.4.0 -->");
  });

  it("removes the diagram in compact mode", () => {
    expect(renderDeploymentDashboard(operation(undefined, { presentationMode: "compact" }), context)).not.toContain("```mermaid");
  });

  it("suppresses secondary sections in quiet mode but preserves state", () => {
    const body = renderDeploymentDashboard(operation("publishing", { presentationMode: "quiet" }), context);
    expect(body).toContain("publishing artifacts");
    expect(body).not.toContain("## Progress");
    expect(body).toContain("Technical details");
  });

  it("shows an explicit human action for create-only promotion", () => {
    const body = renderDeploymentDashboard(operation(), context);
    expect(body).toContain("No action is required");
    expect(renderDeploymentDashboard(operation(undefined, { selectedPrMode: "create-only" }), context)).toContain("Action required");
  });

  it("distinguishes a blocked pre-publication operation", () => {
    const body = renderDeploymentDashboard(operation("blocked", {
      lastFailure: { category: "promotion", message: "PR was closed", retryable: true, previousPhase: "promotion_pr_pending" },
    }), context);
    expect(body).toContain("❌");
    expect(body).toContain("needs attention");
    expect(body).toContain("PR was closed");
    expect(body.indexOf("## Action required")).toBeLessThan(body.indexOf("## Progress"));
    expect(body).toContain("Production updated");
  });

  it("distinguishes published-but-not-reconciled state", () => {
    const body = renderDeploymentDashboard(operation("reconciliation_pending", { publicationVerified: true, productionSha: "c".repeat(40) }), context);
    expect(body).toContain("Package status: already published");
    expect(body).toContain("waiting for development reconciliation");
  });

  it("keeps completed reconciliation visible when only cleanup is blocked", () => {
    const body = renderDeploymentDashboard(operation("blocked", {
      publicationVerified: true,
      productionSha: "c".repeat(40),
      reconciliationTargets: [{ targetBranch: "develop", sourceBranch: "master", sourceSha: "c".repeat(40), pullRequest: 402, status: "completed" }],
      lastFailure: { category: "cleanup", message: "Branch deletion failed", retryable: true, previousPhase: "reconciliation_pending" },
    }), context);
    expect(body).toContain("| Yes | Yes | Yes |");
    expect(body).toContain("- [x] Development reconciliation: `develop`");
    expect(body).toContain("- [ ] Cleanup and issue completion");
  });

  it("renders completed state with a success label", () => {
    expect(renderDeploymentDashboard(operation("completed", { publicationVerified: true }), context)).toContain("✅ Release `3.4.0`");
  });

  it("renders primary Spanish status and instructions", () => {
    const body = renderDeploymentDashboard(operation(), { ...context, issueLocale: "es-ES" });
    expect(body).toContain("Estado actual");
    expect(body).toContain("Qué ocurrirá después");
    expect(body).toContain("No se requiere ninguna acción");
  });

  it("localizes the complete Spanish diagram and promotion PR surface", () => {
    const localized = { ...context, issueLocale: "es-ES", pullRequestLocale: "es-ES" };
    const dashboard = renderDeploymentDashboard(operation(), localized);
    const promotion = renderPromotionPullRequest(operation(), localized);
    expect(dashboard).toContain("PR de producción");
    expect(dashboard).toContain("Reconciliación con desarrollo");
    expect(promotion.body).toContain("Listo antes de revisar");
    expect(promotion.body).toContain("Después del merge");
  });

  it("falls unsupported locales back to English", () => {
    expect(normalizeLocale("fr-FR")).toBe("en-US");
  });

  it("normalizes regional Spanish locales", () => {
    expect(normalizeLocale("es-MX")).toBe("es-ES");
  });

  it("renders a deterministic promotion PR with ownership marker", () => {
    const value = renderPromotionPullRequest(operation(), context);
    expect(value.title).toBe("release(3.4.0): promote to master");
    expect(value.body).toContain('phase="promotion" issue="355"');
    expect(value.body).toContain("After merge");
  });

  it("renders a reconciliation PR that cannot republish", () => {
    const target = { targetBranch: "develop", sourceBranch: "master", sourceSha: "c".repeat(40), pullRequest: 402, status: "pending" as const };
    const value = renderReconciliationPullRequest(operation("reconciliation_pending", { publicationVerified: true, productionSha: "c".repeat(40) }), target, context);
    expect(value.title).toBe("release(3.4.0): reconcile master into develop");
    expect(value.body).toContain("cannot publish the package again");
    expect(value.body).toContain('phase="reconciliation" issue="355"');
  });

  it("localizes the reconciliation PR and explains a sync branch", () => {
    const target = { targetBranch: "develop", sourceBranch: "master", sourceSha: "c".repeat(40), syncBranch: "sync/release", status: "pending" as const };
    const value = renderReconciliationPullRequest(
      operation("reconciliation_pending", { publicationVerified: true, productionSha: "c".repeat(40) }),
      target,
      { ...context, pullRequestLocale: "es-ES" },
    );
    expect(value.body).toContain("ya publicado");
    expect(value.body).toContain("rama de sincronización dedicada");
  });

  it("sanitizes headings, HTML, code fences, and mentions from untrusted values", () => {
    const value = renderPromotionPullRequest(operation(undefined, { version: "3.4.0`\n# @team<script>" }), context);
    expect(value.title).not.toMatch(/[\n<>`]/);
    expect(value.body).not.toContain("@team");
    expect(value.title).toContain("@​team");
  });

  it("builds descriptive issue, PR, comparison, release and workflow links", () => {
    const body = renderDeploymentDashboard(operation("reconciliation_pending", {
      publicationVerified: true,
      productionSha: "c".repeat(40),
      reconciliationTargets: [{ targetBranch: "develop", sourceBranch: "master", sourceSha: "c".repeat(40), pullRequest: 402, status: "pending" }],
    }), context);
    expect(body).toContain("https://github.com/vypdev/copilot/issues/355");
    expect(body).toContain("https://github.com/vypdev/copilot/pull/401");
    expect(body).toContain("https://github.com/vypdev/copilot/pull/402");
    expect(body).toContain("/releases/tag/v3.4.0");
    expect(body).toContain("/actions/runs/1");
    expect(body).toContain("www.npmjs.com/package/%40vypdev%2Fcopilot/v/3.4.0");
    expect(body).toContain("/commit/");
    expect(body).toContain("/compare/");
  });

  it("renders a pending external transition as a successful wait in the Job Summary", () => {
    const summary = renderDeploymentJobSummary(operation(), context, "preparing", ["Created promotion PR #401"]);
    expect(summary).toContain("Waiting externally");
    expect(summary).not.toContain("Workflow failed");
    expect(summary).toContain("Created promotion PR #401");
  });

  it("renders blocked retryability and sanitizes Job Summary operations", () => {
    const summary = renderDeploymentJobSummary(operation("blocked", {
      lastFailure: { category: "publication", message: "bad", retryable: true, previousPhase: "publishing" },
    }), context, "publishing", ["::error:: @team\n# forged"]);
    expect(summary).toContain("Workflow failed");
    expect(summary).toContain("| `publishing` | `blocked` | Yes |");
    expect(summary).toContain("## Action required");
    expect(summary).toContain("bad. Retry after correcting the cause.");
    expect(summary).not.toContain("::error::");
    expect(summary).not.toContain("@team");
  });

  it("renders equivalent Spanish recovery guidance in dashboards and Job Summaries", () => {
    const blocked = operation("blocked", {
      lastFailure: { category: "promotion", message: "Falta merge_group", retryable: true, previousPhase: "preparing" },
    });
    const localized = { ...context, issueLocale: "es-ES" };
    expect(renderDeploymentDashboard(blocked, localized)).toContain("Vuelve a intentarlo después de corregir la causa");
    expect(renderDeploymentJobSummary(blocked, localized)).toContain("## Acción necesaria");
  });
});
