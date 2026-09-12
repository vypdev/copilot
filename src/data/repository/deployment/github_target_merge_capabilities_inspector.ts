import * as yaml from "js-yaml";
import type {
  TargetMergeInspectionOptions,
  TargetMergePolicyInspectionPort,
} from "../../../application/ports/deployment_orchestration_ports";
import type { TargetMergeCapabilities } from "../../../application/policies/deployment_plan_policy";
import type {
  MergeQueueObservationProblem,
  MergeQueueProducerEvidence,
  MergeQueueProducerSupport,
} from "../../../domain/merge_queue_readiness";
import { redactSensitiveText } from "../../../domain/security/sensitive_text";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type { GithubDeploymentClient } from "../../../infrastructure/github/ports/github_deployment_provider_port";

export class GithubTargetMergeCapabilitiesInspector implements TargetMergePolicyInspectionPort {
  constructor(private readonly clientProvider: GithubClientPort<GithubDeploymentClient>) {}

  async getTargetCapabilities(
    owner: string,
    repository: string,
    targetBranch: string,
    token: string,
    options: TargetMergeInspectionOptions = {},
  ): Promise<TargetMergeCapabilities> {
    const client = this.clientProvider.getClient(token);
    const [{ data: repositoryData }, classic, rulesets, queue, pullRequestState] = await Promise.all([
      client.rest.repos.get({ owner, repo: repository }),
      observeClassicProtection(client, owner, repository, targetBranch),
      observeEffectiveRules(client, owner, repository, targetBranch),
      observeClassicMergeQueue(client, owner, repository, targetBranch),
      options.pullRequest === undefined
        ? Promise.resolve(undefined)
        : client.rest.pulls.get({ owner, repo: repository, pull_number: options.pullRequest }).then(({ data }) => data),
    ]);
    const candidateProblem = options.candidateHeadSha !== undefined && !/^[a-f0-9]{40}$/i.test(options.candidateHeadSha)
      ? {
          area: "workflow-contract" as const,
          message: "The candidate head SHA is invalid, so its workflow contract cannot be inspected.",
        }
      : undefined;
    const candidateHeadChangedProblem = options.candidateHeadSha !== undefined
      && candidateProblem === undefined
      && pullRequestState !== undefined
      && pullRequestState.head.sha !== options.candidateHeadSha
      ? {
          area: "workflow-contract" as const,
          message: "The pull request head changed during readiness inspection, so the observed workflow contract is stale.",
        }
      : undefined;
    const effective = normalizeEffectiveRules(classic.value, rulesets.value);
    const problems = [classic.problem, rulesets.problem, queue.problem, candidateProblem, candidateHeadChangedProblem, ...effective.problems]
      .filter((problem): problem is MergeQueueObservationProblem => problem !== undefined);
    const mergeQueueRequired = queue.value === true || effective.mergeQueueRequired;
    const candidateHeadSha = options.candidateHeadSha ?? pullRequestState?.head.sha;
    const producerInspection = mergeQueueRequired
      ? await inspectMergeQueueProducers(
          client,
          owner,
          repository,
          repositoryData.id,
          targetBranch,
          candidateHeadSha,
          effective.requiredChecks,
          effective.requiredWorkflows,
        )
      : { producers: [] as MergeQueueProducerEvidence[], problems: [] as MergeQueueObservationProblem[] };
    return {
      autoMergeAllowed: repositoryData.allow_auto_merge === true,
      mergeQueueRequired,
      immediatelyMergeable: pullRequestState?.mergeable === true && pullRequestState.mergeable_state === "clean",
      requiresStrictStatusChecks: effective.requiresStrictStatusChecks,
      mergeQueueProducers: producerInspection.producers,
      mergeQueueObservationProblems: [...problems, ...producerInspection.problems],
    };
  }
}

interface GithubBranchProtection {
  readonly required_status_checks?: {
    readonly strict?: boolean;
    readonly contexts?: readonly string[];
    readonly checks?: readonly { readonly context: string; readonly app_id?: number | null }[];
  } | null;
}

