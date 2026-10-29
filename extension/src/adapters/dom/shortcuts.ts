import type { FeatureController, ResourceScope, RuntimeContext } from '../../application/runtime_ports.ts';
import { shortcutCommand, type CenterCommand } from '../../domain/shortcuts.ts';
import type { ShortcutsCopy } from '../../domain/shortcuts_copy.ts';
import { nativeAccessKeyConflict, protectedShortcutTarget, shortcutAltGraph } from './shortcut_context.ts';

export function mountShortcuts(context: RuntimeContext, scope: ResourceScope, window: Window, document: Document,
    open: (command: CenterCommand) => Promise<boolean>, copy: ShortcutsCopy): FeatureController {
    let composing = false; let pending = false; let status: HTMLParagraphElement | null = null;
    const feedback = (text: string) => {
        if (!scope.current()) return;
        if (!status) { status = document.createElement('p'); status.dataset.copilotShortcutStatus = '1'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); }
        status.textContent = text; if (!status.isConnected) document.querySelector('main')?.append(status);
    };
    const keydown = (event: KeyboardEvent) => {
        try {
            if (!scope.current() || pending || !event.isTrusted || event.defaultPrevented || event.repeat || composing
                || event.isComposing || event.keyCode === 229 || !context.settings.shortcuts || context.paused
                || window.location.href !== context.page.route
                || !context.settings.features['BEX-CENTER-07'] || document.visibilityState !== 'visible' || !document.hasFocus()
                || protectedShortcutTarget(document, event)) return;
            const command = shortcutCommand(context.settings.bindings, { key: event.key, code: event.code, trusted: event.isTrusted,
                prevented: event.defaultPrevented, repeat: event.repeat, composing: false, altGraph: shortcutAltGraph(window, event),
                alt: event.altKey, shift: event.shiftKey, control: event.ctrlKey, meta: event.metaKey });
            if (!command) return;
            const conflict = nativeAccessKeyConflict(document, event.code.slice(3), event.key);
            if (conflict !== 'clear') { feedback(conflict === 'conflict' ? copy.conflict : copy.unavailable); return; }
            event.preventDefault(); pending = true; feedback(copy.opening);
            const run = async () => {
                try { feedback(await open(command) ? copy.opened : copy.unknown); }
                catch { feedback(copy.unknown); }
                finally { pending = false; }
            };
            void run();
        } catch { /* Closed or uninspectable native contexts leave the event untouched. */ }
    };
    const start = (event: Event) => { if (event.isTrusted) composing = true; }; const end = (event: Event) => { if (event.isTrusted) composing = false; };
    window.addEventListener('keydown', keydown); window.addEventListener('compositionstart', start); window.addEventListener('compositionend', end); window.addEventListener('blur', end);
    scope.own(() => { window.removeEventListener('keydown', keydown); window.removeEventListener('compositionstart', start);
        window.removeEventListener('compositionend', end); window.removeEventListener('blur', end); status?.remove(); });
    return { refresh() {}, dispose() {} };
}
