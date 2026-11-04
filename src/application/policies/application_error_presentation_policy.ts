import { BUGBOT_REVIEW_RESOURCE_LABELS, BUGBOT_REVIEW_UNIT_LABELS } from './bugbot_review_diagnostic_labels';
import { progressInventoryPresentation } from '../../domain/progress_inventory_diagnostic';
import { progressPartitionLengthPresentation } from '../../domain/progress_partition_length_failure';
import { progressBinaryEvidencePresentation } from '../../domain/progress_binary_evidence_diagnostic';
import { issueWorkflowDiagnosticPresentation } from '../../domain/issue_workflow_diagnostic';
import { isCopilotCommandValidationReason } from '../../domain/copilot_command_validation';
import { commandValidationPresentationVariables } from './comment_command_validation_presentation_policy';
import type {
    ApplicationErrorCode,
    ApplicationErrorRecovery,
} from '../../data/model/application_error';
import {
    readEnglishApplicationErrorMessage,
    type ApplicationErrorMessageReader,
} from './application_error_message_catalog';

// This trusted destination is inserted after localization, never supplied by a body or translation.
const STORED_CONFIGURATION_RECOVERY_URL = 'https://docs.page/vypdev/copilot/security-operations/operations/troubleshooting#unsupported-stored-configuration';
const BRANCH_SYNC_CATALOG_RECOVERY_URL = 'https://docs.page/vypdev/copilot/security-operations/operations/troubleshooting#branch-sync-catalog-compatibility';
const BRANCH_SYNC_PUBLICATION_RECOVERY_URL = 'https://docs.page/vypdev/copilot/security-operations/operations/troubleshooting#branch-sync-workflow-write-recovery';

import { sourceContextDiagnostic } from '../../domain/agent_source_snapshot';
import { assignmentDiagnosticPresentation } from './issue_assignment_diagnostic_presentation';

export interface ApplicationErrorPresentation {
    readonly impact: string;
    readonly code: string;
    readonly action: string;
    readonly retainedState: string;
    readonly retryable: string;
    readonly reference: string;
}

export interface ApplicationErrorPresentationSource {
    readonly code: ApplicationErrorCode;
    readonly retryable: boolean;
    readonly correlationId: string;
    readonly recovery?: ApplicationErrorRecovery;
}

