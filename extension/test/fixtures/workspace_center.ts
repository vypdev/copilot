import { flushSync } from 'svelte';
import { button, change, ready, render, save } from './center_app_dom.ts';
import { centerClientFixture } from './center_client.ts';
import { CONNECTION_INPUT, namedSessionsFixture } from './named_sessions.ts';
import { workspaceCopy } from '../../src/domain/workspace_copy.ts';
import { reviewCopy } from '../../src/domain/review_copy.ts';

export async function workspaceCenter(locale: 'en' | 'es' | 'fr' | 'pt' = 'en', initial?: unknown, observer = false) {
    const h = namedSessionsFixture(); await h.connections.change(CONNECTION_INPUT, 0, h.current);
    const app = await render('repositories/workspaces', observer, initial, initial === undefined, centerClientFixture(h.center), locale);
    const copy = workspaceCopy(locale); const review = reviewCopy(locale);
    if (initial === undefined) await ready(() => !!document.querySelector('[data-workspaces]'));
    return { ...h, app, copy, review, create: async (id = 'release', name = 'Release work', include = true) => {
        button(copy.create).click(); flushSync(); change('workspace-id', id); change('workspace-name', name);
        if (include) { await ready(() => !!document.querySelector('#workspace-member-session-1'), 'saved entry choice'); (document.querySelector('#workspace-member-session-1') as HTMLInputElement).click(); flushSync(); }
    }, preview: async () => { button(copy.review).click(); await ready(() => !!document.querySelector('#settings-review-heading'), 'workspace preview'); },
    confirm: save, state: async () => (await app.native.repository.read()).settings };
}
