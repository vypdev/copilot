import * as yaml from "js-yaml";
import type {
  DeploymentGitPort,
  ManagedPullRequestCreate,
  ManagedPullRequestPort,
  ManagedPullRequestQuery,
  ManagedPullRequestRecord,
  TargetMergeInspectionOptions,
} from "../../../application/ports/deployment_orchestration_ports";
import type { TargetMergeCapabilities } from "../../../application/policies/deployment_plan_policy";
import type {
  MergeQueueObservationProblem,
  MergeQueueProducerEvidence,
  MergeQueueProducerSupport,
} from "../../../domain/merge_queue_readiness";
import { parseManagedPullRequestMarker } from "../../../domain/managed_pull_request";
import { redactSensitiveText } from "../../../domain/security/sensitive_text";
import type { GithubClientPort } from "../../../infrastructure/github/ports/github_client_provider_port";
import type {
  GithubDeploymentClient,
  GithubDeploymentPullRequest,
} from "../../../infrastructure/github/ports/github_deployment_provider_port";

export class GithubDeploymentRepository implements ManagedPullRequestPort, DeploymentGitPort {
  constructor(private readonly clientProvider: GithubClientPort<GithubDeploymentClient>) {}

  async findManagedPullRequests(query: ManagedPullRequestQuery): Promise<readonly ManagedPullRequestRecord[]> {
    const client = this.clientProvider.getClient(query.token);
    const pullRequests = await client.paginate(client.rest.pulls.list, {
      owner: query.owner,
      repo: query.repository,
      state: "all",
      head: `${query.owner}:${query.headBranch}`,
      base: query.baseBranch,
      per_page: 100,
    });
    return pullRequests
      .filter((pullRequest) => {
        const marker = parseManagedPullRequestMarker(pullRequest.body);
        return marker?.operationId === query.operationId
          && marker.phase === query.phase
          && marker.issue === query.issue;
      })
      .map((pullRequest) => mapPullRequest(pullRequest, query.owner, query.repository));
  }

  async createManagedPullRequest(command: ManagedPullRequestCreate): Promise<ManagedPullRequestRecord> {
    const client = this.clientProvider.getClient(command.token);
    const { data } = await client.rest.pulls.create({
      owner: command.owner,
      repo: command.repository,
      head: command.headBranch,
      base: command.baseBranch,
      title: command.title,
      body: command.body,
      maintainer_can_modify: false,
    });
    return mapPullRequest(data, command.owner, command.repository);
  }

  async getPullRequest(owner: string, repository: string, pullRequest: number, token: string): Promise<ManagedPullRequestRecord> {
    const { data } = await this.clientProvider.getClient(token).rest.pulls.get({
      owner,
      repo: repository,
      pull_number: pullRequest,
    });
    return mapPullRequest(data, owner, repository);
  }

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

  async enableAutoMerge(owner: string, repository: string, pullRequestNodeId: string, token: string): Promise<void> {
    await this.clientProvider.getClient(token).graphql(
      `mutation EnableDeploymentAutoMerge($pullRequestId: ID!) {
        enablePullRequestAutoMerge(input: {pullRequestId: $pullRequestId, mergeMethod: MERGE}) {
          pullRequest { id }
        }
      }`,
      { pullRequestId: pullRequestNodeId, owner, repository },
    );
  }

  async isPullRequestQueued(owner: string, repository: string, pullRequestNodeId: string, token: string): Promise<boolean> {
    const response = await this.clientProvider.getClient(token).graphql<{
      node?: { mergeQueueEntry?: { id?: string } | null } | null;
    }>(
      `query DeploymentPullRequestQueue($pullRequestId: ID!) {
        node(id: $pullRequestId) {
          ... on PullRequest { mergeQueueEntry { id } }
        }
      }`,
      { pullRequestId: pullRequestNodeId },
    );
    if (!response.node || !("mergeQueueEntry" in response.node)) {
      throw new Error("GitHub returned no authoritative merge-queue membership for the pull request.");
    }
    return Boolean(response.node.mergeQueueEntry?.id);
  }

  async enqueuePullRequest(
    owner: string,
    repository: string,
    pullRequestNodeId: string,
    expectedHeadSha: string,
    token: string,
  ): Promise<void> {
    const response = await this.clientProvider.getClient(token).graphql<{
      enqueuePullRequest?: { mergeQueueEntry?: { id?: string } | null } | null;
    }>(
      `mutation EnqueueDeploymentPullRequest($pullRequestId: ID!, $expectedHeadOid: GitObjectID!) {
        enqueuePullRequest(input: {pullRequestId: $pullRequestId, expectedHeadOid: $expectedHeadOid}) {
          mergeQueueEntry { id }
        }
      }`,
      { pullRequestId: pullRequestNodeId, expectedHeadOid: expectedHeadSha, owner, repository },
    );
    if (!response.enqueuePullRequest?.mergeQueueEntry?.id) {
      throw new Error("GitHub did not confirm that the pull request entered the merge queue.");
    }
  }

