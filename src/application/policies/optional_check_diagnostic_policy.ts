import { canonicalGitObjectId } from '../../domain/git_object_id';
import type { CopilotEvidence } from '../ports/copilot_evidence_ports';
import { CopilotEvidencePublicationError } from '../ports/copilot_evidence_error';
import type { ActionSummaryMessageCatalog, ActionSummaryMessageId } from './action_summary_message_catalog';

export type EvidenceCredentialRoute = 'dedicated-evidence-token' | 'action-token-fallback';
const CAUSES = Object.freeze({
    'authorization.credential-invalid': 'optionalEvidenceCredentialInvalid',
    'authorization.denied': 'optionalEvidenceDenied',
    'provider.rate-limited': 'optionalEvidenceRateLimited',
    'provider.not-found': 'optionalEvidenceNotFound',
    'provider.contract-invalid': 'optionalEvidenceInvalidTarget',
    'provider.conflict': 'optionalEvidenceConflict',
    'provider.unavailable': 'optionalEvidenceUnavailable',
    unexpected: 'optionalEvidenceUnknown',
} as const);

/** No raw exception text is inspected here. An unadapted failure stays explicitly unknown. */
export function optionalCheckDiagnostic(evidence: CopilotEvidence, route: EvidenceCredentialRoute, error: unknown, catalog: ActionSummaryMessageCatalog): string {
    const failure = error instanceof CopilotEvidencePublicationError ? error : new CopilotEvidencePublicationError('unexpected');
    const name = ['Copilot / Plan', 'Copilot / Review', 'Copilot / Verification'].includes(evidence.name) ? evidence.name : catalog.message('summary.unavailable');
    const head = canonicalGitObjectId(evidence.headSha) ?? catalog.message('summary.unavailable');
    const action = failure.code.startsWith('authorization.') ? 'optionalEvidenceCredentialAction'
        : failure.code === 'provider.rate-limited' ? 'optionalEvidenceRateAction'
            : failure.code === 'provider.not-found' || failure.code === 'provider.contract-invalid' ? 'optionalEvidenceTargetAction' : 'optionalEvidenceInspectAction';
    const message = (key: string) => catalog.message(`summary.${key}` as ActionSummaryMessageId);
    const technical = `operation=checks.create; check=${name}; head=${head}; credential-route=${route}; error=${failure.code}; status=${failure.status ?? 'unavailable'}; request=${failure.providerReference ?? 'unavailable'}`;
    return [
        `### ${message('optionalEvidenceHeading')}`,
        message('optionalEvidenceImpact'), message(CAUSES[failure.code]), message(action), message('optionalEvidenceRetained'),
        `<details><summary>${message('optionalEvidenceTechnical')}</summary>`, '', `\`${technical}\``, '', '</details>',
    ].join('\n\n');
}
