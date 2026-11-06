import type { SettingsOperationOutcome } from './settings_result.ts';
import type { CenterPlan } from './center_reply.ts';
import type { ClientReview } from './center_client_view.ts';

export const uncertainSettingsOutcome = (): SettingsOperationOutcome =>
    ({ state: 'unknown', acknowledgement: 'unknown', observedRevision: null, observation: 'unavailable' });
export function publicSettingsReview(plan: CenterPlan, state: ClientReview['state'], outcome?: SettingsOperationOutcome): ClientReview {
    const { operationId: _id, state: _state, ...view } = plan;
    return { ...view, state, ...(outcome ? { outcome } : {}) };
}
