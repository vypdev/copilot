import { CENTER_CHANNEL_CAPACITY } from './center_channel.ts';
import { natural, record } from './value.ts';

/** JSON object ordering is irrelevant; scalar values and array ordering are retained. */
export function centerFrameText(value: unknown): string | null {
    try {
        const text = JSON.stringify(value, (_key, entry: unknown) => record(entry)
            ? Object.fromEntries(Object.keys(entry).sort().map(key => [key, entry[key]])) : entry);
        return typeof text === 'string' ? text : null;
    } catch { return null; }
}

export type DeliveryDecision = 'new' | 'duplicate' | 'conflict' | 'invalid';
/** Per-native-source fingerprints only: never retains frames, credentials or replies. */
export class CenterDeliveryWindow {
    private readonly fingerprints = new Map<number, string>();
    observe(sequence: unknown, fingerprint: unknown): DeliveryDecision {
        if (!natural(sequence) || sequence === 0 || typeof fingerprint !== 'string'
            || !/^[a-f0-9]{64}$(?![\s\S])/u.test(fingerprint)) return 'invalid';
        const previous = this.fingerprints.get(sequence);
        if (previous !== undefined) return previous === fingerprint ? 'duplicate' : 'conflict';
        if (this.fingerprints.size >= CENTER_CHANNEL_CAPACITY) this.fingerprints.delete(this.fingerprints.keys().next().value!);
        this.fingerprints.set(sequence, fingerprint); return 'new';
    }
    clear(): void { this.fingerprints.clear(); }
}
