import { backgroundCenterFixture } from './background_center.ts';
import { CONNECTION_INPUT } from './named_sessions.ts';

/** Native composition → private CenterClient envelope stripping; DTO fixtures are real emitter output. */
export async function sessionPreferenceReplyFixture() {
    const h = backgroundCenterFixture(); const client = await h.client(); await client.connections(CONNECTION_INPUT, 0);
    const read = await client.requestSessionPreferences({ method: 'center.session-preferences.read' });
    const preview = await client.requestSessionPreferences({ method: 'center.session-preferences.preview', expectedRevision: 0, intent: { type: 'replace', preferences: { density: 'compact', paused: true } } });
    if (read?.state !== 'ready' || preview?.state !== 'preview' || typeof preview.operationId !== 'string') throw new Error('fixture-native-preferences-unavailable');
    const result = await client.requestSessionPreferences({ method: 'center.session-preferences.confirm', expectedRevision: 0, operationId: preview.operationId });
    return { ...h, client, read, preview, result };
}
