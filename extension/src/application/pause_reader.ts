import { decodePauseControl } from '../domain/pause_reply.ts';
import type { PauseControlView } from '../domain/temporary_pause_controls.ts';
import type { PauseClientPorts } from './pause_client_ports.ts';
import { ScopedMetadataReader } from './scoped_metadata_reader.ts';

/** Native pause metadata keeps its own cursor, source lifetime and independent transport. */
export class PauseReader extends ScopedMetadataReader<PauseControlView> {
    constructor(ports: Pick<PauseClientPorts, 'request' | 'canRead' | 'changed'>) {
        super({ request: () => ports.request({ method: 'center.pauses.read' }), canRead: () => ports.canRead(), changed: () => ports.changed(),
            decode: decodePauseControl, revision: data => data.loaded.state === 'ready' ? data.loaded.value.revision : null });
    }
}
