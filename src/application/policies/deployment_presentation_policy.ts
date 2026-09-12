import type { DeploymentOperationSnapshot, DeploymentPhase, ReconciliationTargetState } from "../../domain/deployment_operation";
import { buildManagedPullRequestMarker } from "../../domain/managed_pull_request";

type SupportedLocale = "en-US" | "es-ES";

interface DeploymentMessages {
  release: string;
  hotfix: string;
  currentStatus: string;
  noAction: string;
  actionRequired: string;
  progress: string;
  currentTransition: string;
  whatNext: string;
  links: string;
  technical: string;
  alreadyPublished: string;
  notPublished: string;
  productionUpdated: string;
  developmentSynchronized: string;
  yes: string;
  no: string;
  from: string;
  to: string;
  state: string;
  compare: string;
  controlCenter: string;
  purpose: string;
  afterMerge: string;
  purposePromotion: string;
  purposeReconciliation: string;
  afterPromotion: string;
  noRepublish: string;
  origin: string;
  preparedSource: string;
  destination: string;
  publication: string;
  productionFact: string;
  developmentTarget: string;
  completionEffect: string;
  closeIssue: string;
  keepIssue: string;
  readyBeforeReview: string;
  buildValidation: string;
  packageSmoke: string;
  protectedChecks: string;
  syncReason: string;
  protectedFacts: string;
  cut: string;
  promotion: string;
  reconciliation: string;
  cleanup: string;
  jobSummary: string;
  result: string;
  externalWait: string;
  workflowFailure: string;
  previousPhase: string;
  resultingPhase: string;
  retryable: string;
  retryAfterCorrection: string;
  manualIntervention: string;
  reviewManagedPr: string;
  createdReused: string;
  fallback: string;
  phase: Readonly<Record<DeploymentPhase, string>>;
  diagram: readonly [string, string, string, string, string, string, string];
}

const EN: DeploymentMessages = {
  release: "Release", hotfix: "Hotfix", currentStatus: "Current status",
  noAction: "No action is required while GitHub owns the pending transition.", actionRequired: "Action required",
  progress: "Progress", currentTransition: "Current transition", whatNext: "What happens next", links: "Links",
  technical: "Technical details", alreadyPublished: "Package status: already published", notPublished: "Package status: not published",
  productionUpdated: "Production updated", developmentSynchronized: "Development synchronized", yes: "Yes", no: "No",
  from: "From", to: "To", state: "State", compare: "Compare changes", controlCenter: "Release control center",
  purpose: "Purpose", afterMerge: "After merge", purposePromotion: "accept the prepared change in production",
  purposeReconciliation: "bring the accepted production state back to the development line",
  afterPromotion: "After merge, Copilot will tag and publish the accepted production commit.",
  noRepublish: "Merging or closing this PR cannot publish the package again.",
  origin: "Origin", preparedSource: "Prepared source", destination: "Destination", publication: "Publication",
  productionFact: "Production fact", developmentTarget: "Development target", completionEffect: "Completion effect",
  closeIssue: "Close issue after all targets", keepIssue: "Keep issue open", readyBeforeReview: "Ready before review",
  buildValidation: "Build and release validation", packageSmoke: "Package smoke test",
  protectedChecks: "Protected-branch checks and reviews", syncReason: "A dedicated sync branch preserves target-only commits and isolates target-dependent checks.",
  protectedFacts: "What Copilot protected", cut: "Source cut", promotion: "Production promotion", reconciliation: "Development reconciliation",
  cleanup: "Cleanup and issue completion", jobSummary: "Deployment orchestration", result: "Result",
  externalWait: "Waiting externally", workflowFailure: "Workflow failed", previousPhase: "Previous phase", resultingPhase: "Resulting phase",
  retryable: "Retryable", createdReused: "Created, reused, or skipped", fallback: "prepared -> production PR -> accepted -> published -> reconciled -> complete",
  retryAfterCorrection: "Retry after correcting the cause", manualIntervention: "Manual intervention is required",
  reviewManagedPr: "review and merge the managed PR when GitHub reports it ready",
  phase: {
    preparing: "preparing the version", promotion_pr_pending: "waiting for production approval", promoted: "accepted in production",
    publishing: "publishing artifacts", published: "published; preparing development reconciliation",
    reconciliation_pending: "waiting for development reconciliation", completed: "completed", blocked: "needs attention",
  },
  diagram: ["Source snapshot", "Version prepared", "Production PR", "Accepted in production", "Package and release", "Development reconciliation", "Complete"],
};

