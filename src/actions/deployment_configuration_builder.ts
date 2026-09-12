import { ApplicationError } from "../application/errors/application_error";
import {
  DEFAULT_DEPLOYMENT_CONFIGURATION,
  HOTFIX_ACTIVE_RELEASE_POLICIES,
  ORCHESTRATION_COMMENT_MODES,
  ORCHESTRATION_PRESENTATION_MODES,
  RECONCILIATION_BACKMERGE_MODES,
  RECONCILIATION_CLEANUP_MODES,
  RECONCILIATION_ISSUE_COMPLETION_MODES,
  RECONCILIATION_PR_MODES,
  RECONCILIATION_STRATEGIES,
  parseDeploymentEnum,
  validateDeploymentConfiguration,
  type DeploymentConfigurationValues,
} from "../domain/deployment_configuration";
import { INPUT_KEYS } from "../application/contracts/input_keys";
import { parseMergeQueueCheckAttestations } from "../domain/merge_queue_readiness";

export interface DeploymentBranchInputContext {
  readonly productionBranch: string;
  readonly developmentBranch: string;
  readonly releaseTree: string;
  readonly hotfixTree: string;
}

export function readDeploymentConfiguration(
  getInput: (key: string) => unknown,
  branches: DeploymentBranchInputContext,
): DeploymentConfigurationValues {
  const errors: string[] = [];
  const readEnum = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const parsed = parseDeploymentEnum(getInput(key), allowed, fallback);
    if (!parsed.valid) errors.push(`${key} must be one of: ${allowed.join(", ")}.`);
    return parsed.value;
  };
  const mergeQueueCheckAttestations = parseMergeQueueCheckAttestations(
    getInput(INPUT_KEYS.MERGE_QUEUE_CHECK_ATTESTATIONS),
  );
  errors.push(...mergeQueueCheckAttestations.errors);
  const configuration: DeploymentConfigurationValues = {
    releaseReconciliationStrategy: readEnum(
      INPUT_KEYS.RELEASE_RECONCILIATION_STRATEGY,
      RECONCILIATION_STRATEGIES,
      DEFAULT_DEPLOYMENT_CONFIGURATION.releaseReconciliationStrategy,
    ),
    hotfixReconciliationStrategy: readEnum(
      INPUT_KEYS.HOTFIX_RECONCILIATION_STRATEGY,
      RECONCILIATION_STRATEGIES,
      DEFAULT_DEPLOYMENT_CONFIGURATION.hotfixReconciliationStrategy,
    ),
    reconciliationPullRequestMode: readEnum(
      INPUT_KEYS.RECONCILIATION_PR_MODE,
      RECONCILIATION_PR_MODES,
      DEFAULT_DEPLOYMENT_CONFIGURATION.reconciliationPullRequestMode,
    ),
    reconciliationBackmergeMode: readEnum(
      INPUT_KEYS.RECONCILIATION_BACKMERGE_MODE,
      RECONCILIATION_BACKMERGE_MODES,
      DEFAULT_DEPLOYMENT_CONFIGURATION.reconciliationBackmergeMode,
    ),
    hotfixActiveReleasePolicy: readEnum(
      INPUT_KEYS.HOTFIX_ACTIVE_RELEASE_POLICY,
      HOTFIX_ACTIVE_RELEASE_POLICIES,
      DEFAULT_DEPLOYMENT_CONFIGURATION.hotfixActiveReleasePolicy,
    ),
    reconciliationTree: String(getInput(INPUT_KEYS.RECONCILIATION_TREE)
      ?? DEFAULT_DEPLOYMENT_CONFIGURATION.reconciliationTree).trim()
      || DEFAULT_DEPLOYMENT_CONFIGURATION.reconciliationTree,
    reconciliationCleanup: readEnum(
      INPUT_KEYS.RECONCILIATION_CLEANUP,
      RECONCILIATION_CLEANUP_MODES,
      DEFAULT_DEPLOYMENT_CONFIGURATION.reconciliationCleanup,
    ),
    reconciliationIssueCompletion: readEnum(
      INPUT_KEYS.RECONCILIATION_ISSUE_COMPLETION,
      RECONCILIATION_ISSUE_COMPLETION_MODES,
      DEFAULT_DEPLOYMENT_CONFIGURATION.reconciliationIssueCompletion,
    ),
    orchestrationPresentationMode: readEnum(
      INPUT_KEYS.ORCHESTRATION_PRESENTATION_MODE,
      ORCHESTRATION_PRESENTATION_MODES,
      DEFAULT_DEPLOYMENT_CONFIGURATION.orchestrationPresentationMode,
    ),
    orchestrationDiagrams: readBoolean(
      getInput(INPUT_KEYS.ORCHESTRATION_DIAGRAMS),
      DEFAULT_DEPLOYMENT_CONFIGURATION.orchestrationDiagrams,
      INPUT_KEYS.ORCHESTRATION_DIAGRAMS,
      errors,
    ),
    orchestrationCommentMode: readEnum(
      INPUT_KEYS.ORCHESTRATION_COMMENT_MODE,
      ORCHESTRATION_COMMENT_MODES,
      DEFAULT_DEPLOYMENT_CONFIGURATION.orchestrationCommentMode,
    ),
    mergeQueueCheckAttestations: mergeQueueCheckAttestations.value,
  };
  errors.push(...validateDeploymentConfiguration(configuration, {
    productionBranch: branches.productionBranch || "master",
    developmentBranch: branches.developmentBranch || "develop",
    releaseTree: branches.releaseTree || "release",
    hotfixTree: branches.hotfixTree || "hotfix",
  }));
  if (errors.length > 0) {
    throw new ApplicationError("configuration.invalid", `Invalid deployment configuration: ${errors.join(" ")}`);
  }
  return configuration;
}

function readBoolean(value: unknown, fallback: boolean, name: string, errors: string[]): boolean {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  errors.push(`${name} must be true or false.`);
  return fallback;
}