/** Shared semantic view model for terminal, GitHub, and API presentation. */
export function buildApplicationErrorPresentation(
    error: ApplicationErrorPresentationSource,
    message: ApplicationErrorMessageReader = readEnglishApplicationErrorMessage,
): ApplicationErrorPresentation {
    const descriptor = error.recovery
        ? `error.recovery.${error.recovery.id}` as const
        : `error.${error.code}` as const;
    const variables = error.recovery?.id === 'sdd-draft-response-too-short'
        ? { ...error.recovery.variables, observed: error.recovery.variables.observed === 'unavailable'
            ? message('error.label.draftLengthUnavailable') : error.recovery.variables.observed }
        : error.recovery?.id === 'issue-assignment-failed'
        ? assignmentDiagnosticPresentation(error.recovery.variables, error.code, message)
        : error.recovery?.id === 'sdd-source-context-unavailable'
        ? { ...sourceContextDiagnostic(error.recovery.variables) }
        : error.recovery?.id === 'progress-partition-length-invalid'
        ? progressPartitionLengthPresentation(error.recovery.variables)
        : error.recovery?.id === 'bugbot-review-incomplete'
        ? { ...error.recovery.variables, countKind: error.recovery.variables.countKind === 'at-least' ? '≥' : '=',
            resource: message(`error.label.${BUGBOT_REVIEW_RESOURCE_LABELS[error.recovery.variables.resource]}`),
            unit: message(`error.label.${BUGBOT_REVIEW_UNIT_LABELS[error.recovery.variables.unit]}`) }
        : error.recovery?.id === 'progress-inventory-incomplete'
        ? progressInventoryPresentation(error.recovery.variables)
        : error.recovery?.id === 'progress-binary-evidence-unavailable'
        ? progressBinaryEvidencePresentation(error.recovery.variables)
        : error.recovery?.id === 'issue-workflow-admission-blocked'
        ? issueWorkflowDiagnosticPresentation(error.recovery.variables)
        : error.recovery && isCopilotCommandValidationReason(error.recovery.id)
        ? commandValidationPresentationVariables(error.recovery.id, (error.recovery.variables as Readonly<Record<string, unknown>>).command)
        : error.recovery?.id === 'branch-sync-verification-failed'
        ? { ...error.recovery.variables, syncCommand: '/copilot sync-branch' }
        : error.recovery?.id === 'branch-sync-workflow-write-required' || error.recovery?.id === 'branch-sync-publication-failed'
        ? {
            reason: error.recovery.variables.reason, originalSha: error.recovery.variables.originalSha,
            candidateSha: error.recovery.variables.candidateSha, observedSha: error.recovery.variables.observedSha,
            pushStatus: message(error.recovery.variables.pushAttempted ? 'error.label.syncPushAttempted' : 'error.label.syncPushNotAttempted'),
            remoteStatus: message(error.recovery.variables.remoteState === 'unchanged' ? 'error.label.syncRemoteUnchanged'
                : error.recovery.variables.remoteState === 'changed' ? 'error.label.syncRemoteChanged' : 'error.label.syncRemoteUnverified'),
            publicationGuide: BRANCH_SYNC_PUBLICATION_RECOVERY_URL, syncCommand: '/copilot sync-branch',
        }
        : error.recovery?.id === 'branch-sync-catalog-incompatible'
        ? { ...error.recovery.variables, syncCommand: '/copilot sync-branch', catalogGuide: BRANCH_SYNC_CATALOG_RECOVERY_URL }
        : error.recovery?.id.startsWith('stored-configuration-')
        ? { ...error.recovery.variables, recoveryGuide: STORED_CONFIGURATION_RECOVERY_URL }
        : error.recovery?.variables;
    return {
        impact: message(`${descriptor}.impact`, variables),
        code: error.code,
        action: message(`${descriptor}.action`, variables),
        retainedState: message(`${descriptor}.retainedState`, variables),
        retryable: message(error.retryable ? 'error.label.yes' : 'error.label.no'),
        reference: error.correlationId,
    };
}

export function renderApplicationErrorText(
    error: ApplicationErrorPresentationSource,
    message: ApplicationErrorMessageReader = readEnglishApplicationErrorMessage,
): string {
    const view = buildApplicationErrorPresentation(error, message);
    return [
        `${message('error.label.impact')}: ${view.impact}`,
        `${message('error.label.errorCode')}: ${view.code}`,
        `${message('error.label.action')}: ${view.action}`,
        `${message('error.label.retainedState')}: ${view.retainedState}`,
        `${message('error.label.retryable')}: ${view.retryable}`,
        `${message('error.label.reference')}: ${view.reference}`,
    ].join('\n');
}

/** Renders the same safe semantic failure as compact GitHub Markdown. */
export function renderApplicationErrorMarkdown(
    error: ApplicationErrorPresentationSource,
    message: ApplicationErrorMessageReader = readEnglishApplicationErrorMessage,
): string {
    const view = buildApplicationErrorPresentation(error, message);
    return [
        `> **${message('error.label.impact')}:** ${view.impact}`,
        '',
        `**${message('error.label.action')}:** ${view.action}`,
        '',
        `**${message('error.label.retainedState')}:** ${view.retainedState}`,
        '',
        `**${message('error.label.errorCode')}:** \`${view.code}\``,
        '',
        `**${message('error.label.retryable')}:** ${view.retryable}`,
        '',
        `**${message('error.label.reference')}:** \`${view.reference}\``,
    ].join('\n');
}