const ES: DeploymentMessages = {
  release: "Release", hotfix: "Hotfix", currentStatus: "Estado actual",
  noAction: "No se requiere ninguna acción mientras GitHub gestiona la transición pendiente.", actionRequired: "Acción necesaria",
  progress: "Progreso", currentTransition: "Transición actual", whatNext: "Qué ocurrirá después", links: "Enlaces",
  technical: "Detalles técnicos", alreadyPublished: "Estado del paquete: ya publicado", notPublished: "Estado del paquete: no publicado",
  productionUpdated: "Producción actualizada", developmentSynchronized: "Desarrollo sincronizado", yes: "Sí", no: "No",
  from: "Origen", to: "Destino", state: "Estado", compare: "Comparar cambios", controlCenter: "Centro de control de la release",
  purpose: "Propósito", afterMerge: "Después del merge", purposePromotion: "aceptar en producción el cambio preparado",
  purposeReconciliation: "llevar el estado aceptado en producción de vuelta a desarrollo",
  afterPromotion: "Tras el merge, Copilot etiquetará y publicará el commit aceptado en producción.",
  noRepublish: "Mergear o cerrar esta PR no puede volver a publicar el paquete.",
  origin: "Origen", preparedSource: "Fuente preparada", destination: "Destino", publication: "Publicación",
  productionFact: "Estado de producción", developmentTarget: "Destino de desarrollo", completionEffect: "Efecto al completar",
  closeIssue: "Cerrar la issue tras todos los destinos", keepIssue: "Mantener la issue abierta", readyBeforeReview: "Listo antes de revisar",
  buildValidation: "Build y validación de release", packageSmoke: "Smoke test del paquete",
  protectedChecks: "Checks y revisiones de la rama protegida", syncReason: "Una rama de sincronización dedicada preserva los commits exclusivos del destino y aísla sus checks.",
  protectedFacts: "Qué ha protegido Copilot", cut: "Corte de la fuente", promotion: "Promoción a producción", reconciliation: "Reconciliación con desarrollo",
  cleanup: "Limpieza y cierre de la issue", jobSummary: "Orquestación del despliegue", result: "Resultado",
  externalWait: "Esperando fuera del workflow", workflowFailure: "Workflow fallido", previousPhase: "Fase anterior", resultingPhase: "Fase resultante",
  retryable: "Reintentable", createdReused: "Creado, reutilizado u omitido", fallback: "preparada -> PR de producción -> aceptada -> publicada -> reconciliada -> completada",
  retryAfterCorrection: "Vuelve a intentarlo después de corregir la causa", manualIntervention: "Se requiere intervención manual",
  reviewManagedPr: "revisa y mergea la PR gestionada cuando GitHub indique que está lista",
  phase: {
    preparing: "preparando la versión", promotion_pr_pending: "esperando aprobación en producción", promoted: "aceptada en producción",
    publishing: "publicando artefactos", published: "publicada; preparando la reconciliación",
    reconciliation_pending: "esperando reconciliación con desarrollo", completed: "completada", blocked: "necesita atención",
  },
  diagram: ["Snapshot de origen", "Versión preparada", "PR de producción", "Aceptada en producción", "Paquete y release", "Reconciliación con desarrollo", "Completada"],
};

export const DEPLOYMENT_DASHBOARD_MARKER = "copilot-deployment-dashboard";

export interface DeploymentPresentationContext {
  readonly owner: string;
  readonly repository: string;
  readonly issue: number;
  readonly issueLocale: string;
  readonly pullRequestLocale: string;
  readonly workflowRunUrl?: string;
  readonly packageName?: string;
}

export function deploymentDashboardMarker(operationId: string, issue: number): string {
  return `<!-- ${DEPLOYMENT_DASHBOARD_MARKER} operation-id="${safeMarkerValue(operationId)}" issue="${issue}" -->`;
}

