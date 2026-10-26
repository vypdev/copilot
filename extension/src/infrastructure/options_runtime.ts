import type { BrowserApi } from '../adapters/browser/api.ts';
import { record } from '../domain/value.ts';
import { runtimeCopy, statusText } from '../presentation/runtime_copy.ts';

export function startOptions(api: BrowserApi, document: Document, language: string): () => void {
    const copy = runtimeCopy(language);
    const text = (id: string, value: string) => { document.getElementById(id)!.textContent = value; };
    for (const [id, value] of Object.entries({ title: copy.title, scope: copy.scope, privacy: copy.privacy,
        'repository-label': copy.repository, 'credential-label': copy.credential, connect: copy.connect, disconnect: copy.disconnect })) text(id, value);
    text('details-title', copy.details); text('build-identity', `SHA-256 ${document.documentElement.dataset.copilotSourceTree ?? 'unbundled'}`);
    document.documentElement.lang = language.split('-')[0];
    const form = document.getElementById('connection') as HTMLFormElement;
    const secret = document.getElementById('credential') as HTMLInputElement;
    const repository = document.getElementById('repository') as HTMLInputElement;
    const connect = document.getElementById('connect') as HTMLButtonElement;
    const disconnect = document.getElementById('disconnect') as HTMLButtonElement;
    let stopped = false; let operation = 0;
    const render = (response: unknown) => {
        if (stopped) return;
        const state = record(response) && typeof response.state === 'string' ? response.state : 'unavailable';
        text('status', state === 'connected' ? copy.connected : statusText(state, copy, record(response) ? response.retryAt : undefined));
        document.getElementById('status')!.dataset.state = state;
    };
    const submit = async (event: Event) => {
        event.preventDefault(); const current = ++operation;
        // Permission request is the first API operation in the explicit user gesture.
        const grant = api.permissions.request({ origins: ['https://api.github.com/*'] });
        const value = secret.value; secret.value = ''; connect.disabled = true; text('status', copy.pending);
        try {
            if (!await grant) { if (!stopped && current === operation) text('status', copy.grant); return; }
            if (stopped || current !== operation) return;
            const result = await api.runtime.sendMessage({ version: 1, method: 'session.connect', secret: value, repository: repository.value.trim() });
            if (current === operation) render(result);
        } catch { if (!stopped && current === operation) render(null); }
        finally { if (!stopped && current === operation) connect.disabled = false; }
    };
    const revoke = async () => {
        const current = ++operation; secret.value = ''; connect.disabled = false;
        try { const result = await api.runtime.sendMessage({ version: 1, method: 'session.disconnect' }); if (current === operation) render(result); }
        catch { if (!stopped && current === operation) render(null); }
    };
    const submitListener = (event: Event) => { void submit(event); };
    const revokeListener = () => { void revoke(); };
    form.addEventListener('submit', submitListener); disconnect.addEventListener('click', revokeListener);
    void api.runtime.sendMessage({ version: 1, method: 'session.status' }).then(result => { if (operation === 0) render(result); }, () => render(null));
    return () => { stopped = true; operation++; secret.value = ''; form.removeEventListener('submit', submitListener);
        disconnect.removeEventListener('click', revokeListener); };
}
