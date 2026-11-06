import type { RuntimeConfiguration } from '../domain/runtime_configuration.ts';
import { runtimeCopy, statusText } from './runtime_copy.ts';
import { runtimeProvenanceCopy } from './runtime_provenance_copy.ts';

/** Local presentation only. Every connected request still passes native admission. */
export function runtimeAvailability(configuration: RuntimeConfiguration | null, pending: boolean, online: boolean, locale: string, now = Date.now()): Readonly<{ status: string; readable: boolean }> {
    const copy = runtimeCopy(locale);
    if (pending) return Object.freeze({ status: copy.pending, readable: false });
    if (!configuration) return Object.freeze({ status: copy.unavailable, readable: false });
    if (configuration.settings.paused) return Object.freeze({ status: runtimeProvenanceCopy(locale).restricted, readable: false });
    if (!online) return Object.freeze({ status: copy.offline, readable: false });
    if (configuration.connected) return Object.freeze({ status: copy.connected, readable: true });
    const connection = configuration.provenance.connection;
    return Object.freeze({ status: connection.state === 'connected' ? copy.scopeUnavailable : connection.state === 'disconnected' ? copy.standalone
        : statusText(connection.state, copy, connection.retryAt, now, locale), readable: false });
}
