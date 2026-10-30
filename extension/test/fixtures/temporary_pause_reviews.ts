import { vi } from 'vitest';
import { TemporaryPauseReviews } from '../../src/application/temporary_pause_reviews.ts';
import type { NativePauseTarget } from '../../src/application/temporary_pause_review_ports.ts';
import { centerFixture } from './center.ts';
import { temporaryStoreFixture } from './temporary_pause_store.ts';
import type { PauseReviewPlan } from '../../src/domain/temporary_pause_review.ts';

export const PAUSE = { type: 'emergency', paused: true } as const;
export const TAB_PAUSE = { type: 'tab', tabId: 7, paused: true } as const;
export function pauseReviewsFixture() {
    const native = temporaryStoreFixture(); const center = centerFixture();
    const reviewPorts = { now: center.ports.now, identifier: center.ports.identifier, fence: vi.fn((id: string) => center.controller.fence(id)),
        target: vi.fn(async (tabId: number): Promise<NativePauseTarget | null> => ({ tabId, source: 'https://github.com/octo/example/issues/42', label: 'octo/example · #42' })) };
    const reviews = new TemporaryPauseReviews(native.store, reviewPorts);
    center.ports.changed.mockImplementation(() => { center.operations.invalidate(); reviews.invalidate(); });
    const owner = center.open();
    return { ...native, center, reviewPorts, reviews, owner,
        preview: (intent: unknown = PAUSE, revision = 0) => reviews.preview(intent, owner.clientId, revision),
        confirm: (plan: PauseReviewPlan) => reviews.confirm(plan.operationId, plan.revision, owner.clientId),
        cancel: (plan: PauseReviewPlan) => reviews.cancel(plan.operationId, plan.revision, owner.clientId),
        result: (plan: PauseReviewPlan) => reviews.inspect(plan.operationId, plan.revision, owner.clientId) };
}
export async function pausePlan(h: ReturnType<typeof pauseReviewsFixture>, intent: unknown = PAUSE, revision = 0): Promise<PauseReviewPlan> {
    const value = await h.preview(intent, revision); if (value.state !== 'preview') throw new Error(`missing preview:${value.state}`); return value;
}
