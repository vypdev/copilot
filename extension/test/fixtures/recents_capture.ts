import { vi } from 'vitest';
import { RecentsCapture, type RecentsSource, type RecentsCapturePorts } from '../../src/application/recents_capture.ts';

export const RECENT_SOURCE: RecentsSource = { clientId: 'a'.repeat(32), controllerEpoch: 1, credentialEpoch: 1, documentId: 'document-one', tabId: 1 };
export function recentsCaptureFixture() {
    let live = true; let epoch: number | null = 0; let sequence = 0;
    const witness = { policyRevision: 1, current: vi.fn(() => live) };
    const ports = { admission: vi.fn(() => live ? witness : null), epoch: vi.fn(() => epoch), identifier: vi.fn(() => (++sequence).toString(16).padStart(32, '0')), admit: vi.fn<RecentsCapturePorts['admit']>(() => Object.freeze({})) };
    const producer = new RecentsCapture(ports); const current = vi.fn(() => true);
    const capture = (source = RECENT_SOURCE) => {
        const result = producer.capture(source, current); if (result.state !== 'ready' || !result.permit) throw new Error('capture-unavailable'); return result.permit;
    };
    return { producer, ports, witness, current, capture, active: (value: boolean) => { live = value; }, epoch: (value: number | null) => { epoch = value; } };
}
