import { vi } from 'vitest';
import { JournalReviews } from '../../src/application/journal_reviews.ts';
import { SettingsRepository, SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { decideJournal, type JournalCommand, type JournalResult } from '../../src/domain/local_journal.ts';
import type { JournalKind } from '../../src/domain/journal_facts.ts';
import type { JournalClearPreview } from '../../src/domain/journal_clear.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { memoryStore } from './runtime.ts';
import { NOW, saved, destination } from './local_journal.ts';

export const JOURNAL_OWNER = 'a'.repeat(32);
export function journalReviewsFixture() {
    const memory = memoryStore(); const settings = new SettingsRepository(memory.port);
    const documents = new Map<JournalKind, unknown>([['diagnostics', saved()], ['recents', saved('recents', destination)]]);
    const execute = vi.fn(async (kind: JournalKind, command: JournalCommand, eligible?: () => boolean): Promise<JournalResult> => {
        if (eligible && !eligible()) return { state: 'stale' };
        const decision = decideJournal(kind, documents.get(kind), command);
        if (decision.write) documents.set(kind, structuredClone(decision.write));
        return decision.result;
    });
    let now = NOW; let counter = 0; let controllerEpoch = 0; let credentialEpoch = 0; let leaseCurrent = true;
    const lease = { current: vi.fn(() => leaseCurrent), release: vi.fn() };
    const ports = { now: vi.fn(() => now), identifier: vi.fn(() => (++counter).toString(16).padStart(32, '0')),
        fence: vi.fn((owner: string) => owner === JOURNAL_OWNER ? { controllerEpoch, credentialEpoch } : null),
        idle: vi.fn(() => true), pausedPolicyRevision: vi.fn((): number | null => 0), reserve: vi.fn(() => lease) };
    const store = { execute }; const reviews = new JournalReviews(store, settings, ports);
    return { ...memory, get: vi.mocked(memory.port.get), settings, documents, store, ports, lease, reviews, setTime: (value: number) => { now = value; },
        takeover: () => { controllerEpoch++; }, disconnect: () => { credentialEpoch++; }, retireLease: () => { leaseCurrent = false; },
        privacy: (diagnostics: boolean, recents = false, revision = 1) => {
            memory.values.set(SETTINGS_KEY, { ...DEFAULT_SETTINGS, revision, center: { ...DEFAULT_SETTINGS.center, diagnostics, recents } });
        } };
}
export async function clearPreview(fixture: ReturnType<typeof journalReviewsFixture>, kind: JournalKind = 'diagnostics') {
    const preview = await fixture.reviews.preview(kind, JOURNAL_OWNER);
    if (preview.state !== 'preview') throw new Error(`missing-preview:${preview.state}`);
    return preview as Extract<JournalClearPreview, { state: 'preview' }>;
}