interface GithubEffectiveRule {
  readonly type?: string;
  readonly ruleset_id?: number;
  readonly parameters?: {
    readonly strict_required_status_checks_policy?: boolean;
    readonly required_status_checks?: readonly {
      readonly context?: string;
      readonly integration_id?: number | null;
    }[];
    readonly workflows?: readonly {
      readonly path?: string;
      readonly ref?: string;
      readonly repository_id?: number;
      readonly sha?: string;
    }[];
  };
}

interface RequiredCheck {
  readonly context: string;
  readonly integrationId: number | "any";
}

interface RequiredWorkflow {
  readonly path: string;
  readonly ref?: string;
  readonly repositoryId: number;
  readonly sha?: string;
}

interface NormalizedEffectiveRules {
  readonly mergeQueueRequired: boolean;
  readonly requiresStrictStatusChecks: boolean;
  readonly requiredChecks: readonly RequiredCheck[];
  readonly requiredWorkflows: readonly RequiredWorkflow[];
  readonly problems: readonly MergeQueueObservationProblem[];
}

interface WorkflowContract {
  readonly path: string;
  readonly jobNames: readonly string[];
  readonly mergeGroupSupported: boolean;
}

interface WorkflowSnapshot {
  readonly ref: string;
  readonly contracts: readonly WorkflowContract[];
  readonly parseFailures: readonly string[];
}

interface GithubWorkflowTreeEntry {
  readonly name?: string;
  readonly type?: string;
  readonly object?: { readonly text?: string | null; readonly byteSize?: number; readonly isBinary?: boolean };
}

async function observeClassicProtection(
  client: GithubDeploymentClient,
  owner: string,
  repository: string,
  branch: string,
): Promise<{ readonly value?: GithubBranchProtection; readonly problem?: MergeQueueObservationProblem }> {
  try {
    const { data } = await client.rest.repos.getBranchProtection({ owner, repo: repository, branch });
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("GitHub returned an invalid classic branch-protection response.");
    }
    return { value: data };
  } catch (error) {
    if (isNotFound(error)) return { value: undefined };
    return {
      value: undefined,
      problem: {
        area: "classic-protection",
        message: `Could not read classic branch protection: ${safeProviderError(error)}`,
      },
    };
  }
}

async function observeEffectiveRules(
  client: GithubDeploymentClient,
  owner: string,
  repository: string,
  branch: string,
): Promise<{ readonly value: readonly GithubEffectiveRule[]; readonly problem?: MergeQueueObservationProblem }> {
  try {
    const { data } = await client.request<readonly GithubEffectiveRule[]>(
      "GET /repos/{owner}/{repo}/rules/branches/{branch}",
      { owner, repo: repository, branch },
    );
    if (!Array.isArray(data)) throw new Error("GitHub returned a non-array effective-rules response.");
    if (data.length > 1_000) throw new Error("GitHub returned more than 1000 effective rules.");
    return { value: data };
  } catch (error) {
    return {
      value: [],
      problem: {
        area: "effective-rules",
        message: `Could not read active rulesets: ${safeProviderError(error)}`,
      },
    };
  }
}

async function observeClassicMergeQueue(
  client: GithubDeploymentClient,
  owner: string,
  repository: string,
  branch: string,
): Promise<{ readonly value: boolean; readonly problem?: MergeQueueObservationProblem }> {
  try {
    const response = await client.graphql<{
      repository?: { ref?: { branchProtectionRule?: { requiresMergeQueue?: boolean } | null } | null };
    }>(
      `query DeploymentTargetRules($owner: String!, $repository: String!, $qualifiedName: String!) {
        repository(owner: $owner, name: $repository) {
          ref(qualifiedName: $qualifiedName) { branchProtectionRule { requiresMergeQueue } }
        }
      }`,
      { owner, repository, qualifiedName: `refs/heads/${branch}` },
    );
    const ref = response.repository?.ref;
    if (!ref) throw new Error("GitHub returned no target ref while reading the classic merge-queue rule.");
    const rule = ref.branchProtectionRule;
    if (rule === null) return { value: false };
    if (rule === undefined) throw new Error("GitHub omitted the classic merge-queue rule from its response.");
    if (typeof rule.requiresMergeQueue !== "boolean") {
      throw new Error("GitHub returned an invalid classic merge-queue rule.");
    }
    return { value: rule.requiresMergeQueue };
  } catch (error) {
    return {
      value: false,
      problem: {
        area: "classic-protection",
        message: `Could not read the classic merge-queue rule: ${safeProviderError(error)}`,
      },
    };
  }
}