export function renderDeploymentDashboard(operation: DeploymentOperationSnapshot, context: DeploymentPresentationContext): string {
  const messages = messagesFor(context.issueLocale);
  const title = operation.kind === "release" ? messages.release : messages.hotfix;
  const action = deploymentAction(operation, messages);
  const lines = [
    deploymentDashboardMarker(operation.operationId, context.issue), "",
    `# ${operation.phase === "blocked" ? "❌" : operation.phase === "completed" ? "✅" : "🚀"} ${title} ${inline(operation.version)}`, "",
    `> **${messages.currentStatus}: ${messages.phase[operation.phase]}.**`,
  ];
  if (action.required) lines.push("", `## ${messages.actionRequired}`, "", action.message);
  else lines.push(`> ${action.message}`);
  lines.push("");

  if (operation.phase === "blocked") lines.push(...factTable(operation, messages), "", `## ${messages.protectedFacts}`, "", protectedFact(operation, messages), "");
  if (operation.presentationMode !== "quiet") lines.push(`## ${messages.progress}`, "", ...progressLines(operation, messages), "");
  if (operation.presentationMode === "guided" && operation.diagrams) lines.push(...deploymentDiagram(messages), "");
  if (operation.presentationMode !== "quiet") {
    lines.push(
      `## ${messages.currentTransition}`, "", ...transitionTable(operation, messages), "",
      `## ${messages.whatNext}`, "", nextDescription(operation, messages), "",
      `## ${messages.links}`, "", deploymentLinks(operation, context, messages).join(" · "), "",
    );
  }
  lines.push(
    "<details>", `<summary>${messages.technical}</summary>`, "",
    `- Operation: ${inline(operation.operationId)}`, `- Strategy: ${inline(operation.strategy)}`,
    `- PR mode: ${inline(operation.selectedPrMode ?? operation.prMode)}`, `- Source SHA: ${inline(operation.sourceSha)}`,
    `- Production SHA: ${inline(operation.productionSha ?? "pending")}`, "</details>",
  );
  return lines.join("\n");
}

export function renderPromotionPullRequest(
  operation: DeploymentOperationSnapshot,
  context: DeploymentPresentationContext,
): { title: string; body: string } {
  const messages = messagesFor(context.pullRequestLocale);
  const kind = operation.kind === "release" ? "release" : "hotfix";
  const title = `${kind}(${safeText(operation.version)}): promote to ${safeText(operation.productionBranch)}`;
  const body = [
    `# 🚀 ${capitalize(messages.purposePromotion)}`, "",
    `> **${messages.purpose}:** ${capitalize(messages.purposePromotion)}.`,
    `> **${messages.afterMerge}:** ${messages.afterPromotion}`, "",
    `| ${messages.origin} | ${messages.preparedSource} | ${messages.destination} | ${messages.publication} |`,
    "|---|---|---|---|",
    `| ${inline(`${operation.originBranch}@${shortSha(operation.originSha)}`)} | ${inline(`${operation.sourceBranch}@${shortSha(operation.sourceSha)}`)} | ${inline(operation.productionBranch)} | ${messages.afterMerge} |`, "",
    `## ${messages.readyBeforeReview}`, "",
    `- ✅ ${messages.buildValidation}`, `- ✅ ${messages.packageSmoke}`, `- ⏳ ${messages.protectedChecks}`, "",
    `## ${messages.afterMerge}`, "",
    `- ${messages.afterPromotion}`, `- ${messages.reconciliation}: ${inline(operation.developmentBranch)}.`, "",
    `[${messages.compare}](${compareUrl(context, operation.productionBranch, operation.sourceBranch)}) · [${messages.controlCenter}](${issueUrl(context)})`, "",
    "<details>", `<summary>${messages.technical}</summary>`, "",
    `Operation ${inline(operation.operationId)}; strategy ${inline(operation.strategy)}; merge mode ${inline(operation.prMode)}.`,
    "</details>", "", buildManagedPullRequestMarker({ operationId: operation.operationId, phase: "promotion", issue: context.issue }),
  ].join("\n");
  return { title, body };
}

