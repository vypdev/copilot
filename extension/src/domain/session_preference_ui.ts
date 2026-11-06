import type { CenterCopy } from './center_copy_types.ts';
import type { SessionPreferenceClientView } from './session_preference_client_view.ts';
import type { SessionPreferenceReviewIntent } from './session_preference_review.ts';

export interface SessionPreferenceActions {
    read(): void; preview(intent: SessionPreferenceReviewIntent, revision: number): void;
    confirm(): void; cancel(): void; inspect(): void; dismiss(): void; dirty(value: boolean): void;
}
export interface SessionPreferenceRouteProps {
    context: { readonly center: CenterCopy; readonly view: SessionPreferenceClientView; readonly available: boolean; readonly editable: boolean };
    actions: SessionPreferenceActions;
}
