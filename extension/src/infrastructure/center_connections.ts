import type { BrowserApi } from '../adapters/browser/api.ts';
import type { CenterClient } from '../application/center_client.ts';
import type { ConnectionActions } from '../domain/connection_ui.ts';

/** Native form values remain unbound; no reusable credential becomes a Svelte view value. */
export function connectionActions(api: BrowserApi, document: Document, client: CenterClient,
    current: () => boolean, dirty: (value: boolean) => void): ConnectionActions {
    return { dirty, refresh: () => { if (current()) void client.connections(); },
        change: (intent, revision) => {
            if (!current()) return;
            if (intent.type === 'disconnect' || intent.type === 'revoke-all') {
                const field = document.querySelector<HTMLInputElement>('#connection-secret');
                if (field) field.value = '';
            }
            return client.connections(intent, revision);
        },
        connect: form => {
            if (!current() || !(form instanceof document.defaultView!.HTMLFormElement)) return;
            const sessions = client.view.connections;
            if (sessions?.state !== 'ready') { (form.elements.namedItem('secret') as HTMLInputElement).value = ''; return; }
            const revision = sessions.revision;
            void client.connections(async () => {
                const secret = form.elements.namedItem('secret') as HTMLInputElement;
                // Must be the first browser API call inside this explicit submit gesture.
                let permission: Promise<boolean>;
                try { permission = api.permissions.request({ origins: ['https://api.github.com/*'] }); }
                catch (error) { secret.value = ''; throw error; }
                const value = secret.value; secret.value = '';
                const name = (form.elements.namedItem('name') as HTMLInputElement).value.trim();
                const repository = (form.elements.namedItem('repository') as HTMLInputElement).value.trim();
                if (!await permission || !current()) return null;
                return { type: 'connect', name, repository, secret: value };
            }, revision).then(observedRevision => {
                if (current() && observedRevision !== null && observedRevision > revision) { form.reset(); dirty(false); }
            });
        } };
}
