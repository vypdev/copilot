// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import HelperSamplePanel from '../../src/presentation/HelperSamplePanel.svelte';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { helperCopy } from '../../src/domain/helper_copy.ts';
import { historyCopy } from '../../src/domain/history_copy.ts';
import type { HelperSampleView } from '../../src/domain/helper_sample_view.ts';

it('an unavailable capture-time format stays unknown while a sampled held helper without a reason is not inferred healthy', async () => {
    const target = document.createElement('div'); document.body.append(target); const center = centerCopy('en', 'en');
    const view: HelperSampleView = { phase: 'ready', value: { state: 'sample', capturedAt: 8_650_000_000_000_000, health: { blocked: ['runtime-health'], events: [] }, retention: [] } };
    const read = vi.fn(); const component = mount(HelperSamplePanel, { target, props: { view, center, read, available: false } }); flushSync();
    expect(target.textContent).toContain(historyCopy('en').text.timeUnavailable); expect(target.textContent).toContain(helperCopy('en').helpers['runtime-health']); expect(target.textContent).not.toContain(helperCopy('en').noneBlocked);
    expect(target.querySelector('time')).toBeNull(); expect(target.querySelector('button')?.disabled).toBe(true); expect(target.querySelector('dl')).toBeNull(); await unmount(component); target.remove();
});