export function renderReconciliationPullRequest(
  operation: DeploymentOperationSnapshot,
  target: ReconciliationTargetState,
  context: DeploymentPresentationContext,
): { title: string; body: string } {
  const messages = messagesFor(context.pullRequestLocale);
  const kind = operation.kind === "release" ? "release" : "hotfix";
  const title = `${kind}(${safeText(operation.version)}): reconcile ${safeText(target.sourceBranch)} into ${safeText(target.targetBranch)}`;
  const body = [
    `# 🔄 ${capitalize(messages.purposeReconciliation)}`, "",
    `> **${messages.alreadyPublished}.** ${messages.noRepublish}`, "",
    `| ${messages.productionFact} | ${messages.developmentTarget} | ${messages.completionEffect} |`, "|---|---|---|",
    `| ${inline(`${operation.tag}@${shortSha(operation.productionSha ?? target.sourceSha)}`)} | ${inline(target.targetBranch)} | ${operation.issueCompletion === "close" ? messages.closeIssue : messages.keepIssue} |`, "",
    ...(target.syncBranch ? [`${messages.syncReason} ${inline(target.syncBranch)}`, ""] : []),
    `${messages.noRepublish}`, "",
    `[${messages.compare}](${compareUrl(context, target.targetBranch, target.syncBranch ?? target.sourceBranch)}) · [${messages.controlCenter}](${issueUrl(context)})`, "",
    "<details>", `<summary>${messages.technical}</summary>`, "", `Operation ${inline(operation.operationId)}; source SHA ${inline(target.sourceSha)}.`,
    "</details>", "", buildManagedPullRequestMarker({ operationId: operation.operationId, phase: "reconciliation", issue: context.issue }),
  ].join("\n");
  return { title, body };
}

export function renderDeploymentJobSummary(
  operation: DeploymentOperationSnapshot,
  context: DeploymentPresentationContext,
  previousPhase?: DeploymentPhase,
  operations: readonly string[] = [],
): string {
  const messages = messagesFor(context.issueLocale);
  const externallyPending = operation.phase === "promotion_pr_pending" || operation.phase === "reconciliation_pending";
  const result = operation.phase === "blocked" ? messages.workflowFailure : externallyPending ? messages.externalWait : messages.phase[operation.phase];
  const lines = [
    `# ${operation.phase === "blocked" ? "❌" : externallyPending ? "⏳" : "✅"} ${messages.jobSummary}`, "",
    `> **${messages.result}: ${result}.**`, "",
    `| ${messages.previousPhase} | ${messages.resultingPhase} | ${messages.retryable} |`, "|---|---|---|",
    `| ${inline(previousPhase ?? operation.phase)} | ${inline(operation.phase)} | ${operation.lastFailure?.retryable ? messages.yes : messages.no} |`, "",
    `- Operation: ${inline(operation.operationId)}`,
    `- State: version ${operation.stateVersion}, revision ${operation.revision}`,
    `- Admission scope: repository + launcher issue #${context.issue}`,
    `- ${messages.origin}: ${inline(`${operation.originBranch}@${shortSha(operation.originSha)}`)}`,
    `- ${messages.preparedSource}: ${inline(`${operation.sourceBranch}@${shortSha(operation.sourceSha)}`)}`,
    `- ${messages.productionFact}: ${inline(operation.productionSha ? `${operation.productionBranch}@${shortSha(operation.productionSha)}` : "pending")}`,
    `- ${messages.publication}: ${operation.publicationVerified ? messages.alreadyPublished : messages.notPublished}`,
    `- Publication receipt: ${operation.publicationReceipt ? inline(`${operation.publicationReceipt.tag}@${shortSha(operation.publicationReceipt.productionSha)}`) : "absent"}`,
    `- ${messages.createdReused}: ${safeText(operations.join(", ") || "none")}`, "",
  ];
  if (operation.phase === "blocked") {
    lines.push(
      `## ${messages.actionRequired}`, "",
      `${safeText(operation.lastFailure?.message ?? messages.workflowFailure)}. ${operation.lastFailure?.retryable ? messages.retryAfterCorrection : messages.manualIntervention}.`, "",
    );
  }
  lines.push(deploymentLinks(operation, context, messages).join(" · "));
  return lines.join("\n");
}

function progressLines(operation: DeploymentOperationSnapshot, messages: DeploymentMessages): string[] {
  const phase = operation.phase === "blocked" ? operation.lastFailure?.previousPhase ?? "preparing" : operation.phase;
  const reached = (expected: DeploymentPhase): boolean => phaseRank(phase) >= phaseRank(expected);
  return [
    `- [x] ${messages.cut}: ${inline(`${operation.originBranch}@${shortSha(operation.originSha)}`)}`,
    `- [x] ${messages.buildValidation} + ${messages.packageSmoke}`,
    `- [${operation.productionSha || reached("promoted") ? "x" : " "}] ${messages.promotion}: ${inline(operation.productionBranch)}`,
    `- [${operation.publicationVerified ? "x" : " "}] ${operation.publicationVerified ? messages.alreadyPublished : messages.notPublished}`,
    `- [${reconciliationCompleted(operation) ? "x" : " "}] ${messages.reconciliation}: ${inline(operation.developmentBranch)}`,
    `- [${operation.phase === "completed" ? "x" : " "}] ${messages.cleanup}`,
  ];
}

