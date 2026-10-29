/** Read structural eligibility only, never a field value, draft or composition payload. */
export function protectedShortcutTarget(document: Document, event: KeyboardEvent): boolean {
    const Element = document.defaultView?.Element;
    if (!Element || document.designMode?.toLowerCase() === 'on' || !(event.target instanceof Element)) return true;
    const path = event.composedPath();
    if (!path.includes(event.target)) return true;
    for (const value of [...path, document.activeElement]) {
        if (!(value instanceof Element)) continue;
        if (value.ownerDocument !== document || value.closest('input,textarea,select,button,form,iframe,object,embed,[role="textbox"],[role="searchbox"],[role="combobox"]')) return true;
        const editable = value.closest('[contenteditable]');
        if (editable && editable.getAttribute('contenteditable')!.toLowerCase() !== 'false') return true;
        // Closed editors can retarget focus to ordinary hosts too. Only known page roots remain eligible.
        if (value === document.activeElement && value !== document.body && value !== document.documentElement
            && value !== document.querySelector('main')) return true;
    }
    return false;
}
export function nativeAccessKeyConflict(document: Document, letter: string, delivered = letter): 'clear' | 'conflict' | 'unknown' {
    try {
        const nodes = document.querySelectorAll('[accesskey]');
        if (nodes.length > 128) return 'unknown';
        for (const node of Array.from(nodes)) {
            const keys = node.getAttribute('accesskey')!.toLowerCase().split(/\s+/u);
            if (keys.includes(letter.toLowerCase()) || keys.includes(delivered.toLowerCase())) return 'conflict';
        }
        return 'clear';
    } catch { return 'unknown'; }
}
/** Firefox reports Option as AltGraph on Mac. This transient keyboard hint never authorizes an operation. */
export function shortcutAltGraph(window: Window, event: KeyboardEvent): boolean {
    try { return event.getModifierState('AltGraph') && !window.navigator.platform.startsWith('Mac'); }
    catch { return true; }
}
