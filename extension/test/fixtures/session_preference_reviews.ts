import { vi } from 'vitest';
import { namedSessionsFixture, CONNECTION_INPUT } from './named_sessions.ts';
import { memoryStore } from './runtime.ts';
import { SettingsRepository, SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { DEFAULT_SETTINGS, type Settings } from '../../src/domain/settings.ts';
import { SessionPreferencesStore } from '../../src/application/session_preferences_store.ts';
import { SessionPreferenceSources } from '../../src/application/session_preference_sources.ts';
import { SessionPreferenceReviews } from '../../src/application/session_preference_reviews.ts';
import type { SessionPreferenceReviewIntent } from '../../src/domain/session_preference_review.ts';

/** Actual application/store/source owners and deterministic controller/clock ports; no loaded-browser claim. */
export async function sessionPreferenceReviewsFixture(settings: Settings = DEFAULT_SETTINGS) {
    const h = namedSessionsFixture(); await h.connections.change(CONNECTION_INPUT, 0, h.current);
    const local = memoryStore(); local.values.set(SETTINGS_KEY, settings); const repository = new SettingsRepository(local.port);
    const changed = vi.fn(); const store = new SessionPreferencesStore(h.port, { protectedArea: async () => true, changed });
    const sources = new SessionPreferenceSources(repository, h.connections);
    const owner = 'a'.repeat(32); let editor = owner; let controllerEpoch = 1; let now = 100000; let nextId = 0;
    const ports = { now: vi.fn(() => now), identifier: vi.fn(() => (++nextId).toString(16).padStart(32, '0')),
        fence: vi.fn((id: string) => id === editor ? { controllerEpoch, credentialEpoch: h.service.status().epoch } : null),
        captureSource: vi.fn(() => sources.capture()), readSource: vi.fn((current: () => boolean) => sources.read(current)), reserveSettings: vi.fn(() => sources.reserve()) };
    const reviews = new SessionPreferenceReviews(store, ports);
    const preview = (intent: SessionPreferenceReviewIntent = { type: 'replace', preferences: { density: 'compact' } }, revision = 0) => reviews.preview(intent, owner, revision);
    const plan = async (intent?: SessionPreferenceReviewIntent, revision = 0) => { const value = await preview(intent, revision); if (value.state !== 'preview') throw new Error('fixture-preview:'+value.state); return value; };
    vi.mocked(h.reader.read).mockClear(); vi.mocked(h.port.set).mockClear();
    return { ...h, local, repository, store, sources, reviews, ports, owner, plan, preview, changed,
        advance: (ms: number) => { now += ms; }, takeover: () => { editor = 'b'.repeat(32); controllerEpoch++; },
        confirm: async () => { const value = await plan(); return reviews.confirm(value.operationId, value.revision, owner); } };
}