function deploymentDiagram(messages: DeploymentMessages): string[] {
  const [source, prepared, production, accepted, publication, reconciliation, complete] = messages.diagram;
  return [
    "```mermaid", "flowchart LR", `    D[${source}] --> R[${prepared}]`, `    R --> P[${production}]`,
    `    P --> A[${accepted}]`, `    A --> N[${publication}]`, `    N --> B[${reconciliation}]`, `    B --> C[${complete}]`, "```", "", messages.fallback,
  ];
}

function transitionTable(operation: DeploymentOperationSnapshot, messages: DeploymentMessages): string[] {
  const activeTarget = operation.reconciliationTargets.find((target) => target.status !== "completed");
  const from = activeTarget?.syncBranch ?? activeTarget?.sourceBranch ?? operation.sourceBranch;
  const to = activeTarget?.targetBranch ?? operation.productionBranch;
  return [`| ${messages.from} | ${messages.to} | ${messages.state} |`, "|---|---|---|", `| ${inline(from)} | ${inline(to)} | ${inline(messages.phase[operation.phase])} |`];
}

function factTable(operation: DeploymentOperationSnapshot, messages: DeploymentMessages): string[] {
  return [
    `| ${messages.productionUpdated} | ${messages.alreadyPublished} | ${messages.developmentSynchronized} |`, "|---|---|---|",
    `| ${operation.productionSha ? messages.yes : messages.no} | ${operation.publicationVerified ? messages.yes : messages.no} | ${reconciliationCompleted(operation) ? messages.yes : messages.no} |`,
  ];
}

function protectedFact(operation: DeploymentOperationSnapshot, messages: DeploymentMessages): string {
  if (operation.publicationVerified) return `${messages.alreadyPublished}; ${messages.noRepublish}`;
  if (operation.productionSha) return `${messages.productionUpdated}: ${messages.yes}. ${messages.notPublished}.`;
  return `${messages.productionUpdated}: ${messages.no}. ${messages.notPublished}.`;
}

function nextDescription(operation: DeploymentOperationSnapshot, messages: DeploymentMessages): string {
  if (operation.phase === "blocked") {
    const diagnostic = safeText(operation.lastFailure?.message ?? messages.workflowFailure);
    return `${diagnostic}. ${messages.actionRequired}: ${operation.lastFailure?.retryable ? messages.retryAfterCorrection : messages.manualIntervention}.`;
  }
  if (operation.phase === "promotion_pr_pending") return messages.afterPromotion;
  if (operation.phase === "publishing" || operation.phase === "promoted") return messages.afterPromotion;
  if (operation.phase === "reconciliation_pending" || operation.phase === "published") return messages.noRepublish;
  if (operation.phase === "completed") return `${messages.productionUpdated}: ${messages.yes}. ${messages.developmentSynchronized}: ${messages.yes}.`;
  return `${messages.promotion}: ${inline(operation.sourceBranch)} -> ${inline(operation.productionBranch)}.`;
}

function deploymentAction(operation: DeploymentOperationSnapshot, messages: DeploymentMessages): { required: boolean; message: string } {
  const manual = (operation.selectedPrMode ?? operation.prMode) === "create-only"
    && (operation.phase === "promotion_pr_pending" || operation.phase === "reconciliation_pending");
  if (manual) return { required: true, message: `${messages.protectedChecks}: ${messages.reviewManagedPr}.` };
  if (operation.phase !== "blocked") return { required: false, message: messages.noAction };
  return {
    required: true,
    message: operation.lastFailure?.retryable
      ? `${safeText(operation.lastFailure.message)}. ${messages.retryAfterCorrection}.`
      : `${safeText(operation.lastFailure?.message ?? messages.workflowFailure)}. ${messages.manualIntervention}.`,
  };
}

