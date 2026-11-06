import { expect, it, vi } from 'vitest';
import { NativePage, type PageCommand } from '../../tooling/webdriver_page.mts';

// Isolated wire fakes verify the public adapter, never loaded-browser acceptance.
const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
function fixture() {
    const command = vi.fn<PageCommand>(async (method, route) => {
        if (route === '/element') return { [ELEMENT]: 'control/ref' };
        if (route.endsWith('/element')) return { [ELEMENT]: 'option/ref' };
        if (route.endsWith('/name')) return 'select';
        if (route === '/window/handles') return ['fixture', 'settings'];
        if (route === '/window/new') return { handle: 'new-view', type: 'tab' };
        if (route === '/screenshot') return png.toString('base64');
        return method === 'DELETE' ? ['fixture'] : null;
    });
    return { command, page: new NativePage(command) };
}
it('click resolves an exact CSS reference and encodes its opaque native ID without injecting an event', async () => {
    const h = fixture(); await h.page.click('#center-theme');
    expect(h.command.mock.calls).toEqual([
        ['POST', '/element', { using: 'css selector', value: '#center-theme' }],
        ['POST', '/element/control%2Fref/click', {}],
    ]);
});
it('fill clears the native element before sending unchanged Unicode and multiline input, including an explicit empty value', async () => {
    const h = fixture(); await h.page.fill('#profile-name', 'Work 🧪\nlabel'); await h.page.fill('#profile-name', '');
    expect(h.command.mock.calls.slice(0, 3)).toEqual([
        ['POST', '/element', { using: 'css selector', value: '#profile-name' }],
        ['POST', '/element/control%2Fref/clear', {}], ['POST', '/element/control%2Fref/value', { text: 'Work 🧪\nlabel' }],
    ]);
    expect(h.command.mock.calls.at(-1)).toEqual(['POST', '/element/control%2Fref/value', { text: '' }]);
});
it('native keyboard input preserves WebDriver key tokens and never clears the current draft first', async () => {
    const h = fixture(); await h.page.keys('body', '\uE004\uE007');
    expect(h.command.mock.calls.at(-1)).toEqual(['POST', '/element/control%2Fref/value', { text: '\uE004\uE007' }]);
    expect(h.command.mock.calls.some(([, route]) => route.endsWith('/clear'))).toBe(false);
});
it('select checks the native tag and clicks an exact descendant option with escaped quotes/backslashes, including inheritance', async () => {
    const h = fixture(); await h.page.select('#profile-choice', 'a"b\\c'); await h.page.select('#profile-choice', '');
    expect(h.command.mock.calls.slice(0, 4)).toEqual([
        ['POST', '/element', { using: 'css selector', value: '#profile-choice' }], ['GET', '/element/control%2Fref/name'],
        ['POST', '/element/control%2Fref/element', { using: 'css selector', value: 'option[value="a\\"b\\\\c"]' }],
        ['POST', '/element/option%2Fref/click', {}],
    ]);
    expect(h.command.mock.calls.at(-2)?.[2]).toEqual({ using: 'css selector', value: 'option[value=""]' });
});
it('invalid selectors fail before contacting the browser without reflecting their content', async () => {
    const h = fixture();
    for (const selector of [null, 42, '', '  ', 'a'.repeat(1001), '#private\n', '#private\0', '#private\u007f']) {
        await expect(h.page.click(selector as string)).rejects.toThrow('webdriver:page:invalid-selector');
    }
    expect(h.command).not.toHaveBeenCalled();
});
it('input, keyboard and option bounds reject malformed values before any lookup or side effect', async () => {
    const h = fixture();
    for (const value of [null, 1, 'x'.repeat(4097), 'private\0']) {
        await expect(h.page.fill('#input', value as string)).rejects.toThrow('invalid-input');
        await expect(h.page.keys('#input', value as string)).rejects.toThrow('invalid-keys');
    }
    await expect(h.page.keys('#input', '')).rejects.toThrow('invalid-keys');
    for (const value of [null, 1, 'x'.repeat(129), '\n', '\0', '\u007f']) {
        await expect(h.page.select('#input', value as string)).rejects.toThrow('invalid-option');
    }
    expect(h.command).not.toHaveBeenCalled();
});
it('malformed native element references cannot become click routes', async () => {
    for (const value of [null, [], {}, { [ELEMENT]: 1 }, { [ELEMENT]: '' }, { [ELEMENT]: 'x'.repeat(513) },
        { [ELEMENT]: 'private\n' }, { [ELEMENT]: '\uD800' }, { [ELEMENT]: 'valid', extra: 'private' }]) {
        const h = fixture(); h.command.mockResolvedValueOnce(value);
        await expect(h.page.click('#input')).rejects.toThrow('invalid-element'); expect(h.command).toHaveBeenCalledTimes(1);
    }
    const unicode = fixture(); unicode.command.mockResolvedValueOnce({ [ELEMENT]: 'owned🧪/reference' }); await unicode.page.click('#input');
    expect(unicode.command.mock.calls.at(-1)?.[1]).toBe('/element/owned%F0%9F%A7%AA%2Freference/click');
});
it('select refuses a different native form type and malformed option identity before any click', async () => {
    const h = fixture(); h.command.mockResolvedValueOnce({ [ELEMENT]: 'valid' }).mockResolvedValueOnce('input');
    await expect(h.page.select('#input', 'dark')).rejects.toThrow('not-select'); expect(h.command).toHaveBeenCalledTimes(2);
    const option = fixture(); option.command.mockResolvedValueOnce({ [ELEMENT]: 'valid' }).mockResolvedValueOnce('select').mockResolvedValueOnce({});
    await expect(option.page.select('#input', 'dark')).rejects.toThrow('invalid-element'); expect(option.command).toHaveBeenCalledTimes(3);
});
it('window snapshots are bounded, immutable and only an observed owned handle can be activated', async () => {
    const h = fixture(); const handles = await h.page.windows(); expect(handles).toEqual(['fixture', 'settings']); expect(Object.isFrozen(handles)).toBe(true);
    await h.page.activate('settings'); expect(h.command.mock.calls.at(-1)).toEqual(['POST', '/window', { handle: 'settings' }]);
    await expect(h.page.activate('foreign')).rejects.toThrow('unknown-window');
    const before = h.command.mock.calls.length; await expect(h.page.activate('\n')).rejects.toThrow('unknown-window');
    expect(h.command).toHaveBeenCalledTimes(before);
});
it('malformed, duplicate, empty or excessive native handle sets cannot establish a usable window', async () => {
    for (const value of [null, {}, [], Array.from({ length: 17 }, (_, i) => String(i)), ['x', 'x'], [1], [''], ['x'.repeat(513)], ['private\n'], ['\uD800']]) {
        const h = fixture(); h.command.mockResolvedValueOnce(value); await expect(h.page.windows()).rejects.toThrow('invalid-windows');
    }
});
it('new views expose the actual documented tab or window result without pretending the hint guaranteed a tab', async () => {
    for (const type of ['tab', 'window']) {
        const h = fixture(); h.command.mockResolvedValueOnce({ handle: 'view', type }); const view = await h.page.newView();
        expect(view).toEqual({ handle: 'view', type }); expect(Object.isFrozen(view)).toBe(true);
        expect(h.command).toHaveBeenCalledExactlyOnceWith('POST', '/window/new', { type: 'tab' });
    }
});
it('malformed new-view results cannot authorize a context switch', async () => {
    for (const value of [null, [], {}, { handle: 'view' }, { handle: 'view', type: 'frame' },
        { handle: '', type: 'tab' }, { handle: 'view', type: 'tab', extra: true }]) {
        const h = fixture(); h.command.mockResolvedValueOnce(value); await expect(h.page.newView()).rejects.toThrow('invalid-new-window');
    }
});
it('closing a view preserves a cleanup anchor and refuses to close the last owned window', async () => {
    const h = fixture(); await h.page.closeView(); expect(h.command.mock.calls.at(-1)).toEqual(['DELETE', '/window']);
    h.command.mockResolvedValueOnce(['only-view']); const before = h.command.mock.calls.length;
    await expect(h.page.closeView()).rejects.toThrow('last-window'); expect(h.command).toHaveBeenCalledTimes(before + 1);
});
it('rectangle requests accept their closed bounds but never substitute them for a measured CSS viewport', async () => {
    const h = fixture(); await h.page.resize(320, 240); await h.page.resize(3840, 2160);
    expect(h.command.mock.calls).toEqual([['POST', '/window/rect', { width: 320, height: 240 }], ['POST', '/window/rect', { width: 3840, height: 2160 }]]);
    for (const [width, height] of [[NaN, 500], [500, NaN], [319, 500], [3841, 500], [500, 239], [500, 2161], [500.5, 500]]) {
        await expect(h.page.resize(width, height)).rejects.toThrow('invalid-rectangle');
    }
    expect(h.command).toHaveBeenCalledTimes(2);
});
it('screenshots decode only bounded canonical base64 with a PNG transport signature; rendering remains a separate check', async () => {
    const h = fixture(); expect(await h.page.screenshot()).toEqual(png);
    for (const value of [null, '', 'A'.repeat(12 * 1024 * 1024 + 1), 'A', '!!!=', 'AAAA\n===', 'AB==', Buffer.from('not a PNG').toString('base64')]) {
        h.command.mockResolvedValueOnce(value); await expect(h.page.screenshot()).rejects.toThrow(/invalid-(?:screenshot|png)/u);
    }
    const large = Buffer.alloc(8 * 1024 * 1024 + 1); png.copy(large);
    h.command.mockResolvedValueOnce(large.toString('base64')); await expect(h.page.screenshot()).rejects.toThrow('invalid-png');
});
it('native failures stop immediately without script fallback, repeated input, automatic retry or another context', async () => {
    const h = fixture(); h.command.mockRejectedValueOnce(new Error('native click failure'));
    await expect(h.page.click('#input')).rejects.toThrow('native click failure'); expect(h.command).toHaveBeenCalledTimes(1);
    h.command.mockResolvedValueOnce({ [ELEMENT]: 'input' }).mockRejectedValueOnce(new Error('clear failed'));
    await expect(h.page.fill('#input', 'local')).rejects.toThrow('clear failed'); expect(h.command).toHaveBeenCalledTimes(3);
});
it('exact selector, text, option, identity and context-count maxima remain usable without truncation', async () => {
    const h = fixture(); h.command.mockResolvedValueOnce({ [ELEMENT]: 'x'.repeat(512) });
    await h.page.click('a'.repeat(1000)); expect(h.command.mock.calls[0][2]).toEqual({ using: 'css selector', value: 'a'.repeat(1000) });
    expect(h.command.mock.calls[1][1]).toBe(`/element/${'x'.repeat(512)}/click`);
    await h.page.fill('#input', 'x'.repeat(4096)); expect(h.command.mock.calls.at(-1)?.[2]).toEqual({ text: 'x'.repeat(4096) });
    await h.page.select('#input', 'x'.repeat(128)); expect(h.command.mock.calls.at(-2)?.[2]).toEqual({ using: 'css selector', value: `option[value="${'x'.repeat(128)}"]` });
    const handles = Array.from({ length: 16 }, (_, i) => String(i)); h.command.mockResolvedValueOnce(handles); expect(await h.page.windows()).toEqual(handles);
});