  async mergePullRequest(owner: string, repository: string, pullRequest: number, token: string): Promise<string> {
    const { data } = await this.clientProvider.getClient(token).rest.pulls.merge({
      owner,
      repo: repository,
      pull_number: pullRequest,
      merge_method: "merge",
    });
    if (!data.merged || !data.sha) throw new Error(data.message ?? `Pull request #${pullRequest} was not merged.`);
    return data.sha;
  }

  async getBranchSha(owner: string, repository: string, branch: string, token: string): Promise<string> {
    const { data } = await this.clientProvider.getClient(token).rest.git.getRef({ owner, repo: repository, ref: `heads/${branch}` });
    return data.object.sha;
  }

  async getMergeBaseSha(owner: string, repository: string, base: string, head: string, token: string): Promise<string> {
    const { data } = await this.clientProvider.getClient(token).rest.repos.compareCommits({ owner, repo: repository, base, head });
    const sha = data.merge_base_commit?.sha;
    if (!sha) throw new Error(`GitHub returned no merge base for ${base}...${head}.`);
    return sha;
  }

  async isCommitReachable(owner: string, repository: string, branch: string, sha: string, token: string): Promise<boolean> {
    const { data } = await this.clientProvider.getClient(token).rest.repos.compareCommits({ owner, repo: repository, base: sha, head: branch });
    return data.merge_base_commit?.sha === sha;
  }

  async createOrVerifyBranch(owner: string, repository: string, branch: string, sha: string, token: string): Promise<void> {
    const client = this.clientProvider.getClient(token);
    try {
      const { data } = await client.rest.git.getRef({ owner, repo: repository, ref: `heads/${branch}` });
      if (data.object.sha !== sha) {
        const { data: comparison } = await client.rest.repos.compareCommits({ owner, repo: repository, base: sha, head: branch });
        if (comparison.merge_base_commit?.sha !== sha) throw new Error(`Branch ${branch} already exists at a different SHA.`);
      }
    } catch (error) {
      if (!isNotFound(error)) throw error;
      await client.rest.git.createRef({ owner, repo: repository, ref: `refs/heads/${branch}`, sha });
    }
  }

  async mergeCommitIntoBranch(owner: string, repository: string, branch: string, sourceSha: string, token: string): Promise<string> {
    const client = this.clientProvider.getClient(token);
    const { data: comparison } = await client.rest.repos.compareCommits({ owner, repo: repository, base: sourceSha, head: branch });
    if (comparison.merge_base_commit?.sha === sourceSha) return await this.getBranchSha(owner, repository, branch, token);
    const { data } = await client.rest.repos.merge({
      owner,
      repo: repository,
      base: branch,
      head: sourceSha,
      commit_message: `chore(release): reconcile ${sourceSha.slice(0, 7)} into ${branch}`,
    });
    if (!data.merged || !data.sha) throw new Error(data.message ?? `Could not reconcile ${sourceSha} into ${branch}.`);
    return data.sha;
  }

