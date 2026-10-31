export type CenterFrameFingerprint = (value: object) => Promise<string | null>;

/** Native SHA-256; only its digest survives the bounded transport window. */
export const centerFrameFingerprint: CenterFrameFingerprint = async value => {
    try {
        const text = centerFrameText(value);
        if (text === null) return null;
        const bytes = new TextEncoder().encode(text);
        try {
            const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
            return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        } finally { bytes.fill(0); }
    } catch { return null; }
};
import { centerFrameText } from '../../domain/center_delivery.ts';

