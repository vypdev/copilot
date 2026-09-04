import type { AgentProvider, AgentTask } from './agent';
import type { PullRequestDescriptionMode } from './pull_request_description';
export type SetupFeature = 'issues' | 'pullRequests' | 'commits' | 'issueComments' | 'pullRequestComments' | 'release' | 'hotfix' | 'agentProvisioning' | 'credentialHealth' | 'inactiveIssueClosure' | 'issueTemplates' | 'pullRequestTemplate';
export interface SetupFeatures {
    [feature: string]: boolean;
}
export interface SetupAgentRoleConfiguration {
    provider: AgentProvider;
    modelProvider: string;
    model: string;
    effort?: string;
}
export type SetupAgentConfiguration = Record<AgentTask, SetupAgentRoleConfiguration>;
export interface SetupRepositoryConfiguration {
    mainBranch: string;
    developmentBranch: string;
    featureTree: string;
    bugfixTree: string;
    hotfixTree: string;
    releaseTree: string;
    docsTree: string;
    choreTree: string;
    branchManagementAlways: boolean;
    reopenIssueOnPush: boolean;
    desiredAssigneesCount: number;
    desiredReviewersCount: number;
    mergeTimeout: number;
    inactivityThresholdHours: number;
    issueLocale: string;
    pullRequestLocale: string;
    commitPrefixTransforms: string;
}
export interface SetupAiConfiguration {
    pullRequestDescription: boolean;
    /** Optional for backwards-compatible setup files created before v3.3.0. */
    pullRequestDescriptionMode?: PullRequestDescriptionMode;
    ignoreFiles: string;
    membersOnly: boolean;
    includeReasoning: boolean;
    bugbotSeverity: 'info' | 'low' | 'medium' | 'high';
    bugbotCommentLimit: number;
    bugbotFixVerifyCommands: string;
    provisioningMode: 'auto' | 'always' | 'disabled';
}
export interface SetupProjectConfiguration {
    ids: string;
    issueCreatedColumn: string;
    pullRequestCreatedColumn: string;
    issueInProgressColumn: string;
    pullRequestInProgressColumn: string;
}
export interface SetupConfiguration {
    features: SetupFeatures;
    agents: SetupAgentConfiguration;
    repository: SetupRepositoryConfiguration;
    ai: SetupAiConfiguration;
    projects: SetupProjectConfiguration;
    createInitialTag: boolean;
    manageRepositoryVariables: boolean;
    /** Whether setup should provision repository secrets after validating them. */
    manageRepositorySecrets: boolean;
    /** Extra non-secret action inputs accepted by config files for advanced use cases. */
    actionInputs: Record<string, string>;
    /** Independent storage policies for non-sensitive variables and secrets. */
    storage: SetupStorageConfiguration;
}
export type SetupResourceScope = 'repository' | 'organization';
export type SetupOrganizationVisibility = 'all' | 'private' | 'selected';
export interface SetupResourceStoragePolicy {
    defaultScope: SetupResourceScope;
    organizationVisibility: SetupOrganizationVisibility;
    /** Keep an already-effective resource instead of creating a shadowing override. */
    preserveExisting: boolean;
    /** Per-resource exceptions for mixed repository/organization configurations. */
    overrides: Record<string, SetupResourceScope>;
}
export interface SetupResourceTarget {
    scope: SetupResourceScope;
    organizationVisibility: SetupOrganizationVisibility;
    repositoryId?: number;
}
export interface SetupStorageConfiguration {
    secrets: SetupResourceStoragePolicy;
    variables: SetupResourceStoragePolicy;
}
export type SetupCredentialKind = 'workflowPat' | 'apiKey';
export type SetupCredentialStatus = 'valid' | 'invalid' | 'missing' | 'unverifiable' | 'not_required';
/** A credential requirement is metadata only; never put a secret value in this object. */
export interface SetupCredentialRequirement {
    name: string;
    kind: SetupCredentialKind;
    description: string;
    provider?: string;
    model?: string;
}
export interface SetupCredentialCheck {
    name: string;
    status: SetupCredentialStatus;
    message: string;
    account?: string;
    sourceScope?: SetupResourceScope;
}
export interface SetupCredentialValue {
    name: string;
    value: string;
}
export type SetupCredentialDecision = 'keep' | 'replace' | 'skip';
export interface SetupCredentialCollection {
    workflowPat?: SetupCredentialValue;
    apiKeys: SetupCredentialValue[];
}
export type SetupOwnerType = 'User' | 'Organization' | 'Unknown';
export type SetupRepositoryVisibility = 'public' | 'private' | 'internal' | 'unknown';
export interface SetupRemoteConfiguration {
    ownerType: SetupOwnerType;
    repositoryId?: number;
    repositoryVisibility: SetupRepositoryVisibility;
    repositorySecrets: readonly string[];
    organizationSecrets: readonly string[];
    repositoryVariables: readonly SetupVariable[];
    organizationVariables: readonly SetupVariable[];
    organizationAccess: 'available' | 'unavailable' | 'not_applicable' | 'unknown';
    organizationSecretsAccess: 'available' | 'unavailable' | 'not_applicable' | 'unknown';
    organizationVariablesAccess: 'available' | 'unavailable' | 'not_applicable' | 'unknown';
}
export interface SetupWorkflowComparison {
    file: string;
    destination: string;
    status: 'missing' | 'unchanged' | 'changed' | 'unmanaged';
}
export type DoctorCheckStatus = 'pass' | 'warn' | 'fail';
export interface DoctorCheck {
    area: string;
    status: DoctorCheckStatus;
    message: string;
}
export interface SetupVariable {
    name: string;
    value: string;
}
export interface SetupPlan {
    configuration: SetupConfiguration;
    workflowFiles: string[];
    issueTemplateFiles: string[];
    selectedFiles: string[];
    variables: SetupVariable[];
    requiredSecrets: string[];
    credentialRequirements: SetupCredentialRequirement[];
    warnings: string[];
}