  async deleteBranch(owner: string, repository: string, branch: string, token: string): Promise<void> {
    try {
      await this.clientProvider.getClient(token).rest.git.deleteRef({ owner, repo: repository, ref: `heads/${branch}` });
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  async listBranches(owner: string, repository: string, prefix: string, token: string): Promise<readonly string[]> {
    const client = this.clientProvider.getClient(token);
    const branches = await client.paginate(client.rest.repos.listBranches, { owner, repo: repository, per_page: 100 });
    return branches.map(({ name }) => name).filter((name) => name.startsWith(`${prefix}/`));
  }
}

function mapPullRequest(value: GithubDeploymentPullRequest, owner: string, repository: string): ManagedPullRequestRecord {
  return {
    number: value.number,
    nodeId: value.node_id,
    body: value.body ?? "",
    headBranch: value.head.ref,
    headSha: value.head.sha,
    baseBranch: value.base.ref,
    state: value.state === "closed" ? "closed" : "open",
    merged: value.merged === true,
    mergeCommitSha: value.merge_commit_sha ?? undefined,
    repositoryFullName: value.base.repo?.full_name ?? value.head.repo?.full_name ?? `${owner}/${repository}`,
  };
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
  const checks = new Map<string, RequiredCheck>();
  const workflows = new Map<string, RequiredWorkflow>();
  const problems: MergeQueueObservationProblem[] = [];
  const recordInvalidRule = (
    kind: "effective rule entry" | "required status check" | "required workflow",
    area: "classic-protection" | "effective-rules" = "effective-rules",
  ) => {
    if (problems.some((problem) => problem.area === area && problem.message.includes(kind))) return;
    problems.push({
      area,
      message: `GitHub returned an invalid ${kind}, so readiness cannot be proven.`,
    });
  };
  const addCheck = (context: unknown, integrationId: unknown, source: "classic" | "ruleset") => {
    if (typeof context !== "string" || !context.trim()) {
      recordInvalidRule("required status check", source === "classic" ? "classic-protection" : "effective-rules");
      return;
    }
    if (integrationId !== undefined
      && integrationId !== null
      && integrationId !== "any"
      && (typeof integrationId !== "number" || !Number.isSafeInteger(integrationId) || integrationId <= 0)) {
      recordInvalidRule("required status check", source === "classic" ? "classic-protection" : "effective-rules");
    }
    const normalizedId = typeof integrationId === "number" && Number.isSafeInteger(integrationId) && integrationId > 0
      ? integrationId
      : "any";
    const check = { context: context.trim(), integrationId: normalizedId } as const;
    checks.set(`${check.context}\0${check.integrationId}`, check);
  };
  const classicStatusChecks = protection?.required_status_checks;
  if (classicStatusChecks !== undefined && classicStatusChecks !== null
    && (typeof classicStatusChecks !== "object" || Array.isArray(classicStatusChecks))) {
    recordInvalidRule("required status check", "classic-protection");
  }
  const classicChecks: unknown = classicStatusChecks && typeof classicStatusChecks === "object"
    ? classicStatusChecks.checks
    : undefined;
  if (classicChecks !== undefined && !Array.isArray(classicChecks)) {
    recordInvalidRule("required status check", "classic-protection");
  }
  for (const rawCheck of Array.isArray(classicChecks) ? classicChecks : []) {
    if (!rawCheck || typeof rawCheck !== "object" || Array.isArray(rawCheck)) {
      recordInvalidRule("required status check", "classic-protection");
      continue;
    }
    const check = rawCheck as { context?: unknown; app_id?: unknown };
    addCheck(check.context, check.app_id, "classic");
  }
  const classicContexts: unknown = classicStatusChecks && typeof classicStatusChecks === "object"
    ? classicStatusChecks.contexts
    : undefined;
  if (classicContexts !== undefined && !Array.isArray(classicContexts)) {
    recordInvalidRule("required status check", "classic-protection");
  }
  for (const context of Array.isArray(classicContexts) ? classicContexts : []) {
    if (![...checks.values()].some((check) => check.context === context)) addCheck(context, "any", "classic");
  }
  let strict = classicStatusChecks !== null
    && typeof classicStatusChecks === "object"
    && !Array.isArray(classicStatusChecks)
    && classicStatusChecks.strict === true;
  if (classicStatusChecks !== null
    && typeof classicStatusChecks === "object"
    && !Array.isArray(classicStatusChecks)
    && classicStatusChecks.strict !== undefined
    && typeof classicStatusChecks.strict !== "boolean") {
    recordInvalidRule("required status check", "classic-protection");
  }
  let mergeQueueRequired = false;
  for (const rawRule of rules as readonly unknown[]) {
    if (!rawRule || typeof rawRule !== "object" || Array.isArray(rawRule)) {
      recordInvalidRule("effective rule entry");
      continue;
    }
    const rule = rawRule as GithubEffectiveRule;
    if (typeof rule.type !== "string" || !rule.type) {
      recordInvalidRule("effective rule entry");
      continue;
    }
    if (rule.type === "merge_queue") mergeQueueRequired = true;
    if (rule.type === "required_status_checks") {
      strict ||= rule.parameters?.strict_required_status_checks_policy === true;
      if (rule.parameters?.strict_required_status_checks_policy !== undefined
        && typeof rule.parameters.strict_required_status_checks_policy !== "boolean") {
        recordInvalidRule("required status check");
      }
      const requiredChecks: unknown = rule.parameters?.required_status_checks;
      if (!Array.isArray(requiredChecks)) {
        recordInvalidRule("required status check");
      } else {
        for (const rawCheck of requiredChecks) {
          if (!rawCheck || typeof rawCheck !== "object" || Array.isArray(rawCheck)) {
            recordInvalidRule("required status check");
            continue;
          }
          const check = rawCheck as { context?: unknown; integration_id?: unknown };
          addCheck(check.context, check.integration_id, "ruleset");
        }
      }
    }
    if (rule.type === "workflows") {
      const requiredWorkflows: unknown = rule.parameters?.workflows;
      if (!Array.isArray(requiredWorkflows)) {
        recordInvalidRule("required workflow");
        continue;
      }
      for (const rawWorkflow of requiredWorkflows) {
        if (!rawWorkflow || typeof rawWorkflow !== "object" || Array.isArray(rawWorkflow)) {
          recordInvalidRule("required workflow");
          continue;
        }
        const workflow = rawWorkflow as Record<string, unknown>;
        if (typeof workflow.path !== "string"
          || !workflow.path.trim()
          || typeof workflow.repository_id !== "number"
          || !Number.isSafeInteger(workflow.repository_id)
          || workflow.repository_id <= 0
          || (workflow.ref !== undefined && (typeof workflow.ref !== "string" || !workflow.ref.trim()))
          || (workflow.sha !== undefined && (typeof workflow.sha !== "string" || !/^[a-f0-9]{40}$/i.test(workflow.sha)))) {
          recordInvalidRule("required workflow");
          continue;
        }
        const normalized = {
          path: workflow.path,
          repositoryId: workflow.repository_id,
          ...(typeof workflow.ref === "string" ? { ref: workflow.ref } : {}),
          ...(typeof workflow.sha === "string" ? { sha: workflow.sha } : {}),
        };
        workflows.set(
          `${normalized.repositoryId}\0${normalized.path}\0${normalized.ref ?? ""}\0${normalized.sha ?? ""}`,
          normalized,
        );
      }
    }
  }
  return {
    mergeQueueRequired,
    requiresStrictStatusChecks: strict,
    requiredChecks: [...checks.values()],
    requiredWorkflows: [...workflows.values()],
    problems,
  };
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
        entries?: readonly {
          name?: string;
          type?: string;
          object?: { text?: string | null; byteSize?: number; isBinary?: boolean };
        }[];
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
    if (entry.type !== "blob"
      || typeof entry.name !== "string"
      || !/\.ya?ml$/i.test(entry.name)
      || entry.object?.isBinary
      || typeof entry.object?.text !== "string") continue;
    const actualBytes = new TextEncoder().encode(entry.object.text).byteLength;
    if (typeof entry.object.byteSize !== "number"
      || !Number.isSafeInteger(entry.object.byteSize)
      || entry.object.byteSize < 0
      || entry.object.byteSize > 1_000_000
      || actualBytes > 1_000_000) {
      parseFailures.push(entry.name);
      continue;
    }
    try {
      contracts.push(parseWorkflowContract(`.github/workflows/${entry.name}`, entry.object.text));
    } catch {
      parseFailures.push(entry.name);
    }
  }
  return { ref, contracts, parseFailures };
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
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("GitHub did not return one workflow file.");
  const file = data as { content?: unknown; encoding?: unknown; size?: unknown };
  if (file.encoding !== "base64" || typeof file.content !== "string") throw new Error("Workflow content is unavailable.");
  if (typeof file.size !== "number" || !Number.isSafeInteger(file.size) || file.size < 0) {
    throw new Error("Workflow size metadata is unavailable.");
  }
  if (file.size > 1_000_000) throw new Error("Workflow file exceeds the 1 MB inspection limit.");
  const encoded = file.content.replace(/\s/g, "");
  if (encoded.length > 1_400_000 || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error("Workflow content is not valid bounded base64.");
  }
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.byteLength > 1_000_000) throw new Error("Workflow file exceeds the 1 MB inspection limit.");
  if (decoded.byteLength !== file.size) throw new Error("Workflow size metadata does not match its content.");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(decoded);
  } catch {
    throw new Error("Workflow content is not valid UTF-8.");
  }
}

function parseWorkflowContract(path: string, content: string): WorkflowContract {
  const parsed = yaml.load(content, { schema: yaml.JSON_SCHEMA });
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Workflow YAML must be an object.");
  const workflow = parsed as Record<string, unknown>;
  const jobs = workflow.jobs && typeof workflow.jobs === "object" && !Array.isArray(workflow.jobs)
    ? workflow.jobs as Record<string, unknown>
    : {};
  const jobNames: string[] = [];
  for (const [jobId, value] of Object.entries(jobs)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const job = value as Record<string, unknown>;
    if (typeof job.uses === "string") continue;
    if (job.strategy
      && typeof job.strategy === "object"
      && !Array.isArray(job.strategy)
      && "matrix" in job.strategy) continue;
    if (typeof job.name === "string") {
      if (!job.name.includes("${{")) jobNames.push(job.name);
    } else {
      jobNames.push(jobId);
    }
  }
  return {
    path,
    jobNames,
    mergeGroupSupported: hasMergeGroupTrigger(workflow.on),
  };
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