function normalizeEffectiveRules(
  protection: GithubBranchProtection | undefined,
  rules: readonly GithubEffectiveRule[],
): NormalizedEffectiveRules {
  return new EffectiveRulesNormalizer().normalize(protection, rules);
}

type InvalidRuleKind = "effective rule entry" | "required status check" | "required workflow";
type RuleProblemArea = "classic-protection" | "effective-rules";

class EffectiveRulesNormalizer {
  private readonly checks = new Map<string, RequiredCheck>();
  private readonly workflows = new Map<string, RequiredWorkflow>();
  private readonly problems: MergeQueueObservationProblem[] = [];
  private mergeQueueRequired = false;
  private requiresStrictStatusChecks = false;

  normalize(
    protection: GithubBranchProtection | undefined,
    rules: readonly GithubEffectiveRule[],
  ): NormalizedEffectiveRules {
    this.normalizeClassicProtection(protection?.required_status_checks);
    for (const rule of rules as readonly unknown[]) this.normalizeEffectiveRule(rule);
    return {
      mergeQueueRequired: this.mergeQueueRequired,
      requiresStrictStatusChecks: this.requiresStrictStatusChecks,
      requiredChecks: [...this.checks.values()],
      requiredWorkflows: [...this.workflows.values()],
      problems: this.problems,
    };
  }

  private normalizeClassicProtection(value: unknown): void {
    if (value === undefined || value === null) return;
    if (!isRecord(value)) {
      this.recordInvalid("required status check", "classic-protection");
      return;
    }
    this.normalizeStrictFlag(value.strict, "classic-protection");
    this.normalizeClassicChecks(value.checks);
    this.normalizeClassicContexts(value.contexts);
  }

  private normalizeClassicChecks(value: unknown): void {
    if (value === undefined) return;
    if (!Array.isArray(value)) {
      this.recordInvalid("required status check", "classic-protection");
      return;
    }
    for (const rawCheck of value) {
      if (!isRecord(rawCheck)) {
        this.recordInvalid("required status check", "classic-protection");
        continue;
      }
      this.addCheck(rawCheck.context, rawCheck.app_id, "classic-protection");
    }
  }

  private normalizeClassicContexts(value: unknown): void {
    if (value === undefined) return;
    if (!Array.isArray(value)) {
      this.recordInvalid("required status check", "classic-protection");
      return;
    }
    for (const context of value) {
      if (!this.hasCheckContext(context)) this.addCheck(context, "any", "classic-protection");
    }
  }

  private normalizeEffectiveRule(value: unknown): void {
    if (!isRecord(value) || typeof value.type !== "string" || value.type.length === 0) {
      this.recordInvalid("effective rule entry");
      return;
    }
    if (value.type === "merge_queue") this.mergeQueueRequired = true;
    if (value.type === "required_status_checks") this.normalizeRequiredChecks(value.parameters);
    if (value.type === "workflows") this.normalizeRequiredWorkflows(value.parameters);
  }

  private normalizeRequiredChecks(parameters: unknown): void {
    const values = isRecord(parameters) ? parameters : {};
    this.normalizeStrictFlag(values.strict_required_status_checks_policy, "effective-rules");
    const checks = values.required_status_checks;
    if (!Array.isArray(checks)) {
      this.recordInvalid("required status check");
      return;
    }
    for (const rawCheck of checks) {
      if (!isRecord(rawCheck)) {
        this.recordInvalid("required status check");
        continue;
      }
      this.addCheck(rawCheck.context, rawCheck.integration_id, "effective-rules");
    }
  }

