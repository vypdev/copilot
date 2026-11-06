import type { Settings } from '../domain/settings.ts';
import { loadSettings } from '../domain/settings.ts';
import { portableSettings } from '../domain/portable_settings.ts';
/** File bodies are bounded and validated outside the presentation model. */
export async function readCenterImport(document: Document): Promise<Settings | null> {
    const input = document.querySelector<HTMLInputElement>('#center-import');
    const file = input?.files?.length === 1 ? input.files[0] : null;
    if (input) input.value = '';
    if (!file || file.size === 0 || file.size > 65536) return null;
    try {
        const buffer = await file.arrayBuffer();
        if (buffer.byteLength !== file.size || buffer.byteLength > 65536) return null;
        const result = loadSettings(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer)));
        return result.state === 'ready' ? result.settings : null;
    } catch { return null; }
}
/** Export the closed current Settings object only, never storage envelopes or native session values. */
export function downloadCenterSettings(document: Document, settings: Settings | null): boolean {
    const portable = portableSettings(settings);
    if (!portable) return false;
    let url: string | undefined;
    try {
        const blob = new Blob([JSON.stringify(portable)], { type: 'application/json;charset=utf-8' });
        url = URL.createObjectURL(blob);
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'copilot-preferences.json';
        anchor.hidden = true; document.body.append(anchor);
        try { anchor.click(); } finally { anchor.remove(); }
        return true;
    } catch { return false; }
    finally { if (url) setTimeout(() => URL.revokeObjectURL(url!), 0); }
}