function deploymentLinks(operation: DeploymentOperationSnapshot, context: DeploymentPresentationContext, messages: DeploymentMessages): string[] {
  const links = [`[${messages.controlCenter}](${issueUrl(context)})`];
  links.push(`[${safeText(operation.sourceBranch)} branch](${branchUrl(context, operation.sourceBranch)})`);
  links.push(`[${shortSha(operation.originSha)} origin commit](${commitUrl(context, operation.originSha)})`);
  links.push(`[${shortSha(operation.sourceSha)} prepared commit](${commitUrl(context, operation.sourceSha)})`);
  const activeTarget = operation.reconciliationTargets.find((target) => target.status !== "completed");
  links.push(`[${messages.compare}](${compareUrl(context, activeTarget?.targetBranch ?? operation.productionBranch, activeTarget?.syncBranch ?? activeTarget?.sourceBranch ?? operation.sourceBranch)})`);
  if (operation.promotionPullRequest) links.push(`[Promotion PR #${operation.promotionPullRequest}](${pullRequestUrl(context, operation.promotionPullRequest)})`);
  for (const target of operation.reconciliationTargets) {
    if (target.pullRequest) links.push(`[Reconciliation PR #${target.pullRequest}](${pullRequestUrl(context, target.pullRequest)})`);
  }
  if (operation.productionSha) links.push(`[${shortSha(operation.productionSha)} production commit](${commitUrl(context, operation.productionSha)})`);
  if (operation.publicationVerified) {
    links.push(`[${safeText(operation.tag)} GitHub Release](${repositoryUrl(context)}/releases/tag/${encodeURIComponent(operation.tag)})`);
    links.push(`[v${safeText(operation.version.split(".")[0])} Action tag](${branchUrl(context, `v${operation.version.split(".")[0]}`)})`);
    if (context.packageName) links.push(`[${safeText(context.packageName)}@${safeText(operation.version)} on npm](${npmVersionUrl(context.packageName, operation.version)})`);
  }
  if (context.workflowRunUrl) links.push(`[Workflow run](${safeUrl(context.workflowRunUrl)})`);
  return links;
}

function messagesFor(locale: string): DeploymentMessages { return normalizeLocale(locale) === "es-ES" ? ES : EN; }
export function normalizeLocale(locale: string): SupportedLocale { return locale.toLowerCase().startsWith("es") ? "es-ES" : "en-US"; }
function reconciliationCompleted(operation: DeploymentOperationSnapshot): boolean {
  return operation.phase === "completed"
    || (operation.reconciliationTargets.length > 0
      && operation.reconciliationTargets.every((target) => target.status === "completed"));
}
function phaseRank(phase: DeploymentPhase): number { return ["preparing", "promotion_pr_pending", "promoted", "publishing", "published", "reconciliation_pending", "completed"].indexOf(phase); }
function repositoryUrl(context: DeploymentPresentationContext): string { return `https://github.com/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repository)}`; }
function issueUrl(context: DeploymentPresentationContext): string { return `${repositoryUrl(context)}/issues/${context.issue}`; }
function pullRequestUrl(context: DeploymentPresentationContext, number: number): string { return `${repositoryUrl(context)}/pull/${number}`; }
function branchUrl(context: DeploymentPresentationContext, branch: string): string { return `${repositoryUrl(context)}/tree/${encodeURIComponent(branch)}`; }
function commitUrl(context: DeploymentPresentationContext, sha: string): string { return `${repositoryUrl(context)}/commit/${encodeURIComponent(sha)}`; }
function npmVersionUrl(packageName: string, version: string): string { return `https://www.npmjs.com/package/${encodeURIComponent(packageName)}/v/${encodeURIComponent(version)}`; }
function compareUrl(context: DeploymentPresentationContext, base: string, head: string): string { return `${repositoryUrl(context)}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`; }
function inline(value: string): string { return `\`${safeText(value)}\``; }
function safeText(value: string): string { return value.replace(/[\r\n`<>]/g, "").replace(/@/g, "@\u200b").replace(/::/g, "﹕﹕").slice(0, 240); }
function safeMarkerValue(value: string): string { return value.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 128); }
function safeUrl(value: string): string { return /^https:\/\/github\.com\//.test(value) ? value : "https://github.com"; }
function shortSha(value: string): string { return safeText(value).slice(0, 7); }
function capitalize(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1); }