  private normalizeRequiredWorkflows(parameters: unknown): void {
    const workflows = isRecord(parameters) ? parameters.workflows : undefined;
    if (!Array.isArray(workflows)) {
      this.recordInvalid("required workflow");
      return;
    }
    for (const workflow of workflows) this.addWorkflow(workflow);
  }

  private addWorkflow(value: unknown): void {
    if (!isRecord(value) || !isValidRequiredWorkflow(value)) {
      this.recordInvalid("required workflow");
      return;
    }
    const workflow: RequiredWorkflow = {
      path: value.path,
      repositoryId: value.repository_id,
      ...(typeof value.ref === "string" ? { ref: value.ref } : {}),
      ...(typeof value.sha === "string" ? { sha: value.sha } : {}),
    };
    this.workflows.set(
      `${workflow.repositoryId}\0${workflow.path}\0${workflow.ref ?? ""}\0${workflow.sha ?? ""}`,
      workflow,
    );
  }

  private addCheck(context: unknown, integrationId: unknown, area: RuleProblemArea): void {
    if (typeof context !== "string" || !context.trim()) {
      this.recordInvalid("required status check", area);
      return;
    }
    if (!isValidIntegrationId(integrationId)) this.recordInvalid("required status check", area);
    const normalizedId = typeof integrationId === "number"
      && Number.isSafeInteger(integrationId)
      && integrationId > 0
      ? integrationId
      : "any";
    const check: RequiredCheck = { context: context.trim(), integrationId: normalizedId };
    this.checks.set(`${check.context}\0${check.integrationId}`, check);
  }

  private normalizeStrictFlag(value: unknown, area: RuleProblemArea): void {
    if (value === true) this.requiresStrictStatusChecks = true;
    if (value !== undefined && typeof value !== "boolean") {
      this.recordInvalid("required status check", area);
    }
  }

  private hasCheckContext(value: unknown): boolean {
    return [...this.checks.values()].some((check) => check.context === value);
  }

