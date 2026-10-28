import { JSDOM } from 'jsdom';
import { vi } from 'vitest';
import { GITHUB_FIXTURE } from './github.ts';

export function githubDom(url = 'https://github.com/octo/example/issues/42') {
    const dom = new JSDOM(GITHUB_FIXTURE, { url, pretendToBeVisual: true });
    vi.stubGlobal('MutationObserver', dom.window.MutationObserver); vi.stubGlobal('Element', dom.window.Element);
    return { dom, window: dom.window as unknown as Window, document: dom.window.document };
}
