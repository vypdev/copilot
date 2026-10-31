// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { centerFrame, type CenterFrame } from '../../src/domain/center_frame.ts';
import { prepareCenterRecoveryFocus, subscribeCenterRecoveryFocus } from '../../src/infrastructure/center_recovery_focus.ts';

beforeEach(() => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
function fixture() {
    const root = document.createElement('div');
    root.innerHTML = '<nav><a href="#help">Help</a></nav><main><h1 tabindex="-1">Appearance</h1>'
        + '<select id="theme"><option>Theme</option></select><input id="other">'
        + '<button id="center-read-settings">Read current settings</button></main>';
    document.body.append(root);
    const theme = root.querySelector<HTMLSelectElement>('#theme')!;
    const read = root.querySelector<HTMLButtonElement>('#center-read-settings')!;
    theme.focus(); const focus = vi.spyOn(read, 'focus');
    return { root, theme, read, focus };
}
it('ignores an absent host before its DOM exists', () => {
    expect(prepareCenterRecoveryFocus(undefined)).toBeNull();
});
it('ignores an unavailable active element', () => {
    const f = fixture(); vi.spyOn(document, 'activeElement', 'get').mockReturnValue(null);
    expect(prepareCenterRecoveryFocus(f.root)).toBeNull();
});
it('ignores a host whose main region has already disappeared', () => {
    const f = fixture(); f.root.querySelector('main')!.remove();
    expect(prepareCenterRecoveryFocus(f.root)).toBeNull();
});
it('does not capture another foreground document’s focus', () => {
    const f = fixture(); vi.mocked(document.hasFocus).mockReturnValue(false);
    expect(prepareCenterRecoveryFocus(f.root)).toBeNull();
});
it('does not capture a hidden document', () => {
    const f = fixture(); vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    expect(prepareCenterRecoveryFocus(f.root)).toBeNull();
});
it('leaves a navigation link under the user’s control', () => {
    const f = fixture(); f.root.querySelector<HTMLAnchorElement>('a')!.focus();
    expect(prepareCenterRecoveryFocus(f.root)).toBeNull();
});
it('preserves an explicitly focused page heading', () => {
    const f = fixture(); f.root.querySelector<HTMLHeadingElement>('h1')!.focus();
    expect(prepareCenterRecoveryFocus(f.root)).toBeNull();
});
it('does not treat an already disabled retained element as a new retirement', () => {
    const f = fixture(); f.theme.disabled = true;
    expect(prepareCenterRecoveryFocus(f.root)).toBeNull();
});
it('does not focus after its host unmounts', () => {
    const f = fixture(); const restore = prepareCenterRecoveryFocus(f.root)!;
    f.root.remove(); restore(); expect(f.focus).not.toHaveBeenCalled();
});
it('does not steal focus when the user changes foreground application before render completion', () => {
    const f = fixture(); const restore = prepareCenterRecoveryFocus(f.root)!;
    f.theme.disabled = true; vi.mocked(document.hasFocus).mockReturnValue(false);
    restore(); expect(f.focus).not.toHaveBeenCalled();
});
it('does not focus when the document becomes hidden before render completion', () => {
    const f = fixture(); const restore = prepareCenterRecoveryFocus(f.root)!;
    f.theme.disabled = true; vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    restore(); expect(f.focus).not.toHaveBeenCalled();
});
it('does not overwrite a newer user focus choice', () => {
    const f = fixture(); const restore = prepareCenterRecoveryFocus(f.root)!;
    f.theme.disabled = true; const other = f.root.querySelector<HTMLInputElement>('#other')!; other.focus();
    restore(); expect(document.activeElement).toBe(other); expect(f.focus).not.toHaveBeenCalled();
});
it('leaves a control alone when the current render keeps it enabled', () => {
    const f = fixture(); const restore = prepareCenterRecoveryFocus(f.root)!;
    restore(); expect(document.activeElement).toBe(f.theme); expect(f.focus).not.toHaveBeenCalled();
});
it('does not invent a target when the explicit recovery action is absent', () => {
    const f = fixture(); const restore = prepareCenterRecoveryFocus(f.root)!;
    f.theme.disabled = true; f.read.remove(); restore(); expect(f.focus).not.toHaveBeenCalled();
});
it('does not focus a recovery action that is still busy', () => {
    const f = fixture(); const restore = prepareCenterRecoveryFocus(f.root)!;
    f.theme.disabled = true; f.read.disabled = true; restore(); expect(f.focus).not.toHaveBeenCalled();
});
it('restores a disabled control’s lost native focus without activating the recovery action', () => {
    const f = fixture(); const restore = prepareCenterRecoveryFocus(f.root)!; const click = vi.fn();
    f.read.addEventListener('click', click); f.theme.blur(); f.theme.disabled = true;
    expect(document.activeElement).toBe(document.body); restore();
    expect(document.activeElement).toBe(f.read); expect(click).not.toHaveBeenCalled();
});
it('restores focus when the previously focused control is removed by recovery', () => {
    const f = fixture(); const restore = prepareCenterRecoveryFocus(f.root)!;
    f.theme.remove(); restore(); expect(document.activeElement).toBe(f.read);
});

function deliveryFixture(f: ReturnType<typeof fixture>) {
    const frame = (issue: 'unavailable' | null = null, route: 'appearance' | 'help' = 'appearance', phase: 'ready' | 'reading' | 'loading' = 'ready', role: 'editor' | 'observer' = 'editor') =>
        centerFrame({ phase, role, data: null, review: null, issue }, { route }, null, 'en');
    let receive: (value: CenterFrame) => void = () => undefined;
    const unsubscribe = vi.fn();
    const stop = subscribeCenterRecoveryFocus({ initial: frame(), subscribe: listener => {
        receive = listener; listener(frame()); return unsubscribe;
    } }, () => f.root, value => {
        const disabled = value.client.issue === 'unavailable' || value.client.phase !== 'ready' || value.client.role === 'observer';
        // Model the native browser's lost active element; jsdom alone retains disabled focus.
        if (disabled && !f.theme.disabled) f.theme.blur();
        f.theme.disabled = disabled;
        if (value.location.route === 'help') f.theme.remove();
    });
    return { emit: (issue: 'unavailable' | null, route?: 'appearance' | 'help', phase?: 'ready' | 'reading' | 'loading', role?: 'editor' | 'observer') => receive(frame(issue, route, phase, role)), stop, unsubscribe };
}
it('captures before a native read disables the control and carries that same handoff into a later disconnect', async () => {
    const f = fixture(); const owner = deliveryFixture(f);
    owner.emit(null, undefined, 'reading'); f.theme.remove(); await tick();
    expect(f.focus).not.toHaveBeenCalled();
    owner.emit('unavailable'); await tick();
    expect(document.activeElement).toBe(f.read); expect(f.focus).toHaveBeenCalledOnce(); owner.stop();
});
it('retains one pending handoff while recovery is busy and completes it only on another native frame', async () => {
    const f = fixture(); const owner = deliveryFixture(f); f.read.disabled = true;
    owner.emit('unavailable'); f.theme.remove(); await tick();
    expect(f.focus).not.toHaveBeenCalled(); expect(document.activeElement).toBe(document.body);
    f.read.disabled = false; owner.emit('unavailable'); await tick();
    expect(document.activeElement).toBe(f.read); expect(f.focus).toHaveBeenCalledOnce(); owner.stop();
});
it('retires a queued handoff when a fresh successful observation arrives before rendering settles', async () => {
    const f = fixture(); const owner = deliveryFixture(f);
    owner.emit('unavailable'); f.theme.remove(); owner.emit(null); await tick();
    expect(f.focus).not.toHaveBeenCalled(); owner.stop();
});
it('does not carry the previous route’s recovery focus into a newly selected route', async () => {
    const f = fixture(); const owner = deliveryFixture(f);
    owner.emit('unavailable'); owner.emit('unavailable', 'help'); await tick();
    expect(f.focus).not.toHaveBeenCalled(); owner.stop();
});
it('retires a queued handoff and the actual surface subscription on teardown', async () => {
    const f = fixture(); const owner = deliveryFixture(f);
    owner.emit('unavailable'); f.theme.remove(); owner.stop(); await tick();
    expect(f.focus).not.toHaveBeenCalled(); expect(owner.unsubscribe).toHaveBeenCalledOnce();
});
it('restores the original surviving control when a successful native read re-enables it', async () => {
    const f = fixture(); const owner = deliveryFixture(f);
    owner.emit(null, undefined, 'reading'); await tick(); expect(document.activeElement).toBe(document.body);
    owner.emit(null); await tick(); expect(document.activeElement).toBe(f.theme); expect(f.focus).not.toHaveBeenCalled(); owner.stop();
});
it('retires the pending editor focus when a fresh observation establishes another editing owner', async () => {
    const f = fixture(); const owner = deliveryFixture(f);
    owner.emit(null, undefined, 'reading'); owner.emit(null, undefined, 'ready', 'observer'); await tick();
    expect(document.activeElement).toBe(document.body); expect(f.focus).not.toHaveBeenCalled(); owner.stop();
});
it('does not deliver an older ready frame while another native read is still pending', async () => {
    const f = fixture(); const owner = deliveryFixture(f);
    owner.emit(null, undefined, 'reading'); owner.emit(null); owner.emit(null, undefined, 'reading'); await tick();
    expect(document.activeElement).toBe(document.body);
    owner.emit('unavailable'); await tick(); expect(document.activeElement).toBe(f.read); owner.stop();
});
it('waits for the surviving editor control to become available after a successful observation', async () => {
    const f = fixture(); const owner = deliveryFixture(f);
    owner.emit(null, undefined, 'reading'); owner.emit(null); f.theme.disabled = true; await tick();
    expect(document.activeElement).toBe(document.body);
    owner.emit(null); await tick(); expect(document.activeElement).toBe(f.theme); owner.stop();
});
it('preserves a focused recovery action across its explicit new native opening', async () => {
    const f = fixture(); const owner = deliveryFixture(f); f.read.focus();
    owner.emit(null, undefined, 'loading'); f.read.blur(); f.read.disabled = true; await tick();
    expect(document.activeElement).toBe(document.body);
    f.read.disabled = false; owner.emit(null); await tick(); expect(document.activeElement).toBe(f.read); owner.stop();
});