  private recordInvalid(kind: InvalidRuleKind, area: RuleProblemArea = "effective-rules"): void {
    if (this.problems.some((problem) => problem.area === area && problem.message.includes(kind))) return;
    this.problems.push({
      area,
      message: `GitHub returned an invalid ${kind}, so readiness cannot be proven.`,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidIntegrationId(value: unknown): boolean {
  return value === undefined
    || value === null
    || value === "any"
    || (typeof value === "number" && Number.isSafeInteger(value) && value > 0);
}

function isValidRequiredWorkflow(value: Record<string, unknown>): value is Record<string, unknown> & {
  readonly path: string;
  readonly repository_id: number;
} {
  return typeof value.path === "string"
    && value.path.trim().length > 0
    && typeof value.repository_id === "number"
    && Number.isSafeInteger(value.repository_id)
    && value.repository_id > 0
    && (value.ref === undefined || (typeof value.ref === "string" && value.ref.trim().length > 0))
    && (value.sha === undefined || (typeof value.sha === "string" && /^[a-f0-9]{40}$/i.test(value.sha)));
}

async function inspectMergeQueueProducers(
  client: GithubDeploymentClient,
  owner: string,
  repository: string,
  repositoryId: number,
  targetBranch: string,
  candidateHeadSha: string | undefined,
  requiredChecks: readonly RequiredCheck[],
  requiredWorkflows: readonly RequiredWorkflow[],
): Promise<{
  readonly producers: readonly MergeQueueProducerEvidence[];
  readonly problems: readonly MergeQueueObservationProblem[];
}> {
  let githubActionsAppId: number | undefined;
  let appLookupFailure: string | undefined;
  if (requiredChecks.some((check) => check.integrationId !== "any")) {
    try {
      githubActionsAppId = (await client.rest.apps.getBySlug({ app_slug: "github-actions" })).data.id;
    } catch (error) {
      appLookupFailure = `Could not resolve the GitHub Actions app identity: ${safeProviderError(error)}`;
    }
  }
  const refs = [...new Set([
    targetBranch,
    ...(candidateHeadSha && /^[a-f0-9]{40}$/i.test(candidateHeadSha) ? [candidateHeadSha] : []),
  ])];
  const needsWorkflowSnapshots = requiredChecks.some((check) => check.integrationId === githubActionsAppId);
  const snapshots: WorkflowSnapshot[] = [];
  const problems: MergeQueueObservationProblem[] = [];
  if (needsWorkflowSnapshots) {
    const observations = await Promise.allSettled(
      refs.map((ref) => readRepositoryWorkflowSnapshot(client, owner, repository, ref)),
    );
    observations.forEach((observation, index) => {
      if (observation.status === "fulfilled") snapshots.push(observation.value);
      else {
        problems.push({
          area: "workflow-contract",
          message: `Could not inspect repository workflows at ${refs[index]}: ${safeProviderError(observation.reason)}`,
        });
      }
    });
  }
  const checkProducers = requiredChecks.map((check): MergeQueueProducerEvidence => {
    if (check.integrationId !== githubActionsAppId || githubActionsAppId === undefined) {
      return {
        kind: "check",
        name: check.context,
        integrationId: check.integrationId,
        support: "unknown",
        reason: appLookupFailure
          ?? (check.integrationId === "any"
            ? "The required check accepts any source, so its merge-group producer cannot be identified automatically."
            : `Integration ${check.integrationId} is not GitHub Actions and requires an exact operator attestation.`),
      };
    }
    return inspectGithubActionsCheck(check, refs, snapshots);
  });
  const workflowProducers = await Promise.all(
    requiredWorkflows.map((workflow) =>
      inspectRequiredWorkflow(client, owner, repository, repositoryId, targetBranch, workflow)),
  );
  return { producers: [...checkProducers, ...workflowProducers], problems };
}

function inspectGithubActionsCheck(
  check: RequiredCheck,
  refs: readonly string[],
  snapshots: readonly WorkflowSnapshot[],
): MergeQueueProducerEvidence {
  const verdicts = refs.map((ref): { support: MergeQueueProducerSupport; reason: string } => {
    const snapshot = snapshots.find((candidate) => candidate.ref === ref);
    if (!snapshot) return { support: "unknown", reason: `Workflow definitions at ${ref} were not available.` };
    const matches = snapshot.contracts.filter((contract) => contract.jobNames.includes(check.context));
    if (matches.length === 0) {
      return {
        support: "unknown",
        reason: snapshot.parseFailures.length > 0
          ? `No exact static job match was found at ${ref}; ${snapshot.parseFailures.length} workflow file(s) could not be parsed.`
          : `No exact static workflow job named ${check.context} was found at ${ref}.`,
      };
    }
    const supported = matches.filter((contract) => contract.mergeGroupSupported);
    return supported.length > 0
      ? { support: "supported", reason: `${supported.map((contract) => contract.path).join(", ")} handles merge_group.checks_requested at ${ref}.` }
      : { support: "unsupported", reason: `${matches.map((contract) => contract.path).join(", ")} does not handle merge_group.checks_requested at ${ref}.` };
  });
  const support: MergeQueueProducerSupport = verdicts.some((verdict) => verdict.support === "unsupported")
    ? "unsupported"
    : verdicts.some((verdict) => verdict.support === "unknown")
      ? "unknown"
      : "supported";
  return {
    kind: "check",
    name: check.context,
    integrationId: check.integrationId,
    support,
    reason: verdicts.map((verdict) => verdict.reason).join(" "),
  };
}

async function readRepositoryWorkflowSnapshot(
  client: GithubDeploymentClient,
  owner: string,
  repository: string,
  ref: string,
): Promise<WorkflowSnapshot> {
  const expression = `${ref}:.github/workflows`;
  const response = await client.graphql<{
    repository?: {
      object?: {
        entries?: readonly GithubWorkflowTreeEntry[];
      } | null;
    };
  }>(
    `query DeploymentWorkflowContracts($owner: String!, $repository: String!, $expression: String!) {
      repository(owner: $owner, name: $repository) {
        object(expression: $expression) {
          ... on Tree {
            entries {
              name
              type
              object {
                ... on Blob { text byteSize isBinary }
              }
            }
          }
        }
      }
    }`,
    { owner, repository, expression },
  );
  const entries = response.repository?.object?.entries;
  if (!Array.isArray(entries)) throw new Error("GitHub returned no valid .github/workflows tree.");
  if (entries.length > 500) throw new Error("GitHub returned more than 500 workflow entries.");
  const contracts: WorkflowContract[] = [];
  const parseFailures: string[] = [];
  for (const entry of entries) {
    const observation = inspectWorkflowTreeEntry(entry);
    if (observation.kind === "contract") contracts.push(observation.contract);
    if (observation.kind === "failure") parseFailures.push(observation.name);
  }
  return { ref, contracts, parseFailures };
}

function inspectWorkflowTreeEntry(entry: GithubWorkflowTreeEntry):
  | { readonly kind: "ignored" }
  | { readonly kind: "failure"; readonly name: string }
  | { readonly kind: "contract"; readonly contract: WorkflowContract } {
  if (!isInspectableWorkflowEntry(entry)) return { kind: "ignored" };
  const actualBytes = new TextEncoder().encode(entry.object.text).byteLength;
  if (!isValidWorkflowSize(entry.object.byteSize, actualBytes)) {
    return { kind: "failure", name: entry.name };
  }
  try {
    return {
      kind: "contract",
      contract: parseWorkflowContract(`.github/workflows/${entry.name}`, entry.object.text),
    };
  } catch {
    return { kind: "failure", name: entry.name };
  }
}

function isInspectableWorkflowEntry(entry: GithubWorkflowTreeEntry): entry is {
  readonly name: string;
  readonly type: "blob";
  readonly object: { readonly text: string; readonly byteSize?: number; readonly isBinary?: false };
} {
  return entry.type === "blob"
    && typeof entry.name === "string"
    && /\.ya?ml$/i.test(entry.name)
    && entry.object?.isBinary !== true
    && typeof entry.object?.text === "string";
}

function isValidWorkflowSize(size: unknown, actualBytes: number): boolean {
  return typeof size === "number"
    && Number.isSafeInteger(size)
    && size >= 0
    && size <= 1_000_000
    && actualBytes <= 1_000_000;
}

async function inspectRequiredWorkflow(
  client: GithubDeploymentClient,
  owner: string,
  repository: string,
  repositoryId: number,
  targetBranch: string,
  workflow: RequiredWorkflow,
): Promise<MergeQueueProducerEvidence> {
  const name = `${workflow.path} (repository ${workflow.repositoryId})`;
  try {
    if (!isSafeWorkflowPath(workflow.path)) throw new Error("Required workflow path is unsafe or unsupported.");
    let workflowOwner = owner;
    let workflowRepository = repository;
    if (workflow.repositoryId !== repositoryId) {
      const { data } = await client.request<{ full_name?: string }>(
        "GET /repositories/{repository_id}",
        { repository_id: workflow.repositoryId },
      );
      const [resolvedOwner, resolvedRepository, extra] = String(data.full_name ?? "").split("/");
      if (!resolvedOwner || !resolvedRepository || extra) throw new Error("Required workflow repository identity is unavailable.");
      workflowOwner = resolvedOwner;
      workflowRepository = resolvedRepository;
    }
    const ref = workflow.sha ?? workflow.ref ?? targetBranch;
    const { data } = await client.rest.repos.getContent({
      owner: workflowOwner,
      repo: workflowRepository,
      path: workflow.path,
      ref,
    });
    const text = decodeWorkflowContent(data);
    const contract = parseWorkflowContract(workflow.path, text);
    return {
      kind: "workflow",
      name,
      path: workflow.path,
      support: contract.mergeGroupSupported ? "supported" : "unsupported",
      reason: contract.mergeGroupSupported
        ? `${workflow.path} handles merge_group.checks_requested at ${ref}.`
        : `${workflow.path} does not handle merge_group.checks_requested at ${ref}.`,
    };
  } catch (error) {
    return {
      kind: "workflow",
      name,
      path: workflow.path,
      support: "unknown",
      reason: `The required workflow could not be verified: ${safeProviderError(error)}`,
    };
  }
}

function decodeWorkflowContent(data: unknown): string {
  const file = requireEncodedWorkflowFile(data);
  if (file.size > 1_000_000) throw new Error("Workflow file exceeds the 1 MB inspection limit.");
  const encoded = file.content.replace(/\s/g, "");
  if (!isBoundedBase64(encoded)) {
    throw new Error("Workflow content is not valid bounded base64.");
  }
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.byteLength > 1_000_000) throw new Error("Workflow file exceeds the 1 MB inspection limit.");
  if (decoded.byteLength !== file.size) throw new Error("Workflow size metadata does not match its content.");
  return decodeUtf8(decoded);
}

function requireEncodedWorkflowFile(data: unknown): { readonly content: string; readonly size: number } {
  if (!isRecord(data)) throw new Error("GitHub did not return one workflow file.");
  if (data.encoding !== "base64" || typeof data.content !== "string") {
    throw new Error("Workflow content is unavailable.");
  }
  if (typeof data.size !== "number" || !Number.isSafeInteger(data.size) || data.size < 0) {
    throw new Error("Workflow size metadata is unavailable.");
  }
  return { content: data.content, size: data.size };
}

function isBoundedBase64(value: string): boolean {
  return value.length <= 1_400_000
    && value.length % 4 === 0
    && /^[A-Za-z0-9+/]*={0,2}$/.test(value);
}

function decodeUtf8(value: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    throw new Error("Workflow content is not valid UTF-8.");
  }
}

function parseWorkflowContract(path: string, content: string): WorkflowContract {
  const parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA });
  if (!isRecord(parsed)) throw new Error("Workflow YAML must be an object.");
  const jobs = isRecord(parsed.jobs) ? parsed.jobs : {};
  const jobNames = Object.entries(jobs)
    .map(([jobId, value]) => staticWorkflowJobName(jobId, value))
    .filter((name): name is string => name !== undefined);
  return {
    path,
    jobNames,
    mergeGroupSupported: hasMergeGroupTrigger(parsed.on),
  };
}

