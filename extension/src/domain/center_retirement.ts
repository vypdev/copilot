import type { ClientReview } from './center_client_view.ts';
import type { CenterIdentity, CenterPlan } from './center_reply.ts';
import type { CenterDocument } from './center_reply.ts';
import { sameSettingsContent } from './settings_operation.ts';
import { publicSettingsReview, uncertainSettingsOutcome } from './settings_review_projection.ts';

export interface SubmittedSettings { readonly plan: CenterPlan; readonly owner: CenterIdentity }
export function retiredCenterReview(review: ClientReview | null): ClientReview | null {
    if (review?.state === 'committing') return { ...review, state: 'unknown', outcome: uncertainSettingsOutcome() };
    return review?.state === 'preview' ? { ...review, state: 'stale' } : review;
}
/** Match the exact receipt and values; a fresh owner cannot make the old effect current. */
export function observedSubmittedSettings(submitted: SubmittedSettings | null, observation: CenterDocument): ClientReview | null {
    if (!submitted) return null;
    const { plan, owner } = submitted;
    if (!observation.settings || observation.lastOperation?.id !== plan.operationId || observation.lastOperation.beforeRevision !== plan.revision
        || !sameSettingsContent(observation.settings, { ...plan.after, revision: plan.revision + 1 })) return null;
    return publicSettingsReview(plan, 'saved', { state: 'committed', revision: observation.settings.revision, acknowledgement: 'unknown',
        current: observation.identity.controllerEpoch === owner.controllerEpoch && observation.identity.credentialEpoch === owner.credentialEpoch
            && observation.identity.clientId === owner.clientId });
}
