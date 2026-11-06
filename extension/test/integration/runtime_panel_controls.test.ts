import { afterEach, expect, it, vi } from 'vitest';
import { mountRuntimePanel, type RuntimePanelViewState } from '../../src/adapters/dom/runtime_panel.ts';
import { BrowserResourceScope } from '../../src/adapters/browser/resource_scope.ts';
import { runtimePanelCopy } from '../fixtures/runtime_panel.ts';
import { githubDom } from '../fixtures/dom.ts';
import { browserFixture } from '../fixtures/browser.ts';
import { context } from '../fixtures/runtime.ts';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const state: RuntimePanelViewState = { target: 'inspect', explanationOpen: true, featuresOpen: true, technicalOpen: true };
function fixture(checking = false, valid = () => true, inspect = vi.fn()) {
    const dom = githubDom(); const native = browserFixture(); const scope = new BrowserResourceScope(valid); stops.push(() => { scope.dispose(); dom.dom.window.close(); });
    const controller = mountRuntimePanel(context(), scope, native.api, dom.document, { ...runtimePanelCopy(), checking }, () => 'state', () => ({ viewer: 'octo', repositoryId: '7' }), inspect);
    const button = dom.document.querySelector<HTMLButtonElement>('[data-copilot-inspect-configuration]')!;
    return { ...dom, ...native, scope, controller, button, inspect };
}
it.each(['checking', 'retired', 'duplicate'] as const)('a %s local inspection event cannot enqueue another request even when dispatched directly', kind => {
    let valid = true; const h = fixture(kind === 'checking', () => valid);
    if (kind === 'retired') valid = false;
    if (kind === 'duplicate') h.button.click();
    h.button.dispatchEvent(new h.dom.window.MouseEvent('click')); expect(h.inspect).toHaveBeenCalledTimes(kind === 'duplicate' ? 1 : 0); expect(h.api.runtime.sendMessage).not.toHaveBeenCalled();
});
it.each([true, false])('a local inspection dispatch failure with current=%s restores only its own current control and never retries', current => {
    let valid = true; const inspect = vi.fn(() => { valid = current; throw new Error('PRIVATE dispatch failure'); }); const h = fixture(false, () => valid, inspect);
    h.button.click(); expect(inspect).toHaveBeenCalledOnce(); expect(h.button.disabled).toBe(!current);
    expect(h.document.querySelector('[role=status]')!.textContent).toBe(current ? runtimePanelCopy().unavailable : runtimePanelCopy().standalone); expect(h.document.body.textContent).not.toContain('PRIVATE');
});
it('a detached panel cannot supply or restore view state and a retired scope cannot move native focus', () => {
    const h = fixture(); const editor = h.document.querySelector('textarea')!; editor.focus();
    h.document.querySelector('[data-copilot-runtime]')!.remove(); expect(h.controller.captureViewState()).toBeNull(); h.controller.restoreViewState(state); expect(h.document.activeElement).toBe(editor);
    h.controller.refresh(); h.scope.dispose(); h.controller.restoreViewState(state); expect(h.document.activeElement).toBe(editor);
});
it('an explicitly focused owned heading is retained and a failed owned focus target falls back to that heading', () => {
    const h = fixture(); const heading = h.document.querySelector<HTMLElement>('[data-copilot-runtime] h2')!; heading.focus(); expect(h.controller.captureViewState()?.target).toBe('heading');
    h.document.querySelector('textarea')!.focus(); vi.spyOn(h.button, 'focus').mockImplementation(() => undefined); h.controller.restoreViewState(state); expect(h.document.activeElement).toBe(heading);
});
it.each(['missing-anchor', 'foreign-lookalike'] as const)('a %s produces no owned restoration capability and never focuses an existing page node', kind => {
    const dom = githubDom(); const native = browserFixture(); const scope = new BrowserResourceScope(() => true); stops.push(() => { scope.dispose(); dom.dom.window.close(); });
    const editor = dom.document.querySelector('textarea')!;
    if (kind === 'missing-anchor') dom.document.querySelector('main')!.replaceWith(editor);
    else { const lookalike = dom.document.createElement('section'); lookalike.dataset.copilotRuntime = '1'; dom.document.querySelector('main')!.append(lookalike); }
    editor.focus(); const controller = mountRuntimePanel(context(), scope, native.api, dom.document, runtimePanelCopy(), () => '', () => ({ viewer: null, repositoryId: '' }), vi.fn());
    expect(controller.captureViewState()).toBeNull(); controller.restoreViewState(state); controller.refresh(); controller.dispose(); expect(dom.document.activeElement).toBe(editor); expect(native.api.runtime.sendMessage).not.toHaveBeenCalled();
});