function staticWorkflowJobName(jobId: string, value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.uses === "string") return undefined;
  if (isRecord(value.strategy) && "matrix" in value.strategy) return undefined;
  if (typeof value.name !== "string") return jobId;
  return value.name.includes("${{") ? undefined : value.name;
}

function hasMergeGroupTrigger(value: unknown): boolean {
  if (value === "merge_group") return true;
  if (Array.isArray(value)) return value.includes("merge_group");
  if (!value || typeof value !== "object") return false;
  const triggers = value as Record<string, unknown>;
  if (!("merge_group" in triggers)) return false;
  const mergeGroup = triggers.merge_group;
  if (mergeGroup === null || mergeGroup === "") return true;
  if (!mergeGroup || typeof mergeGroup !== "object" || Array.isArray(mergeGroup)) return false;
  const types = (mergeGroup as Record<string, unknown>).types;
  return types === undefined
    || types === "checks_requested"
    || (Array.isArray(types) && types.includes("checks_requested"));
}

function isSafeWorkflowPath(value: string): boolean {
  return value.length <= 255
    && /^\.github\/workflows\/[A-Za-z0-9._/-]+\.ya?ml$/i.test(value)
    && !value.includes("..");
}

function safeProviderError(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message)
      : String(error);
  return redactSensitiveText(message)
    .replace(/[\r\n<>]/g, " ")
    .replace(/::/g, "﹕﹕")
    .replace(/@/g, "@\u200b")
    .slice(0, 240);
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && (error as { status?: number }).status === 404;
}
