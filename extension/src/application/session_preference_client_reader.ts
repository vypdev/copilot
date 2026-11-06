import { decodeSessionPreferenceRead } from '../domain/session_preference_reply.ts';
import type { SessionPreferenceRead } from '../domain/session_preference_read.ts';
import type { SessionPreferenceRequest } from '../domain/session_preference_request.ts';
import { ScopedMetadataReader } from './scoped_metadata_reader.ts';

export interface SessionPreferenceReaderPorts { request(input: SessionPreferenceRequest): Promise<unknown>; canRead(): boolean; changed(): void }
/** Separate instance and revision cursor; an inspection of preferences cannot inspect or release the pause owner. */
export class SessionPreferenceClientReader extends ScopedMetadataReader<SessionPreferenceRead> {
    constructor(ports: SessionPreferenceReaderPorts) {
        super({ request: () => ports.request({ method: 'center.session-preferences.read' }), canRead: () => ports.canRead(), changed: () => ports.changed(),
            decode: decodeSessionPreferenceRead, revision: data => data.loaded.state === 'ready' ? data.loaded.value.revision : null });
    }
}
