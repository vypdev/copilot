import type { SetupJourneyView } from '../policies/setup_journey_policy';
import type { SetupQuestion, SetupQuestionnaireProgress } from '../../domain/setup_questionnaire';
export type { SetupApprovalCheckCandidate, SetupProjectCandidate, SetupDiscoveryStatus } from '../../domain/setup_questionnaire';
export type { SetupQuestion } from '../../domain/setup_questionnaire';
export type { SetupFeature } from '../../domain/setup';
import type { SetupTokenPermissionReport, SetupTokenPermissionRequirement, SetupTokenRole } from '../../domain/setup_token_permissions';
import type { SetupCredentialStatus } from '../../domain/setup';

export interface SetupQuestionExplanation {
  readonly label: string;
  readonly summary: string;
  readonly when: string;
  readonly where: string;
  readonly how: string;
  readonly why: string;
  readonly example: string;
  readonly effect: string;
  readonly verify: string;
  readonly documentation: { readonly title: string; readonly url: string };
}

export type SetupQuestionPresentation = Readonly<Record<'en' | 'es' | 'fr' | 'pt', SetupQuestionExplanation>>;

export type WebSetupPromptCopyId =
  | 'repository.confirm' | 'setup.depth' | 'setup.environmentPat' | 'plan.review' | 'workflow.update'
  | 'setupPat.method' | 'setupPat.ownerKind' | 'setupPat.review' | 'setupPat.entry'
  | 'setupPat.confirmAccount' | 'setupPat.confirmUnverifiedAccess' | 'botPat.method' | 'botPat.login'
  | 'botPat.entry.guided' | 'botPat.entry.manual' | 'credential.apiKey'
  | 'credential.existing' | 'apply.confirm';

export interface WebSetupPromptCopyRef {
  readonly copyId?: WebSetupPromptCopyId;
  readonly copyValues?: Readonly<Record<string, string>>;
}

export type WebSetupMessageCopyId =
  | 'session.controlMoved' | 'session.cancelled' | 'plan.ready' | 'permission.preview'
  | 'setupPat.corrected.bootstrap' | 'setupPat.corrected.final' | 'setupPat.cleanup'
  | 'botPat.separation' | 'credential.checks'
  | 'credential.status.valid' | 'credential.status.invalid' | 'credential.status.missing'
  | 'credential.status.unverifiable' | 'credential.status.not_required'
  | 'validation.producers' | 'validation.duplicateNames' | 'validation.number' | 'validation.boolean'
  | 'validation.choice' | 'validation.projectStatusVerified' | 'validation.projectStatusRedo'
  | 'validation.unknownResource' | 'validation.unknownWorkflow' | 'validation.firstQuestion'
  | 'validation.duplicateProducer' | 'validation.savedStatus' | 'validation.projectIncompatible'
  | 'validation.projectLimit' | 'validation.projectOwnerNeeded' | 'validation.projectOwnerMismatch'
  | 'validation.projectUrl' | 'validation.projectNumber' | 'validation.projectNumberRange'
  | 'validation.projectDuplicate' | 'validation.unknown'
  | 'validation.fixedIssues' | 'validation.fixedWorkflowEnabled' | 'validation.fixedWorkflowDisabled';

export type WebSetupPrompt =
  | ({ kind: 'question'; title: string; question: SetupQuestion; presentation?: SetupQuestionPresentation; phase: string; pass: number;
      progress?: SetupQuestionnaireProgress; canGoBack?: boolean } & WebSetupPromptCopyRef)
  | ({ kind: 'choice'; title: string; description?: string; choices: readonly string[]; defaultValue?: string } & WebSetupPromptCopyRef)
  | ({ kind: 'text' | 'secret'; title: string; description?: string; optional?: boolean; link?: string } & WebSetupPromptCopyRef)
  | ({ kind: 'confirm'; title: string; description?: string; choices: readonly string[] } & WebSetupPromptCopyRef)
  | ({ kind: 'plan'; title: string; plan: WebSetupPlan; editGroups?: readonly SetupQuestion['stateId'][] } & WebSetupPromptCopyRef);

export interface WebSetupPlan {
  readonly presentationDefaults: readonly { readonly group: string; readonly count: number }[];
  readonly decisions: {
    readonly enabledCapabilities: readonly string[];
    readonly agentRouting: readonly { readonly role: string; readonly provider: string; readonly modelProvider: string; readonly model: string }[];
    readonly issueWorkflows: readonly string[];
    readonly productionBranch: string;
    readonly developmentBranch: string;
    readonly approvalMode: string;
    readonly trustedChecks: readonly { readonly name: string; readonly sourceAppId: number; readonly workflowName: string }[];
    readonly producerAttested: boolean;
    readonly coverageMode: string;
    readonly coverageCheck: string;
    readonly coverageMinimum?: number;
    readonly coverageArtifactWorkflow?: string;
    readonly coverageReporterAttested?: boolean;
    readonly projectNumbers: readonly string[];
    readonly projectStatuses: readonly { readonly transition: string; readonly value: string }[];
    readonly variableScope: string;
    readonly secretScope: string;
    readonly initialTag: boolean;
  };
  readonly files: readonly string[];
  readonly workflows: readonly string[];
  readonly variables: readonly string[];
  readonly secrets: readonly string[];
  readonly warnings: readonly string[];
}

export interface WebSetupView {
  readonly revision: number;
  readonly promptRevision?: number;
  readonly repository: string;
  readonly journey?: SetupJourneyView;
  readonly prompt?: WebSetupPrompt;
  readonly message?: { tone: 'info' | 'success' | 'warning' | 'error'; text: string; link?: string;
    copyId?: WebSetupMessageCopyId; copyValues?: Readonly<Record<string, string>>;
    credentialChecks?: readonly { readonly name: string; readonly status: SetupCredentialStatus }[] };
  readonly permissions?: { role: SetupTokenRole; requirements?: readonly SetupTokenPermissionRequirement[]; report?: SetupTokenPermissionReport };
  readonly outcome?: 'complete' | 'partial' | 'blocked' | 'cancelled' | 'dry-run';
  readonly doctor?: { readonly status: 'running' | 'complete' | 'failed'; readonly healthy?: boolean;
    readonly pass?: number; readonly warn?: number; readonly fail?: number; readonly skipped?: number };
  readonly resultDetail?: {
    readonly reasonCode: 'permissions' | 'storage' | 'configuration' | 'session-expired' | 'cancelled' | 'provider' | 'rate-limit' | 'unknown';
    readonly stoppedStage: string;
    readonly mutationStarted: boolean;
    readonly diagnosticRef?: string;
    readonly effects?: readonly { readonly id: string; readonly state: 'completed' | 'skipped' | 'needs-inspection' | 'not-started' | 'in-progress'; readonly scope?: 'local' | 'repository' | 'organization' | 'mixed' }[];
  };
}
